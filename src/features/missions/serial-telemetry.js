import {
  createMavlinkDecoder,
  createMavlinkMonitor,
} from "../../../shared/mavlink-telemetry";

export const localSerialAvailable = () => !!globalThis.navigator?.serial;

export async function openSerialTelemetry(baudRate, signal, publish) {
  const port = await navigator.serial.requestPort();
  if (signal.aborted) return;
  await port.open({ baudRate });
  let reader, clock;
  const stop = () => {
    reader?.cancel().catch(() => {});
  };
  try {
    if (signal.aborted) return;
    reader = port.readable?.getReader();
    if (!reader) throw new Error("Seri port açılamadı.");
    signal.addEventListener("abort", stop, { once: true });
    const monitor = createMavlinkMonitor();
    const decode = createMavlinkDecoder((frame) =>
      monitor.receive(frame, Date.now()),
    );
    const report = () => publish(monitor.snapshot(Date.now()));
    report();
    clock = setInterval(report, 200);
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) decode(value);
    }
    if (!signal.aborted) throw new Error("Seri bağlantı kesildi.");
  } finally {
    clearInterval(clock);
    signal.removeEventListener("abort", stop);
    reader?.releaseLock();
    await port.close().catch(() => {});
  }
}
