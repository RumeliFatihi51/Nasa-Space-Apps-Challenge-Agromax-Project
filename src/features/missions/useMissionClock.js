import { useCallback, useEffect, useRef, useState } from "react";
import { createMissionClock } from "../../../shared/mission-clock";

export default function useMissionClock(duration) {
  const source = useRef(null);
  if (!source.current) source.current = createMissionClock(duration);
  const clock = source.current;
  const [state, setState] = useState(() => clock.snapshot());
  const publish = useCallback(() => setState(clock.snapshot()), [clock]);
  const setElapsed = useCallback(
    (value) => {
      clock.seek(value);
      publish();
    },
    [clock, publish],
  );
  const setPlaying = useCallback(
    (value) => {
      clock.setPlaying(value);
      publish();
    },
    [clock, publish],
  );
  const setRate = useCallback(
    (value) => {
      clock.setRate(value);
      publish();
    },
    [clock, publish],
  );
  useEffect(() => {
    clock.setDuration(duration);
    publish();
  }, [clock, duration, publish]);
  useEffect(() => {
    if (!state.playing) return;
    let frame,
      previous = 0;
    const advance = (stamp) => {
      const next = clock.snapshot();
      // Instrument panels update at 10 Hz. The WebGL layer reads the clock directly.
      if (stamp - previous >= 100 || !next.playing) {
        setState(next);
        previous = stamp;
      }
      if (next.playing) frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [clock, state.playing]);
  return {
    elapsed: state.time,
    playing: state.playing,
    rate: state.rate,
    setElapsed,
    setPlaying,
    setRate,
    clock,
  };
}
