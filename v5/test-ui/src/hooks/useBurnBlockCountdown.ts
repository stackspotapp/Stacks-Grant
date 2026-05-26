import { useEffect, useRef, useState } from "react";
import {
  type CountdownParts,
  countdownPartsFromMs,
  targetTimestampFromBlocks,
} from "../lib/lockCountdown";

const EMPTY: CountdownParts = { days: 0, hours: 0, minutes: 0 };

/**
 * Countdown to a future wall-clock instant derived from burn blocks remaining
 * × seconds-per-burn. Recomputes the target when blocks or block time change.
 */
export function useBurnBlockCountdown(
  blocksUntil: number | null,
  secPerBurn: number,
): CountdownParts {
  const targetTime = useRef<number | null>(null);
  const [countdown, setCountdown] = useState<CountdownParts>(EMPTY);

  useEffect(() => {
    if (blocksUntil === null || blocksUntil <= 0) {
      targetTime.current = null;
      setCountdown(EMPTY);
      return;
    }
    targetTime.current = targetTimestampFromBlocks(blocksUntil + 10, secPerBurn);
  }, [blocksUntil, secPerBurn]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (targetTime.current === null) {
        setCountdown(EMPTY);
        return;
      }
      const remaining = Math.max(0, targetTime.current - Date.now());
      setCountdown(countdownPartsFromMs(remaining));
    }, 1000);
    return () => clearInterval(timer);
  }, [blocksUntil, secPerBurn]);

  return countdown;
}
