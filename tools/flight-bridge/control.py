"""Local MAVSDK mission controller. Real hardware is telemetry-only in this release."""
import asyncio
import hashlib
import json
import math
import struct
import time


class Rejected(Exception):
    pass


def canonical(items):
    """Match mission data semantically, ignoring SDK sequence/current flags."""
    def finite(value):
        if isinstance(value, float) and math.isnan(value):
            return None
        # MAVLink mission parameters and z are IEEE-754 float32 on the wire.
        # Compare after the same rounding rather than rejecting valid decimals.
        rounded = struct.unpack("<f", struct.pack("<f", value))[0]
        return 0.0 if rounded == 0 else rounded
    return [
        [item.seq, item.frame, item.command, item.autocontinue,
         *[finite(getattr(item, key)) for key in ("param1", "param2", "param3", "param4")],
         item.x, item.y, finite(item.z), item.mission_type]
        for item in items
    ]


def digest(items):
    return hashlib.sha256(json.dumps(canonical(items), allow_nan=False).encode()).hexdigest()


class Controller:
    def __init__(self, drone, *, commands=False, mode="live", journal=None):
        self.drone = drone
        self.mode = mode
        self.commands = commands and mode == "sitl"
        self.journal = journal or (lambda event: None)
        self.lock = asyncio.Lock()
        self.values = {}
        self.times = {}
        self.connected = False
        self.epoch = 0
        self.verified = None
        self.uncertain = False
        self.requests = {}
        self.events = []
        self.items = None
        self.home = None

    def update(self, key, value):
        self.values[key] = value
        self.times[key] = time.monotonic()

    def connection(self, connected):
        if connected != self.connected:
            self.epoch += 1
            self.verified = None
            self.values.clear()
            self.times.clear()
        self.connected = connected

    def fresh(self, key):
        # MAVSDK emits some discrete state streams only on value changes.
        # They remain valid within a connected epoch, never across reconnects.
        if key in ("armed", "health", "inAir", "progress", "identity"):
            return self.connected and key in self.times
        return key in self.times and time.monotonic() - self.times[key] < 5

    def require_link(self):
        if not self.connected or not self.fresh("position") or not self.fresh("armed"):
            raise Rejected("Güncel cihaz bağlantısı, konum ve motor durumu gerekli.")
        point = self.values["position"]
        latitude, longitude = point.get("latitude"), point.get("longitude")
        if not (isinstance(latitude, (int, float)) and isinstance(longitude, (int, float))
                and math.isfinite(latitude) and math.isfinite(longitude)
                and -85 <= latitude <= 85 and -180 <= longitude <= 180):
            raise Rejected("Cihaz konumu geçerli bir koordinat içermiyor.")

    def healthy(self):
        required = ("gyro", "accelerometer", "magnetometer", "position", "home")
        return self.fresh("health") and all(self.values["health"].get(key) is True for key in required)

    def battery_ready(self):
        value = self.values.get("battery", {}).get("remainingPercent")
        return self.fresh("battery") and type(value) in (int, float) and math.isfinite(value) and 30 <= value <= 100

    def require_takeoff_location(self):
        if self.values.get("inAir") is not False or not self.fresh("inAir"):
            raise Rejected("Başlatma için cihazın yerde olduğu doğrulanmalı.")
        point = self.values["position"]
        if self.home is None:
            raise Rejected("Görevin kalkış referansı eksik.")
        latitude, longitude, altitude = self.home
        north = math.radians(point["latitude"] - latitude) * 6378137
        east = math.radians(point["longitude"] - longitude) * 6378137 * math.cos(math.radians(latitude))
        msl = point.get("altitudeMslM")
        if math.hypot(north, east) > 30 or not isinstance(msl, (int, float)) or not math.isfinite(msl) or abs(msl - altitude) > 20:
            raise Rejected("Cihazın konumu veya AMSL yüksekliği planın kalkış referansıyla uyuşmuyor.")

    def event(self, action, state, request_id):
        event = {"time": time.time(), "action": action, "state": state,
                 "epoch": self.epoch, "requestId": request_id,
                 "missionFingerprint": digest(self.items) if self.items else None}
        self.journal(event)  # A failed durable write prevents sending the command.
        self.events = (self.events + [event])[-100:]

    def snapshot(self):
        try:
            self.require_link()
            fresh = True
        except Rejected:
            fresh = False
        telemetry = {}
        for key, value in self.values.items():
            if not self.fresh(key):
                continue
            if isinstance(value, dict):
                value = {
                    name: None if isinstance(reading, float) and not math.isfinite(reading) else reading
                    for name, reading in value.items()
                }
            telemetry[key] = value
        return {
            "schema": 1, "mode": self.mode, "commandsEnabled": self.commands,
            "connected": fresh, "epoch": self.epoch,
            "verified": self.verified if fresh else None, "uncertain": self.uncertain,
            "telemetry": telemetry,
            "events": self.events,
        }

    async def read_matches(self):
        read = await self.drone.mission_raw.download_mission()
        if self.items is None or digest(read) != digest(self.items):
            self.verified = None
            raise Rejected("Cihazdaki görev hazırlanan görevle eşleşmiyor.")
        return read

    async def execute(self, request, item_factory):
        if not isinstance(request, dict):
            raise Rejected("İstek bir JSON nesnesi olmalı.")
        request_id = request.get("id")
        if not isinstance(request_id, str) or len(request_id) != 36:
            raise Rejected("Geçerli işlem kimliği gerekli.")
        body_hash = hashlib.sha256(json.dumps(request, sort_keys=True).encode()).hexdigest()
        async with self.lock:
            existing = self.requests.get(request_id)
            if existing:
                if existing["hash"] != body_hash:
                    raise Rejected("Aynı işlem kimliği farklı içerikle kullanılamaz.")
                return existing["result"]
            if len(self.requests) >= 2000:
                raise Rejected("Bu oturumun işlem sınırı doldu.")
            action = request.get("action")
            if action not in ("upload", "verify", "start", "pause", "rtl"):
                raise Rejected("Desteklenmeyen komut.")
            if not self.commands:
                raise Rejected("Bu bağlantı salt okunur. Komutlar yalnızca açıkça seçilen SITL oturumunda kullanılabilir.")
            if request.get("epoch") != self.epoch:
                raise Rejected("Bağlantı oturumu değişti. Cihazı yeniden kontrol et.")
            if request.get("confirmed") is not True:
                raise Rejected("Operatör onayı gerekli.")
            self.require_link()
            if self.uncertain and action not in ("verify", "pause", "rtl"):
                raise Rejected("Önce belirsiz işlemden sonra cihaz görevini yeniden doğrula.")
            if action in ("upload", "verify") and self.values.get("armed") is not False:
                raise Rejected("Görev aktarımı ve doğrulama için motorlar kapalı olmalı.")
            if action == "start":
                if not self.fresh("identity"):
                    raise Rejected("Başlatmadan önce cihaz kimliği ve yazılım sürümü alınmalı.")
                if not self.verified or request.get("fingerprint") != self.verified["fingerprint"]:
                    raise Rejected("Başlatmadan önce bu görev cihazdan geri okunarak doğrulanmalı.")
                if not self.healthy():
                    raise Rejected("Konum, kalkış noktası ve kalibrasyon kontrolleri hazır değil.")
                if self.values.get("armed") is not True:
                    raise Rejected("Motorları yer istasyonundan etkinleştir ve durumu kontrol et.")
                if not self.battery_ready():
                    raise Rejected("Başlatmak için güncel ve en az %30 batarya bilgisi gerekli.")
                self.require_takeoff_location()
            if action == "rtl" and (not self.fresh("health") or not self.values["health"].get("home")):
                raise Rejected("Eve dönüş için geçerli kalkış noktası gerekli.")
            prepared = validate_plan(request.get("plan"), item_factory) if action == "upload" else None
            result = {"ok": False, "action": action, "message": "İşlem sonucu belirsiz. Cihaz durumunu kontrol et."}
            self.event(action, "requested", request_id)
            self.requests[request_id] = {"hash": body_hash, "result": result}
            epoch = self.epoch
            try:
                async with asyncio.timeout(25):
                    if action == "upload":
                        self.verified = None
                        self.items = prepared
                        self.home = request["plan"]["mission"]["plannedHomePosition"]
                        await self.drone.mission_raw.upload_mission(self.items)
                        await self.read_matches()
                    elif action == "verify":
                        await self.read_matches()
                    elif action == "start":
                        await self.read_matches()
                        # Download may take seconds. Recheck immediately before sending start.
                        self.require_link()
                        if epoch != self.epoch or not self.healthy():
                            raise Rejected("Doğrulama sırasında cihaz durumu değişti.")
                        if self.values.get("armed") is not True:
                            raise Rejected("Motor durumu değişti.")
                        if not self.battery_ready():
                            raise Rejected("Batarya durumu değişti.")
                        self.require_takeoff_location()
                        await self.drone.mission_raw.start_mission()
                    elif action == "pause":
                        await self.drone.mission_raw.pause_mission()
                    else:
                        await self.drone.action.return_to_launch()
                if epoch != self.epoch:
                    raise Rejected("İşlem sırasında bağlantı değişti.")
                if action in ("upload", "verify"):
                    self.verified = {"fingerprint": digest(self.items), "count": len(self.items)}
                    self.uncertain = False
                self.event(action, "acknowledged", request_id)
                result.update(ok=True, message="Cihaz işlemi onayladı.")
            except Exception:
                self.uncertain = True
                self.verified = None
                self.event(action, "uncertain", request_id)
            return result


