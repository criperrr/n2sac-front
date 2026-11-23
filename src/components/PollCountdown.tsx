import React, { useEffect, useState } from 'react';

function remainingSeconds(targetAtMs: number | null, fallbackSecs = 0): number {
  if (targetAtMs === null) return Math.max(0, Math.ceil(fallbackSecs));
  return Math.max(0, Math.ceil((targetAtMs - Date.now()) / 1000));
}

/**
 * Isolated 1-second countdown hook for leaf UI elements.
 * Keeping the interval inside the leaf avoids re-rendering root `App` every second.
 */
export function useCountdownSeconds(
  targetAtMs: number | null,
  paused = false,
  fallbackSecs = 0
): number {
  const [seconds, setSeconds] = useState<number>(() => remainingSeconds(targetAtMs, fallbackSecs));

  useEffect(() => {
    setSeconds(remainingSeconds(targetAtMs, fallbackSecs));
    if (paused || targetAtMs === null) return;
    if (targetAtMs <= Date.now()) return;

    const timer = window.setInterval(() => {
      const next = remainingSeconds(targetAtMs, 0);
      setSeconds(next);
      if (next <= 0) {
        window.clearInterval(timer);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [targetAtMs, paused, fallbackSecs]);

  return seconds;
}

/** Leaf display for the Sentinel next-poll countdown (opted out of contentSizeMorph). */
export const PollCountdownLabel: React.FC<{
  nextPollAt: number | null;
  paused?: boolean;
  fallbackSecs?: number;
}> = ({ nextPollAt, paused = false, fallbackSecs = 0 }) => {
  const seconds = useCountdownSeconds(nextPollAt, paused, fallbackSecs);
  return (
    <span data-no-size-morph style={{ fontVariantNumeric: 'tabular-nums' }}>
      {seconds}s
    </span>
  );
};

/** Leaf display for manual refresh button cooldown (opted out of contentSizeMorph). */
export const RefreshCooldownLabel: React.FC<{
  cooldownUntil: number | null;
  idleLabel?: string;
  className?: string;
}> = ({ cooldownUntil, idleLabel = 'Atualizar', className }) => {
  const seconds = useCountdownSeconds(cooldownUntil, false, 0);
  return (
    <span className={className} data-no-size-morph style={{ fontVariantNumeric: 'tabular-nums' }}>
      {seconds > 0 ? `${seconds}s` : idleLabel}
    </span>
  );
};
