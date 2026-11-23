import React, { useEffect, useRef } from 'react';
import { useM3Theme } from '../../theme/ThemeContext';

/**
 * Shape morphing in the style of the Material 3 Expressive LoadingIndicator
 * (androidx.graphics.shapes `Morph`): every shape is sampled as a radius-per-angle curve on the
 * same number of points, so any two shapes interpolate point-to-point, while the whole figure
 * keeps rotating and takes an extra quarter turn (with a slight spring overshoot) per morph.
 */

const SAMPLES = 120;
const TAU = Math.PI * 2;
/** One morph step, as in the M3 indicator (~520ms) */
const MORPH_MS = 520;
/** Constant global rotation period (M3: 3600ms per turn). */
const ROTATION_PERIOD_MS = 3600;

type Point = [number, number];

/** Distance from the origin to a star-shaped polygon along angle `theta`. */
function rayToPolygon(vertices: Point[], theta: number): number {
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  let best = Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const [ax, ay] = vertices[i]!;
    const [bx, by] = vertices[(i + 1) % vertices.length]!;
    const ex = bx - ax;
    const ey = by - ay;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const t = (ax * ey - ay * ex) / denom;
    const u = (ax * dy - ay * dx) / denom;
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
  }
  return best === Infinity ? 1 : best;
}

/** Circular moving average: rounds polygon corners the way rounded RoundedPolygons do. */
function smooth(radii: number[], window: number): number[] {
  if (window <= 1) return radii;
  const half = Math.floor(window / 2);
  return radii.map((_, i) => {
    let sum = 0;
    for (let k = -half; k <= half; k++) sum += radii[(i + k + radii.length) % radii.length]!;
    return sum / (2 * half + 1);
  });
}

function normalize(radii: number[]): number[] {
  const max = Math.max(...radii);
  return radii.map((r) => r / max);
}

function sample(fn: (theta: number) => number): number[] {
  return Array.from({ length: SAMPLES }, (_, i) => fn((i / SAMPLES) * TAU - Math.PI / 2));
}

function star(points: number, innerRatio: number, rotation = -Math.PI / 2): Point[] {
  const vertices: Point[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 1 : innerRatio;
    const a = rotation + (i * Math.PI) / points;
    vertices.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return vertices;
}

function regularPolygon(sides: number, rotation = -Math.PI / 2): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = rotation + (i * TAU) / sides;
    return [Math.cos(a), Math.sin(a)] as Point;
  });
}

/** Capsule (two half circles joined by straight sides), centered, horizontal. */
function capsule(theta: number, halfSpan: number, radius: number): number {
  const c = Math.abs(Math.cos(theta));
  const s = Math.abs(Math.sin(theta));
  if (s > 1e-6 && (radius / s) * c <= halfSpan) return radius / s;
  return halfSpan * c + Math.sqrt(Math.max(0, radius * radius - halfSpan * halfSpan * s * s));
}

function ellipse(theta: number, a: number, b: number): number {
  return (a * b) / Math.sqrt((b * Math.cos(theta)) ** 2 + (a * Math.sin(theta)) ** 2);
}

const fromPolygon = (vertices: Point[], roundness: number) =>
  normalize(smooth(sample((t) => rayToPolygon(vertices, t)), roundness));

/** Same sequence as the M3 Expressive LoadingIndicator. */
const MORPH_SEQUENCE: number[][] = [
  fromPolygon(star(10, 0.72), 9), // soft burst
  normalize(sample((t) => 1 + 0.085 * Math.cos(9 * (t + Math.PI / 2)))), // 9-sided cookie
  fromPolygon(regularPolygon(5), 17), // rounded pentagon
  normalize(sample((t) => capsule(t + Math.PI / 4, 0.42, 0.58))), // pill (diagonal)
  fromPolygon(star(8, 0.84), 7), // sunny
  normalize(sample((t) => 1 + 0.14 * Math.cos(4 * (t + Math.PI / 2)))), // 4-sided cookie
  normalize(sample((t) => ellipse(t + Math.PI / 4, 1, 0.68))), // oval (diagonal)
];

