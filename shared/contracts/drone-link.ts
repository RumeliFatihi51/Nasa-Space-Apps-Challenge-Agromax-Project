export type DroneLinkState =
  | "offline"
  | "connecting"
  | "waiting"
  | "ready"
  | "stale"
  | "fault";
export interface DroneTelemetry {
  observedAt: string;
  longitude: number;
  latitude: number;
  altitudeMslM: number;
  altitudeAboveHomeM: number;
  groundSpeedMps: number;
  headingDegrees: number | null;
  batteryPercent: number | null;
}
export interface DroneReadLink {
  readonly protocol: "mavlink" | "dji-sdk";
  readonly aircraft: { make: string; model: string };
  connect(signal: AbortSignal): Promise<void>;
  status(): DroneLinkState;
  telemetry(signal: AbortSignal): AsyncIterable<DroneTelemetry>;
  disconnect(): Promise<void>;
}
export const droneConnectionProfiles = [
  {
    name: "MAVLink · PX4 / ArduPilot",
    need: "USB üzerinden salt okunur telemetri. Cihazın telemetri yayın hızı ve port ayarları eşleşmeli.",
  },
  {
    name: "QGroundControl",
    need: "Yer istasyonu ile simülatör ve plan biçimi doğrulaması.",
  },
  { name: "DJI", need: "Desteklenen model, yetkili SDK ve cihaz doğrulaması." },
] as const;
