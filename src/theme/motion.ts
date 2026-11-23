import { useEffect, useRef, useState } from 'react';

/**
 * Material 3 motion system (easing/duration tokens + Expressive spring tokens) and the
 * transition patterns from https://m3.material.io/styles/motion/transitions/transition-patterns,
 * with constants taken from MDC Android (`MaterialSharedAxis`, `MaterialFadeThrough`,
 * `ScaleProvider`, `FadeThroughProvider`).
 */

export const EASING = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  standardDecelerate: 'cubic-bezier(0, 0, 0, 1)',
  standardAccelerate: 'cubic-bezier(0.3, 0, 1, 1)',
  emphasizedDecelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  emphasizedAccelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  linear: 'linear',
} as const;

export const DURATION = {
  short1: 50,
  short2: 100,
  short3: 150,
  short4: 200,
  medium1: 250,
  medium2: 300,
  medium3: 350,
  medium4: 400,
  long1: 450,
  long2: 500,
  long3: 550,
  long4: 600,
} as const;

/** Transition pattern constants (MDC Android). */
export const PATTERN = {
  /** Fade through: outgoing fully fades out by 35% of progress; incoming fades in after. */
  fadeThroughThreshold: 0.35,
  /** Fade through: incoming starts at 92% scale. */
  fadeThroughStartScale: 0.92,
  /** Shared axis X/Y slide distance (dp). */
  sharedAxisSlide: 30,
  /** Shared axis Z: incoming grows from 80%, outgoing grows to 110%. */
  sharedAxisZIncomingScale: 0.8,
  sharedAxisZOutgoingScale: 1.1,
  /** Fade (enter/exit): incoming scales from 80%. */
  fadeStartScale: 0.8,
  /** Container transform (FADE_MODE_IN): incoming content fades in over the first 25%. */
  containerFadeInEnd: 0.25,
} as const;

/** M3 Expressive spring tokens (damping ratio / stiffness). Spatial bounce, effects never do. */
export const SPRING = {
  fastSpatial: { dampingRatio: 0.6, stiffness: 800 },
  defaultSpatial: { dampingRatio: 0.8, stiffness: 380 },
  slowSpatial: { dampingRatio: 0.8, stiffness: 200 },
  fastEffects: { dampingRatio: 1, stiffness: 3800 },
  defaultEffects: { dampingRatio: 1, stiffness: 1600 },
  slowEffects: { dampingRatio: 1, stiffness: 800 },
} as const;

export type SpringToken = keyof typeof SPRING;

/**
 * Converts a spring into a CSS `linear()` easing + duration by simulating the damped oscillator
 * from 0 to 1 until it settles, so CSS/WAAPI animations follow the real M3 spring (with overshoot).
 */
export function springToCss(dampingRatio: number, stiffness: number): { easing: string; duration: number } {
  const mass = 1;
  const damping = dampingRatio * 2 * Math.sqrt(stiffness * mass);
  const dt = 1 / 240;
  let x = 0;
  let v = 0;
  let t = 0;
  const samples: number[] = [0];
  let settledFor = 0;
  while (t < 2.5) {
    const force = -stiffness * (x - 1) - damping * v;
    v += (force / mass) * dt;
    x += v * dt;
    t += dt;
    samples.push(x);
    settledFor = Math.abs(x - 1) < 0.002 && Math.abs(v) < 0.02 ? settledFor + dt : 0;
    if (settledFor > 0.05) break;
  }
  samples[samples.length - 1] = 1;
  // Downsample to ~60 stops: enough to keep the overshoot shape, small enough for CSS.
  const stride = Math.max(1, Math.round(samples.length / 60));
  const stops: string[] = [];
  for (let i = 0; i < samples.length; i += stride) stops.push(samples[i]!.toFixed(4));
  if (stops[stops.length - 1] !== '1.0000') stops.push('1');
  return { easing: `linear(${stops.join(', ')})`, duration: Math.round(t * 1000) };
}

const supportsLinearEasing =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('animation-timing-function', 'linear(0, 1)');

/** Spring as easing + duration, falling back to the closest cubic-bezier on old WebViews. */
export function spring(token: SpringToken): { easing: string; duration: number } {
  const { dampingRatio, stiffness } = SPRING[token];
  if (supportsLinearEasing) return springToCss(dampingRatio, stiffness);
  const duration = token.startsWith('fast') ? 350 : token.startsWith('slow') ? 650 : 500;
  return { easing: token.endsWith('Spatial') ? EASING.emphasizedDecelerate : EASING.standard, duration };
}