def validate_plan(plan, factory):
    if not isinstance(plan, dict) or plan.get("fileType") != "Plan" or plan.get("version") != 1:
        raise Rejected("QGroundControl Plan v1 gerekli.")
    mission = plan.get("mission", {})
    if not isinstance(mission, dict):
        raise Rejected("Görev içeriği geçersiz.")
    if mission.get("firmwareType") not in (3, 12) or mission.get("vehicleType") not in (2, 13, 14):
        raise Rejected("Desteklenmeyen uçuş yazılımı veya araç tipi.")
    home = mission.get("plannedHomePosition")
    if not isinstance(home, list) or len(home) != 3 or any(type(v) not in (int, float) or not math.isfinite(v) for v in home):
        raise Rejected("Planın kalkış koordinatı ve AMSL yüksekliği eksik.")
    if not (-85 <= home[0] <= 85 and -180 <= home[1] <= 180 and -500 <= home[2] <= 9000):
        raise Rejected("Planın kalkış referansı desteklenen aralıkta değil.")
    rows = mission.get("items", [])
    if not 3 <= len(rows) <= 300:
        raise Rejected("Görev nokta sayısı desteklenen aralıkta değil.")
    result = []
    for seq, row in enumerate(rows):
        command, frame = row.get("command"), row.get("frame")
        params = row.get("params")
        if row.get("type") != "SimpleItem" or row.get("autoContinue") is not True:
            raise Rejected("Yalnızca otomatik devam eden SimpleItem desteklenir.")
        if command not in (16, 21, 22, 178) or frame != (2 if command == 178 else 3):
            raise Rejected("Desteklenmeyen görev komutu veya irtifa referansı.")
        if not isinstance(params, list) or len(params) != 7:
            raise Rejected("Görev parametreleri eksik.")
        if any(value is not None and (type(value) not in (int, float) or not math.isfinite(value)) for value in params):
            raise Rejected("Sonlu sayısal parametreler gerekli.")
        if any(params[index] is None for index in (0, 1, 2, 4, 5, 6)):
            raise Rejected("Zorunlu görev parametresi boş.")
        if command != 178:
            if not (0 <= params[0] <= 3600 and 0 <= params[1] <= 100 and 0 <= params[2] <= 100
                    and (params[3] is None or -360 <= params[3] <= 360)):
                raise Rejected("Navigasyon parametreleri desteklenen aralıkta değil.")
            if not (-85 <= params[4] <= 85 and -180 <= params[5] <= 180):
                raise Rejected("Koordinat desteklenen aralıkta değil.")
            if not (0 <= params[6] <= 120) or (command != 21 and params[6] < 10):
                raise Rejected("Uçuş irtifası desteklenen aralıkta değil.")
        elif not (params[0] == 1 and 1 <= params[1] <= 12 and params[2:] == [-1, 0, 0, 0, 0]):
            raise Rejected("Hız ayarı desteklenmiyor.")
        result.append(factory(seq, frame, command, 0, 1,
            *[float(value) if value is not None else float("nan") for value in params[:4]],
            round(params[4] * 1e7) if command != 178 else int(params[4]),
            round(params[5] * 1e7) if command != 178 else int(params[5]),
            float(params[6]), 0))
    if rows[0]["command"] != 22 or rows[-1]["command"] != 21:
        raise Rejected("Görev kalkışla başlayıp inişle bitmeli.")
    if rows[0]["params"][4:6] != home[:2] or rows[-1]["params"][4:6] != home[:2]:
        raise Rejected("Kalkış ve iniş koordinatları planın kalkış referansıyla eşleşmeli.")
    if any(row["command"] in (21, 22) for row in rows[1:-1]):
        raise Rejected("Ara noktada kalkış veya iniş komutu desteklenmiyor.")
    return result
