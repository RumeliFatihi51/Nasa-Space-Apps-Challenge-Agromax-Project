"""Native MAVSDK binding. No gRPC server or additional command listener."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

from mavsdk import Mavsdk, Configuration, ComponentType, ConnectionResult
from mavsdk.plugins.mission_raw import MissionRaw, MissionItem
from mavsdk.plugins.telemetry import Telemetry
from mavsdk.plugins.action import Action
from mavsdk.plugins.info import Info


class NativeDrone:
    def __init__(self):
        self.configuration = Configuration.create_with_component_type(ComponentType.GROUND_STATION)
        self.sdk = Mavsdk(self.configuration)
        self.worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix="agromax-sdk")
        self.system = None
        self.mission_raw = None
        self.action = None

    async def call(self, method, *args):
        # A timed-out request remains serialized at the native SDK boundary.
        # No second native mutation can overtake an unfinished SDK call.
        return await asyncio.wrap_future(self.worker.submit(method, *args))

    def method(self, function):
        async def invoke(*args):
            return await self.call(function, *args)
        return invoke

    async def run(self, controller, address):
        result = self.sdk.add_any_connection(address)
        if result != ConnectionResult.SUCCESS:
            raise RuntimeError("MAVSDK bağlantı adresini açamadı: " + str(result))
        loop = asyncio.get_running_loop()
        while self.system is None:
            systems = self.sdk.get_systems()
            self.system = next((system for system in systems if system.has_autopilot()), None)
            if self.system is None:
                await asyncio.sleep(.5)

        mission = MissionRaw(self.system)
        action = Action(self.system)
        telemetry = Telemetry(self.system)
        info = Info(self.system)
        self.mission_raw = SimpleNamespace(**{
            name: self.method(getattr(mission, name))
            for name in ("upload_mission", "download_mission", "start_mission", "pause_mission")
        })
        self.action = SimpleNamespace(return_to_launch=self.method(action.return_to_launch))
        controller.connection(self.system.is_connected())

        def subscribe(plugin, name, key, convert):
            def publish(value, _user_data=None):
                def deliver():
                    if controller.connected:
                        controller.update(key, convert(value))
                if not loop.is_closed():
                    loop.call_soon_threadsafe(deliver)
            getattr(plugin, "subscribe_" + name)(publish)

        subscribe(telemetry, "position", "position", lambda p: {
            "latitude": p.latitude_deg, "longitude": p.longitude_deg,
            "altitudeMslM": p.absolute_altitude_m, "altitudeAboveHomeM": p.relative_altitude_m})
        subscribe(telemetry, "armed", "armed", bool)
        subscribe(telemetry, "in_air", "inAir", bool)
        subscribe(telemetry, "health", "health", lambda h: {
            "gyro": h.is_gyrometer_calibration_ok, "accelerometer": h.is_accelerometer_calibration_ok,
            "magnetometer": h.is_magnetometer_calibration_ok,
            "position": h.is_global_position_ok, "home": h.is_home_position_ok})
        subscribe(telemetry, "battery", "battery", lambda b: {
            "remainingPercent": b.remaining_percent * 100, "voltage": b.voltage_v})
        subscribe(telemetry, "velocity_ned", "velocity", lambda v: {
            "groundSpeedMps": (v.north_m_s ** 2 + v.east_m_s ** 2) ** .5})
        subscribe(mission, "mission_progress", "progress", lambda p: {"current": p.current, "total": p.total})

        async def identify():
            while True:
                if controller.connected and not controller.fresh("identity"):
                    epoch = controller.epoch
                    try:
                        identification = await self.call(info.get_identification)
                        version = await self.call(info.get_version)
                        if controller.connected and epoch == controller.epoch:
                            controller.update("identity", {
                                "uid": str(identification.hardware_uid or identification.legacy_uid),
                                "version": f"{version.flight_sw_major}.{version.flight_sw_minor}.{version.flight_sw_patch}",
                                "systemId": self.system.get_system_id(),
                            })
                    except Exception:
                        pass
                await asyncio.sleep(5)

        async with asyncio.TaskGroup() as group:
            group.create_task(identify())
            while True:
                controller.connection(self.system.is_connected())
                await asyncio.sleep(.25)

    def close(self):
        # Native calls finish before their plugins and system handles are destroyed.
        self.worker.shutdown(wait=True, cancel_futures=True)
        self.sdk.destroy()
        self.configuration.destroy()