/** Exposes the spring tokens to CSS as `--m3-spring-<token>` / `--m3-spring-<token>-duration`. */
export function installMotionTokens(root: HTMLElement = document.documentElement): void {
  (Object.keys(SPRING) as SpringToken[]).forEach((token) => {
    const name = token.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    const { easing, duration } = spring(token);
    root.style.setProperty(`--m3-spring-${name}`, easing);
    root.style.setProperty(`--m3-spring-${name}-duration`, `${duration}ms`);
  });
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/**
 * Keeps a busy flag on for at least `minMs` once it turns on, so loading indicators complete at
 * least one visible morph instead of flashing for a few milliseconds.
 */
export function useMinimumBusy(busy: boolean, minMs = 1300): boolean {
  const [shown, setShown] = useState(busy);
  const startedAt = useRef<number | null>(busy ? Date.now() : null);

  useEffect(() => {
    if (busy) {
      if (startedAt.current === null) startedAt.current = Date.now();
      setShown(true);
      return;
    }
    if (startedAt.current === null) return;
    const remaining = minMs - (Date.now() - startedAt.current);
    const done = () => {
      startedAt.current = null;
      setShown(false);
    };
    if (remaining <= 0) {
      done();
      return;
    }
    const timer = window.setTimeout(done, remaining);
    return () => window.clearTimeout(timer);
  }, [busy, minMs]);

  return shown;
}

const t = PATTERN.fadeThroughThreshold;
const slide = PATTERN.sharedAxisSlide;

/** Fade-through opacity (always on linear time, so the 35% threshold is a real 35%). */
const FADE_IN: Keyframe[] = [{ opacity: 0, offset: 0 }, { opacity: 0, offset: t }, { opacity: 1, offset: 1 }];
const FADE_OUT: Keyframe[] = [{ opacity: 1, offset: 0 }, { opacity: 0, offset: t }, { opacity: 0, offset: 1 }];

/**
 * Shared axis X with WAAPI: opacity runs on linear time and the slide on the given easing, as
 * two animations (one curve for both would squeeze the fade-through into the first few ms).
 * `role`: `'enter'` = incoming page, `'leave'` = outgoing page. `forward` picks the direction.
 */
export function animateSharedAxisX(
  el: HTMLElement,
  role: 'enter' | 'leave',
  forward: boolean,
  timing: { duration: number; easing: string },
  fill: FillMode = 'both'
): Animation[] {
  const dir = forward ? 1 : -1;
  const from = role === 'enter' ? dir * slide : 0;
  const to = role === 'enter' ? 0 : -dir * slide;
  return [
    el.animate(role === 'enter' ? FADE_IN : FADE_OUT, { duration: timing.duration, easing: EASING.linear, fill }),
    el.animate([{ translate: `${from}px 0` }, { translate: `${to}px 0` }], { ...timing, fill }),
  ];
}

/**
 * Overlay page transition matching Android's predictive-back exit (`backStack.ts`) and its exact
 * inverse on enter: the incoming page slides in from the right (`30vw`, `scale(0.88)`, `28px`
 * rounded corners, elevation shadow) and expands to cover the current page underneath.
 */
export function animateOverlayPageTransition(el: HTMLElement, role: 'enter' | 'leave'): Animation {
  el.style.transformOrigin = 'center center';
  const shift = `${Math.round((typeof window !== 'undefined' ? window.innerWidth : 400) * 0.3)}px`;

  if (role === 'enter') {
    const spatial = el.animate(
      [
        {
          transform: `translate3d(${shift}, 0, 0) scale(0.88)`,
          borderRadius: '28px',
          boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)',
        },
        {
          transform: 'translate3d(0, 0, 0) scale(1)',
          borderRadius: '0px',
          boxShadow: '0 0 0 rgba(0, 0, 0, 0)',
        },
      ],
      { duration: 360, easing: EASING.emphasizedDecelerate, fill: 'backwards' }
    );
    el.animate(
      [
        { opacity: 0, offset: 0 },
        { opacity: 1, offset: 0.32 },
        { opacity: 1, offset: 1 },
      ],
      { duration: 360, easing: EASING.linear, fill: 'backwards' }
    );
    return spatial;
  }

  return el.animate(
    [
      {
        transform: 'translate3d(0, 0, 0) scale(1)',
        borderRadius: '0px',
        boxShadow: '0 0 0 rgba(0, 0, 0, 0)',
        opacity: 1,
      },
      {
        transform: `translate3d(${shift}, 0, 0) scale(0.88)`,
        borderRadius: '28px',
        boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)',
        opacity: 0,
      },
    ],
    { duration: 240, easing: 'cubic-bezier(0.1, 0.1, 0, 1)', fill: 'forwards' }
  );
}
