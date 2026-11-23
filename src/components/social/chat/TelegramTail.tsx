import React from 'react';

/**
 * Computes Telegram / Nekogram-style asymmetric corner radii:
 * - Outer corners are generously rounded (`16px` Material You / `12px` Editorial).
 * - Consecutive messages from the same sender tighten the inner corner (`5px`).
 * - The tail corner (`groupEnd` when `showTail` is true) goes to `0px` so the curved
 *   SVG appendix joins seamlessly without any notch.
 */
export function telegramBubbleRadius(opts: {
  mine: boolean;
  groupStart: boolean;
  groupEnd: boolean;
  showTail: boolean;
  isMaterialYou: boolean;
}): string {
  const big = opts.isMaterialYou ? 17 : 12;
  const small = opts.isMaterialYou ? 5 : 4;
  if (opts.mine) {
    const tr = opts.groupStart ? big : small;
    const br = opts.showTail ? 0 : opts.groupEnd ? big : small;
    return `${big}px ${tr}px ${br}px ${big}px`;
  }
  const tl = opts.groupStart ? big : small;
  const bl = opts.showTail ? 0 : opts.groupEnd ? big : small;
  return `${tl}px ${big}px ${big}px ${bl}px`;
}

/**
 * Authentic Telegram Web / Nekogram curved bubble tail (`svg-appendix`).
 * Inherits the exact bubble background color via `color` prop (`fill="currentColor"`),
 * overlapping 1px into the bubble edge to prevent subpixel seams on high-DPI displays.
 */
export const TelegramBubbleTail: React.FC<{
  mine: boolean;
  color: string;
}> = ({ mine, color }) => (
  <svg
    aria-hidden="true"
    width="10"
    height="19"
    viewBox="0 0 10 19"
    style={{
      position: 'absolute',
      bottom: 0,
      ...(mine ? { right: -8 } : { left: -8, transform: 'scaleX(-1)' }),
      color,
      pointerEvents: 'none',
      display: 'block',
      overflow: 'visible',
    }}
  >
    <path
      d="M0 0H1.1C1.35 8.9 4.1 14.9 9.55 17.85C10.1 18.15 9.88 19 9.24 19H0V0Z"
      fill="currentColor"
    />
  </svg>
);
