import { useEffect, useRef, useState } from 'react';

export interface SpringSpec {
  stiffness: number;
  dampingRatio: number;
  mass?: number;
  precision?: number;
}

/**
 * Official Material 3 Expressive & T8RIN/ImageToolbox + XDanfr/Aperture Spring Presets:
 * - T8RIN CustomMotionScheme:
 *   - defaultSpatial: dampingRatio = 0.8, stiffness = 380
 *   - fastSpatial: dampingRatio = 0.6, stiffness = 800
 *   - slowSpatial: dampingRatio = 0.8, stiffness = 200
 *   - springySpec (ScaleOnTap): dampingRatio = 0.35, stiffness = 200
 *   - lessSpringySpec (ShapeDefaults / shapeByInteraction): dampingRatio = 0.4, stiffness = 200
 * - Aperture Motion.kt:
 *   - focus: dampingRatio = 0.75, stiffness = 400
 */
export const M3_SPRINGS = {
  defaultSpatial: { stiffness: 380, dampingRatio: 0.8 },
  fastSpatial: { stiffness: 800, dampingRatio: 0.6 },
  slowSpatial: { stiffness: 200, dampingRatio: 0.8 },
  springy: { stiffness: 260, dampingRatio: 0.38 },
  lessSpringy: { stiffness: 280, dampingRatio: 0.52 },
  apertureFocus: { stiffness: 400, dampingRatio: 0.75 },
  numberGauge: { stiffness: 220, dampingRatio: 0.82 },
} as const;

/**
 * Real Hooke's Law damped harmonic oscillator (`requestAnimationFrame`)
 * for frontier Material You / T8RIN ImageToolbox animations (numbers, gauges, corner morphing, scale).
 */
export function useSpringValue(
  target: number,
  spec: SpringSpec = M3_SPRINGS.defaultSpatial
): number {
  const [current, setCurrent] = useState<number>(target);
  const stateRef = useRef({
    position: target,
    velocity: 0,
    target,
    lastTime: 0,
    rafId: 0,
  });

  useEffect(() => {
    stateRef.current.target = target;
    const mass = spec.mass ?? 1;
    const stiffness = spec.stiffness;
    const damping = spec.dampingRatio * 2 * Math.sqrt(stiffness * mass);
    const precision = spec.precision ?? 0.005;

    // Already settled at target (e.g. initial mount): skip scheduling a pointless rAF + setState.
    if (
      Math.abs(stateRef.current.velocity) < precision &&
      Math.abs(stateRef.current.target - stateRef.current.position) < precision
    ) {
      stateRef.current.position = target;
      stateRef.current.velocity = 0;
      return;
    }

    let active = true;
    stateRef.current.lastTime = performance.now();

    const step = (now: number) => {
      if (!active) return;
      const dt = Math.min((now - stateRef.current.lastTime) / 1000, 0.032);
      stateRef.current.lastTime = now;

      const displacement = stateRef.current.position - stateRef.current.target;
      const springForce = -stiffness * displacement;
      const dampingForce = -damping * stateRef.current.velocity;
      const acceleration = (springForce + dampingForce) / mass;

      stateRef.current.velocity += acceleration * dt;
      stateRef.current.position += stateRef.current.velocity * dt;

      if (
        Math.abs(stateRef.current.velocity) < precision &&
        Math.abs(stateRef.current.target - stateRef.current.position) < precision
      ) {
        stateRef.current.position = stateRef.current.target;
        stateRef.current.velocity = 0;
        setCurrent(stateRef.current.target);
        return;
      }

      setCurrent(stateRef.current.position);
      stateRef.current.rafId = requestAnimationFrame(step);
    };

    cancelAnimationFrame(stateRef.current.rafId);
    stateRef.current.rafId = requestAnimationFrame(step);

    return () => {
      active = false;
      cancelAnimationFrame(stateRef.current.rafId);
    };
  }, [target, spec.stiffness, spec.dampingRatio, spec.mass, spec.precision]);

  return current;
}

export interface CornerRadii {
  topStart: number;
  topEnd: number;
  bottomEnd: number;
  bottomStart: number;
}

/**
 * T8RIN/ImageToolbox `ShapeDefaults.byIndex` + `shapeByInteraction`
 * Computes the 4 corner radii of an item in a segmented list or standalone card,
 * and morphs them dynamically on press, focus, or selection.
 */
export function computeSegmentedCorners(
  index: number,
  total: number,
  options?: {
    outerRadius?: number;
    innerRadius?: number;
    pressedRadius?: number;
    selectedRadius?: number;
    isPressed?: boolean;
    isSelected?: boolean;
    vertical?: boolean;
  }
): CornerRadii {
  const outer = options?.outerRadius ?? 28;
  const inner = options?.innerRadius ?? 6;
  const pressed = options?.pressedRadius ?? 10;
  const selected = options?.selectedRadius ?? 24;
  const vertical = options?.vertical ?? true;

  if (options?.isPressed) {
    return {
      topStart: pressed,
      topEnd: pressed,
      bottomEnd: pressed,
      bottomStart: pressed,
    };
  }

  if (options?.isSelected) {
    return {
      topStart: selected,
      topEnd: selected,
      bottomEnd: selected,
      bottomStart: selected,
    };
  }

  const allRounded = index <= -1 || total <= 1;
  const roundTop = allRounded || (vertical && index === 0 && total > 1);
  const roundBottom = allRounded || (vertical && index === total - 1 && total > 1);
  const roundStart = allRounded || (!vertical && index === 0 && total > 1);
  const roundEnd = allRounded || (!vertical && index === total - 1 && total > 1);

  return {
    topStart: roundTop || roundStart ? outer : inner,
    topEnd: roundTop || roundEnd ? outer : inner,
    bottomEnd: roundBottom || roundEnd ? outer : inner,
    bottomStart: roundBottom || roundStart ? outer : inner,
  };
}

/**
 * Animates all 4 corners with T8RIN's `lessSpringySpec` so shapes morph organically
 * when pressed, selected, expanded, or reordered.
 */
export function useAnimatedCorners(target: CornerRadii, spec: SpringSpec = M3_SPRINGS.lessSpringy): string {
  const ts = useSpringValue(target.topStart, spec);
  const te = useSpringValue(target.topEnd, spec);
  const be = useSpringValue(target.bottomEnd, spec);
  const bs = useSpringValue(target.bottomStart, spec);
  return `${Math.max(0, ts).toFixed(1)}px ${Math.max(0, te).toFixed(1)}px ${Math.max(0, be).toFixed(1)}px ${Math.max(0, bs).toFixed(1)}px`;
}
