import { useEffect, useState } from "react";

/**
 * Updates once per minute — for relative time labels in list rows.
 * Prefer this over FlatList `extraData` ticks that re-render every row.
 */
export function useMinuteTick(enabled = true): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [enabled]);

  return tick;
}
