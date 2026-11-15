// MAVLink common dialect: message id -> CRC_EXTRA, v1 length, v2 maximum length.
const definitions = {
  0: [50, 9, 9],
  1: [124, 31, 43],
  33: [104, 28, 28],
  42: [28, 2, 18],
};
const missionStates = [
  null,
  "Görev yok",
  "Başlamadı",
  "Etkin",
  "Duraklatıldı",
  "Tamamlandı",
];
const autopilots = { 3: "ArduPilot", 12: "PX4" };
export const telemetryFreshnessMs = 5000;

function checksum(headerAndPayload, extra) {
  let crc = 0xffff;
  for (const byte of [...headerAndPayload, extra]) {
    const x = (byte ^ crc) & 255;
    const t = (x ^ (x << 4)) & 255;
    crc = ((crc >> 8) ^ (t << 8) ^ (t << 3) ^ (t >> 4)) & 65535;
  }
  return crc;
}

// A streaming decoder for an operator-selected local port. CRC checks integrity only.
export function createMavlinkDecoder(receive) {
  let pending = new Uint8Array();
  return (chunk) => {
    const bytes = new Uint8Array(pending.length + chunk.length);
    bytes.set(pending);
    bytes.set(chunk, pending.length);
    let i = 0;
    while (i < bytes.length) {
      const version = bytes[i] === 0xfd ? 2 : bytes[i] === 0xfe ? 1 : null;
      if (!version) {
        i++;
        continue;
      }
      const header = version === 2 ? 10 : 6;
      if (i + header > bytes.length) break;
      const size = bytes[i + 1],
        flags = version === 2 ? bytes[i + 2] : 0;
      if (flags & ~1) {
        i++;
        continue;
      }
      const id =
        version === 2
          ? bytes[i + 7] | (bytes[i + 8] << 8) | (bytes[i + 9] << 16)
          : bytes[i + 5];
      const definition = definitions[id];
      if (
        definition &&
        (size > definition[2] ||
          (version === 1 && size !== definition[1]) ||
          !size)
      ) {
        i++;
        continue;
      }
      const checksumAt = i + header + size,
        end = checksumAt + 2 + (flags & 1 ? 13 : 0);
      if (end > bytes.length) break;
      if (definition) {
        const expected = bytes[checksumAt] | (bytes[checksumAt + 1] << 8);
        if (
          checksum(bytes.subarray(i + 1, checksumAt), definition[0]) !==
          expected
        ) {
          i++;
          continue;
        }
        const payload = new Uint8Array(definition[2]);
        payload.set(bytes.subarray(i + header, checksumAt));
        const system = bytes[i + (version === 2 ? 5 : 3)],
          component = bytes[i + (version === 2 ? 6 : 4)];
        if (system && component)
          receive({
            id,
            system,
            component,
            payload: new DataView(payload.buffer),
          });
      }
      i = end;
    }
    pending = bytes.slice(i);
  };
}

export function createMavlinkMonitor() {
  let heartbeat, position, battery, mission;
  return {
    receive({ id, system, component, payload }, receivedAt) {
      if (heartbeat && heartbeat.system !== system) return;
      if (component !== 1) return;
      if (id === 0 && autopilots[payload.getUint8(5)]) {
        heartbeat = {
          system,
          name: autopilots[payload.getUint8(5)],
          receivedAt,
          armed: !!(payload.getUint8(6) & 128),
        };
      }
      if (!heartbeat) return;
      if (id === 33) {
        const latitude = payload.getInt32(4, true) / 1e7,
          longitude = payload.getInt32(8, true) / 1e7;
        if (
          Math.abs(latitude) > 85 ||
          Math.abs(longitude) > 180 ||
          (latitude === 0 && longitude === 0)
        )
          return;
        const heading = payload.getUint16(26, true);
        position = {
          longitude,
          latitude,
          receivedAt,
          altitudeMslM: payload.getInt32(12, true) / 1000,
          altitudeAboveHomeM: payload.getInt32(16, true) / 1000,
          groundSpeedMps:
            Math.hypot(payload.getInt16(20, true), payload.getInt16(22, true)) /
            100,
          headingDegrees: heading < 36000 ? heading / 100 : null,
        };
      }
      if (id === 1) {
        const value = payload.getInt8(30);
        battery = {
          receivedAt,
          value: value >= 0 && value <= 100 ? value : null,
        };
      }
      if (id === 42)
        mission = {
          receivedAt,
          sequence: payload.getUint16(0, true),
          state: missionStates[payload.getUint8(4)] ?? null,
        };
    },
    snapshot(now) {
      const fresh = (sample) =>
        sample && now - sample.receivedAt < telemetryFreshnessMs
          ? sample
          : null;
      const active = fresh(heartbeat);
      return {
        state: active ? "ready" : heartbeat ? "stale" : "waiting",
        vehicle: heartbeat?.name ?? null,
        system: heartbeat?.system ?? null,
        armed: active?.armed ?? null,
        position: active ? fresh(position) : null,
        batteryPercent: active ? (fresh(battery)?.value ?? null) : null,
        mission: active ? fresh(mission) : null,
      };
    },
  };
}