/**
 * At button sizes (~16–24px) the M3 shapes differ by fractions of a pixel, so the morph reads as
 * a plain spinning blob. Push every contour away from its mean radius (and keep the pill/oval
 * thinner) so each shape stays recognizable, as the real indicator does at 24dp on Android.
 */
function emphasize(radii: number[], k: number): number[] {
  const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
  return normalize(radii.map((r) => Math.max(0.05, mean + (r - mean) * k)));
}
const COMPACT_SEQUENCE: number[][] = MORPH_SEQUENCE.map((radii) => emphasize(radii, 2.1));
/** Below this rendered size the compact (emphasized) contours are used. */
const COMPACT_MAX_PX = 32;

/** Slight overshoot like the indicator's spring (damping ~0.6). */
function springEase(x: number): number {
  const c = 1.35;
  const p = x - 1;
  return 1 + (c + 1) * p * p * p + c * p * p;
}

function toPath(radii: number[], center: number, scale: number): string {
  let d = '';
  for (let i = 0; i < radii.length; i++) {
    const theta = (i / radii.length) * TAU - Math.PI / 2;
    const r = radii[i]! * scale;
    const x = center + r * Math.cos(theta);
    const y = center + r * Math.sin(theta);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

/** Every M3 shape as an SVG path (viewBox 0 0 100 100), e.g. for the static boot splash. */
export function shapePaths(radiusPct = 33): string[] {
  return MORPH_SEQUENCE.map((radii) => toPath(radii, 50, radiusPct));
}

/** The spring overshoot as a CSS `linear()` easing, so WAAPI follows the same curve. */
const MORPH_EASING = `linear(${Array.from({ length: 33 }, (_, i) => springEase(i / 32).toFixed(4)).join(', ')})`;

const supportsCssPathAnimation = (): boolean =>
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('d', 'path("M0 0L1 1Z")') &&
  CSS.supports('animation-timing-function', 'linear(0, 1)') &&
  typeof Element !== 'undefined' &&
  typeof Element.prototype.animate === 'function';

/** Start shape of the previous run, so two runs in a row never start on the same figure. */
let lastRunStart = -1;

/** Random shape index different from `current` (the figure never "morphs" into itself). */
function nextShape(current: number, count: number): number {
  if (count < 2) return 0;
  if (current < 0 || current >= count) return Math.floor(Math.random() * count);
  const n = Math.floor(Math.random() * (count - 1));
  return n >= current ? n + 1 : n;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Drives an SVG `<path>` (viewBox 0 0 100 100) through random M3 shapes while `active`: every run
 * starts on a random figure and each morph goes to another random one (never the same twice in a
 * row), with an extra quarter turn per morph on top of a constant spin.
 *
 * The spin is a WAAPI `transform` animation (composited, keeps turning even while the main thread
 * is busy) and each morph is a WAAPI `d` animation chained on `finish`; old WebViews without CSS
 * `d` animation fall back to a requestAnimationFrame loop.
 */
export function useShapeMorph(
  pathRef: React.RefObject<SVGPathElement | null>,
  groupRef: React.RefObject<SVGGElement | null>,
  active: boolean,
  radiusPct = 46,
  compact = false
): void {
  useEffect(() => {
    const path = pathRef.current;
    const group = groupRef.current;
    if (!path || !group || !active) return;

    const sequence = compact ? COMPACT_SEQUENCE : MORPH_SEQUENCE;
    const shapePath = (index: number) => toPath(sequence[index]!, 50, radiusPct);
    let current = nextShape(lastRunStart, sequence.length);
    lastRunStart = current;
    path.setAttribute('d', shapePath(current));
    // Reduced motion: a single figure that keeps spinning (it still signals activity).
    const reduced = prefersReducedMotion();

    if (supportsCssPathAnimation()) {
      group.style.transformOrigin = '50px 50px';
      path.style.transformOrigin = '50px 50px';
      const spin = group.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
        duration: ROTATION_PERIOD_MS,
        iterations: Infinity,
      });
      let morph: Animation | null = null;
      let turn = 0;
      let stopped = false;
      const step = () => {
        if (stopped) return;
        const next = nextShape(current, sequence.length);
        morph = path.animate(
          [
            { d: `path("${shapePath(current)}")`, transform: `rotate(${turn}deg)` },
            { d: `path("${shapePath(next)}")`, transform: `rotate(${turn + 90}deg)` },
          ],
          { duration: MORPH_MS, easing: MORPH_EASING, fill: 'forwards' }
        );
        current = next;
        turn = (turn + 90) % 360;
        morph.onfinish = step;
      };
      if (!reduced) step();
      return () => {
        stopped = true;
        morph?.cancel();
        spin.cancel();
      };
    }

    // Fallback: per-frame DOM writes (no React re-render per frame).
    let frame = 0;
    let stepStart = performance.now();
    let target = nextShape(current, sequence.length);
    let turn = 0;
    const origin = stepStart;
    const tick = (frameTime: number) => {
      // rAF timestamps are the frame's start time and can precede `origin` on the first frame.
      const now = Math.max(frameTime, origin);
      const spin = ((now - origin) / ROTATION_PERIOD_MS) * 360;
      if (reduced) {
        group.setAttribute('transform', `rotate(${(spin % 360).toFixed(2)} 50 50)`);
        frame = requestAnimationFrame(tick);
        return;
      }
      while (now - stepStart >= MORPH_MS) {
        stepStart += MORPH_MS;
        current = target;
        target = nextShape(current, sequence.length);
        turn += 90;
      }
      const eased = springEase((now - stepStart) / MORPH_MS);
      const from = sequence[current]!;
      const to = sequence[target]!;
      path.setAttribute('d', toPath(from.map((r, i) => r + (to[i]! - r) * eased), 50, radiusPct));
      group.setAttribute('transform', `rotate(${((spin + turn + eased * 90) % 360).toFixed(2)} 50 50)`);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pathRef, groupRef, active, radiusPct, compact]);
}

/**
 * Material 3 Expressive loading indicator. `contained` adds the circular container
 * (primaryContainer) used for standalone page/section loading.
 */
export const MorphingShapeIndicator: React.FC<{
  size?: number;
  color?: string;
  contained?: boolean;
  label?: string;
}> = ({ size = 20, color, contained = false, label = 'Carregando' }) => {
  const { tokens } = useM3Theme();
  const pathRef = useRef<SVGPathElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const effectiveSize = Math.max(size, 20);
  const compact = effectiveSize <= COMPACT_MAX_PX;
  // M3: active indicator is 38/48 of the container when contained.
  useShapeMorph(pathRef, groupRef, true, contained ? 33 : 48, compact);

  return (
    <span
      role="progressbar"
      aria-label={label}
      style={{
        width: effectiveSize,
        height: effectiveSize,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        backgroundColor: contained ? tokens.primaryContainer : 'transparent',
      }}
    >
      <svg viewBox="0 0 100 100" width={effectiveSize} height={effectiveSize} aria-hidden="true">
        <g ref={groupRef}>
          <path ref={pathRef} d={toPath((compact ? COMPACT_SEQUENCE : MORPH_SEQUENCE)[0]!, 50, contained ? 33 : 48)} fill={color ?? (contained ? tokens.onPrimaryContainer : 'currentColor')} />
        </g>
      </svg>
    </span>
  );
};

/** Centered page/section loading state: contained indicator + caption. */
export const MorphingLoadingState: React.FC<{ label: string; minHeight?: number }> = ({ label, minHeight = 220 }) => {
  const { tokens } = useM3Theme();
  return (
    <div
      role="status"
      style={{
        minHeight,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        color: tokens.onSurfaceVariant,
        fontSize: '0.86rem',
      }}
    >
      <MorphingShapeIndicator size={56} contained label={label} />
      <span>{label}</span>
    </div>
  );
};
