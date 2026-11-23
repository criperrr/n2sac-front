import React, { useEffect, useRef, useState } from 'react';
import { useM3Theme } from '../../theme/ThemeContext';

/**
 * Material 3 Expressive CircularWavyProgressIndicator
 * (Jetpack Compose `CircularWavyProgressIndicator` / `WavyProgressIndicatorDefaults`):
 * - Active arc: sinusoidal wave along the circle `r(θ) = R + A * sin(N * θ - phase)`
 * - Track arc: smooth circular arc separated by a small gap on both ends
 * - Supports determinate (`progress` 0..1, e.g. pull-to-refresh) and indeterminate (lively spinning + rippling).
 */
export const CircularWavyProgressIndicator: React.FC<{
  size?: number;
  /** 0..1 for determinate pull progress; omit for indeterminate refreshing animation. */
  progress?: number;
  color?: string;
  trackColor?: string;
  label?: string;
}> = ({ size = 40, progress, color, trackColor, label = 'Atualizando' }) => {
  const { tokens } = useM3Theme();
  const activePathRef = useRef<SVGPathElement>(null);
  const trackPathRef = useRef<SVGPathElement>(null);

  const isDeterminate = typeof progress === 'number';
  const isDeterminateRef = useRef(isDeterminate);
  isDeterminateRef.current = isDeterminate;
  const progressRef = useRef(progress ?? 0);
  progressRef.current = progress ?? 0;

  useEffect(() => {
    const activeEl = activePathRef.current;
    const trackEl = trackPathRef.current;
    if (!activeEl || !trackEl) return;

    const cx = 50;
    const cy = 50;
    const baseR = 35;
    const maxAmp = 3.6;
    const waveCount = 10;
    const gapRad = (20 * Math.PI) / 180;

    const buildWavyArc = (startAngle: number, sweepAngle: number, amp: number, phase: number): string => {
      const clampedSweep = Math.max(0.08, Math.min(Math.PI * 2 - 0.05, sweepAngle));
      const steps = Math.max(24, Math.round((clampedSweep / (Math.PI * 2)) * 120));
      let d = '';
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const theta = startAngle + u * clampedSweep;
        const endTaper = Math.min(1, u * 8, (1 - u) * 8);
        const r = baseR + amp * endTaper * Math.sin(waveCount * theta - phase);
        const x = cx + r * Math.cos(theta);
        const y = cy + r * Math.sin(theta);
        d += i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
      }
      return d;
    };

    const buildSmoothArc = (startAngle: number, sweepAngle: number): string => {
      if (sweepAngle <= 0.08) return '';
      const clamped = Math.min(Math.PI * 2 - 0.05, sweepAngle);
      const x1 = cx + baseR * Math.cos(startAngle);
      const y1 = cy + baseR * Math.sin(startAngle);
      const endAngle = startAngle + clamped;
      const x2 = cx + baseR * Math.cos(endAngle);
      const y2 = cy + baseR * Math.sin(endAngle);
      const largeArc = clamped > Math.PI ? 1 : 0;
      return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${baseR} ${baseR} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
    };

    let raf = 0;
    let lastTime = performance.now();
    let spinAngle = -Math.PI / 2;
    let wavePhase = 0;
    let breathTime = 0;
    let currentSweep = 0.2 * Math.PI * 2;
    let currentAmp = 0;
    let prevPullProgress = Math.max(0, Math.min(1, progressRef.current));

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      let targetSweep: number;
      let targetAmp: number;

      if (isDeterminateRef.current) {
        const p = Math.max(0, Math.min(1, progressRef.current));
        const dp = p - prevPullProgress;
        prevPullProgress = p;
        // Gentle rotation proportional to finger pull + soft idle drift
        spinAngle += dp * Math.PI * 1.15 + dt * (0.45 + p * 0.55);
        wavePhase += dt * (2.6 + p * 3.2) + dp * 2.5;
        targetSweep = (0.14 + p * 0.62) * Math.PI * 2;
        targetAmp = maxAmp * Math.min(1, p * 1.05);
      } else {
        // Smooth, calm indeterminate spin + gentle breathing arc
        breathTime += dt * 2.4;
        const cycle = (Math.sin(breathTime) + 1) * 0.5;
        spinAngle += dt * 3.1;
        wavePhase += dt * 7.2;
        targetSweep = (0.3 + cycle * 0.42) * Math.PI * 2;
        targetAmp = maxAmp;
      }

      const blend = Math.min(1, dt * 12);
      currentSweep += (targetSweep - currentSweep) * blend;
      currentAmp += (targetAmp - currentAmp) * blend;

      activeEl.setAttribute('d', buildWavyArc(spinAngle, currentSweep, currentAmp, wavePhase));

      const trackStart = spinAngle + currentSweep + gapRad;
      const trackSweep = Math.PI * 2 - currentSweep - gapRad * 2;
      trackEl.setAttribute('d', buildSmoothArc(trackStart, trackSweep));

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const activeStroke = color ?? tokens.primary;
  const inactiveStroke = trackColor ?? `${tokens.primary}38`;

  return (
    <span
      role="progressbar"
      aria-label={label}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <path
          ref={trackPathRef}
          fill="none"
          stroke={inactiveStroke}
          strokeWidth={8.5}
          strokeLinecap="round"
        />
        <path
          ref={activePathRef}
          fill="none"
          stroke={activeStroke}
          strokeWidth={8.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
};

const TRIGGER_PX = 52;
const REFRESH_HOLD_PX = 50;
const MAX_TENSION_PX = 66;

/**
 * Smooth, heavily damped Pull-to-Refresh container for mobile:
 * pulling down from the top gently reveals the M3 Expressive wavy indicator with strong
 * logarithmic resistance past the trigger threshold so over-pulling never builds up whip tension.
 */
export const MobilePullToRefreshContainer: React.FC<{
  refreshing: boolean;
  onRefresh: () => void;
  children: React.ReactNode;
}> = ({ refreshing, onRefresh, children }) => {
  const [pullPx, setPullPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [pendingTriggerHold, setPendingTriggerHold] = useState(false);

  const pullingRef = useRef(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const lockedRef = useRef<'none' | 'pull' | 'ignore'>('none');
  const pullPxRef = useRef(0);
  const refreshingRef = useRef(refreshing);
  refreshingRef.current = refreshing;

  useEffect(() => {
    if (!refreshing && pendingTriggerHold) {
      const timer = window.setTimeout(() => setPendingTriggerHold(false), 180);
      return () => window.clearTimeout(timer);
    }
    if (refreshing && pendingTriggerHold) {
      setPendingTriggerHold(false);
    }
  }, [refreshing, pendingTriggerHold]);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= 920 || refreshingRef.current || e.touches.length !== 1) return;
      if (window.scrollY > 2) return;
      if (document.querySelector('[role="dialog"]')) return;

      const touch = e.touches[0]!;
      pullingRef.current = true;
      // Blocking touchmove only while a pull can actually happen: a permanent non-passive window
      // listener makes every scroll in the app wait for the main thread.
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      lockedRef.current = 'none';
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      pullPxRef.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || e.touches.length !== 1) return;
      const touch = e.touches[0]!;
      const dy = touch.clientY - startYRef.current;
      const dx = touch.clientX - startXRef.current;

      if (lockedRef.current === 'none') {
        if (Math.abs(dy) < 10 && Math.abs(dx) < 10) return;
        if (dy > 0 && dy > Math.abs(dx) * 1.25 && window.scrollY <= 2) {
          lockedRef.current = 'pull';
          setDragging(true);
        } else {
          lockedRef.current = 'ignore';
          pullingRef.current = false;
          return;
        }
      }

      if (lockedRef.current === 'pull') {
        if (dy <= 0) {
          pullPxRef.current = 0;
          setPullPx(0);
          return;
        }
        if (e.cancelable) {
          e.preventDefault();
        }
        // Soft damped tension: reaches ~52px comfortably, then gently asymptotes at 66px
        // so dragging far down the screen never accumulates excessive distance or snap-back force.
        const tension = MAX_TENSION_PX * (1 - Math.exp(-dy / 185));
        pullPxRef.current = tension;
        setPullPx(tension);
      }
    };

    const finishPull = () => {
      window.removeEventListener('touchmove', onTouchMove);
      if (!pullingRef.current) return;
      pullingRef.current = false;
      setDragging(false);
      const triggered = lockedRef.current === 'pull' && pullPxRef.current >= TRIGGER_PX;
      lockedRef.current = 'none';
      pullPxRef.current = 0;
      setPullPx(0);
      if (triggered && !refreshingRef.current) {
        setPendingTriggerHold(true);
        onRefresh();
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', finishPull, { passive: true });
    window.addEventListener('touchcancel', finishPull, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', finishPull);
      window.removeEventListener('touchcancel', finishPull);
    };
  }, [onRefresh]);

  const isHolding = refreshing || pendingTriggerHold;
  const offset = isHolding ? REFRESH_HOLD_PX : pullPx;
  const progress = Math.min(1, offset / TRIGGER_PX);
  const showIndicator = offset > 3;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Revealed gap above the page — opted out of contentSizeMorph so it never double-springs */}
      <div
        className="mobile-only-btn"
        data-no-size-morph
        aria-hidden={!showIndicator}
        style={{
          height: offset,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: dragging ? 'none' : 'height 380ms cubic-bezier(0.25, 0.85, 0.35, 1)',
        }}
      >
        <div
          data-no-size-morph
          style={{
            opacity: isHolding ? 1 : Math.min(1, progress * 1.15),
            transform: `scale(${isHolding ? 1 : 0.72 + progress * 0.28})`,
            transition:
              dragging
                ? 'none'
                : 'transform 340ms cubic-bezier(0.25, 0.85, 0.35, 1), opacity 260ms ease-out',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {(showIndicator || isHolding) && (
            <CircularWavyProgressIndicator
              size={36}
              progress={isHolding ? undefined : progress}
              label="Atualizando página"
            />
          )}
        </div>
      </div>

      {children}
    </div>
  );
};
