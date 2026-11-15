// Monotonic simulation time, independent of browser frame rate and UI refresh.
export function createMissionClock(
  initialDuration = 0,
  now = () => performance.now(),
) {
  let duration = 0,
    time = 0,
    mark = now(),
    playing = false,
    rate = 1;
  function snapshot() {
    const value = playing
      ? Math.min(duration, time + (Math.max(0, now() - mark) * rate) / 1000)
      : time;
    if (playing && value >= duration) {
      time = duration;
      playing = false;
      mark = now();
    }
    return { time: value, playing, rate };
  }
  function synchronize() {
    time = snapshot().time;
    mark = now();
  }
  const clock = {
    snapshot,
    seek(value) {
      if (!Number.isFinite(value)) return;
      time = Math.max(0, Math.min(duration, value));
      mark = now();
      if (time >= duration) playing = false;
    },
    setPlaying(value) {
      synchronize();
      playing = !!value && time < duration;
    },
    setRate(value) {
      if (Number.isFinite(value) && value > 0 && value <= 8) {
        synchronize();
        rate = value;
      }
    },
    setDuration(value) {
      synchronize();
      duration = Number.isFinite(value) ? Math.max(0, value) : 0;
      time = Math.min(time, duration);
      if (time >= duration) playing = false;
    },
  };
  clock.setDuration(initialDuration);
  return clock;
}
