import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { prefersReducedMotion } from '../theme/motion';
import { useM3Theme } from '../theme/ThemeContext';
import { shapePaths } from './expressive/ShapeMorph';

/** Android Material 3 Expressive 12-ray AOSP Sunny / sunburst silhouette (rendered outline-only). */
const SUNBURST_PATH = shapePaths(49)[0]!;

const SPARKLE_PARTICLES = [
  { tx: -42, ty: -28, color: '#FACC15', delay: 0 },
  { tx: -26, ty: -44, color: '#F59E0B', delay: 20 },
  { tx: 0, ty: -48, color: '#FDE047', delay: 8 },
  { tx: 26, ty: -44, color: '#34D399', delay: 24 },
  { tx: 42, ty: -28, color: '#FACC15', delay: 12 },
  { tx: 48, ty: -4, color: '#60A5FA', delay: 28 },
  { tx: 40, ty: 24, color: '#F59E0B', delay: 16 },
  { tx: 18, ty: 38, color: '#FDE047', delay: 32 },
  { tx: -18, ty: 38, color: '#34D399', delay: 24 },
  { tx: -40, ty: 24, color: '#60A5FA', delay: 12 },
  { tx: -48, ty: -4, color: '#FACC15', delay: 20 },
  { tx: 12, ty: -38, color: '#F472B6', delay: 36 },
];

export function isPerfectTen(grade: number | null | undefined): boolean {
  return grade !== null && grade !== undefined && Number.isFinite(grade) && grade >= 9.995;
}

function durationForGrade(grade: number): number {
  if (isPerfectTen(grade)) return 2950;
  if (grade >= 8.5) return 820;
  if (grade >= 7.0) return 640;
  if (grade >= 6.0) return 520;
  return 400;
}

function formatPtGrade(val: number): string {
  return val.toFixed(1).replace('.', ',');
}

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Continuous odometer position in tenths (`0.0 .. 100.0`) for a `10,0` grade (`progress` in `0..1`):
 *  - 0.00 -> 0.10 (0.30s): fast rocket 0,0 -> 8,0
 *  - 0.10 -> 0.23 (0.38s): slows down 8,0 -> 9,0
 *  - 0.23 -> 0.37 (0.41s): steady visible roll 9,0 -> 9,8
 *  - 0.37 -> 0.48 (0.32s): 1st roll 9,8 -> 9,9 (8 slides down out, 9 slides down in)
 *  - 0.48 -> 0.60 (0.35s): reverse 9,9 -> 9,8 (9 slides up out, 8 slides up in, slower)
 *  - 0.60 -> 0.80 (0.59s): slow dramatic final roll 9,8 -> 9,9
 *  - 0.80 -> 1.00 (0.59s): slow final descent of .9 out the bottom (99 -> 100, NO "10" peek!)
 *    -> at 1.00, "10,0" snaps in FAST with golden pop + shimmer + 12 sparkles on the exact same frame!
 */
function sampleTenOdometerPos(progress: number): number {
  if (progress < 0.10) {
    const p = progress / 0.10;
    return 80 * (1 - Math.pow(1 - p, 2.0));
  }
  if (progress < 0.23) {
    const p = (progress - 0.10) / 0.13;
    return 80 + 10 * (1 - Math.pow(1 - p, 1.7));
  }
  if (progress < 0.37) {
    const p = (progress - 0.23) / 0.14;
    return 90 + 8 * (1 - Math.pow(1 - p, 1.35));
  }
  if (progress < 0.48) {
    const p = (progress - 0.37) / 0.11;
    return 98 + easeInOutSine(p);
  }
  if (progress < 0.60) {
    const p = (progress - 0.48) / 0.12;
    return 99 - easeInOutSine(p);
  }
  if (progress < 0.80) {
    const p = (progress - 0.60) / 0.20;
    return 98 + easeInOutCubic(p);
  }
  const p = (progress - 0.80) / 0.20;
  return 99 + Math.pow(p, 1.15);
}

/**
 * Mechanical odometer-style grade reveal counter (GPU-only `translate3d`, 0 React re-renders per frame):
 * - Smooth vertical digit wheel where each tenth slides down out of view as the next descends from above.
 * - For `10,0`: an AOSP Material 3 Expressive sunburst **border-only outline** (`fill="none"`, golden stroke)
 *   mounts ONLY at the exact moment this `10,0` div begins its count-up animation, spins proportionally to
 *   the instantaneous speed of the numbers, and locks into a steady fixed rotation when `10,0` lands.
 */
export const GradeRevealScore: React.FC<{
  target: number | null;
  phase: 'waiting' | 'counting' | 'done';
  size?: 'pill' | 'hero';
  onComplete?: () => void;
}> = ({ target, phase, size = 'pill', onComplete }) => {
  const { tokens } = useM3Theme();
  const intRef = useRef<HTMLSpanElement>(null);
  const currDecRef = useRef<HTMLSpanElement>(null);
  const nextDecRef = useRef<HTMLSpanElement>(null);
  const wholeRollRef = useRef<HTMLSpanElement>(null);
  const sunburstSvgRef = useRef<SVGSVGElement>(null);
  const angleRef = useRef(0);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const perfect = isPerfectTen(target);
  const lowGrade = target !== null && target < 6.0;
  const [celebrating, setCelebrating] = useState(false);
  const [settled, setSettled] = useState(phase === 'done');
  const [animStarted, setAnimStarted] = useState(phase === 'done');
  const [finalSunAngle, setFinalSunAngle] = useState(0);

  useEffect(() => {
    const setStaticOdometer = (val: number | null) => {
      if (wholeRollRef.current) {
        wholeRollRef.current.style.transform = 'translate3d(0, 0, 0)';
        wholeRollRef.current.style.opacity = '1';
      }
      if (val === null) {
        if (intRef.current) intRef.current.textContent = size === 'hero' ? 'Atualizada' : 'Nova';
        if (currDecRef.current) {
          currDecRef.current.textContent = '';
          currDecRef.current.style.transform = 'translate3d(0, 0, 0)';
        }
        if (nextDecRef.current) {
          nextDecRef.current.textContent = '';
          nextDecRef.current.style.transform = 'translate3d(0, -110%, 0)';
        }
        return;
      }
      const parts = formatPtGrade(val).split(',');
      if (intRef.current) intRef.current.textContent = `${parts[0]},`;
      if (currDecRef.current) {
        currDecRef.current.textContent = parts[1] ?? '0';
        currDecRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
      if (nextDecRef.current) {
        nextDecRef.current.textContent = '';
        nextDecRef.current.style.transform = 'translate3d(0, -110%, 0)';
      }
    };

    if (phase === 'waiting') {
      completedRef.current = false;
      angleRef.current = 0;
      setAnimStarted(false);
      setSettled(false);
      setCelebrating(false);
      setStaticOdometer(target !== null ? 0 : null);
      return;
    }

    if (phase === 'done') {
      setAnimStarted(true);
      setSettled(true);
      setStaticOdometer(target);
      return;
    }

    // phase === 'counting'
    if (completedRef.current) return;

    if (target === null || prefersReducedMotion()) {
      completedRef.current = true;
      setAnimStarted(true);
      setSettled(true);
      setStaticOdometer(target);
      const t = window.setTimeout(() => onCompleteRef.current?.(), 60);
      return () => window.clearTimeout(t);
    }

    // Mount the AOSP border outline right as this div's counting animation begins!
    setAnimStarted(true);

    const totalMs = durationForGrade(target);
    const startAt = performance.now();
    let lastNow = startAt;
    let lastPos = 0;
    let rafId = 0;
    let nextTimer = 0;

    const renderOdometerPos = (pos: number, isFinalTenDrop: boolean) => {
      if (isFinalTenDrop) {
        const dropFrac = Math.max(0, Math.min(1, pos - 99));
        if (intRef.current) intRef.current.textContent = '9,';
        if (currDecRef.current) {
          currDecRef.current.textContent = '9';
          currDecRef.current.style.transform = 'translate3d(0, 0, 0)';
        }
        if (nextDecRef.current) {
          nextDecRef.current.textContent = '';
          nextDecRef.current.style.transform = 'translate3d(0, -110%, 0)';
        }
        if (wholeRollRef.current) {
          wholeRollRef.current.style.transform = `translate3d(0, ${(dropFrac * 120).toFixed(1)}%, 0)`;
          wholeRollRef.current.style.opacity = `${(1 - dropFrac * 0.75).toFixed(2)}`;
        }
        return;
      }

      if (wholeRollRef.current) {
        wholeRollRef.current.style.transform = 'translate3d(0, 0, 0)';
        wholeRollRef.current.style.opacity = '1';
      }

      const clamped = Math.max(0, Math.min(99, pos));
      const base = Math.floor(clamped);
      const frac = clamped - base;
      const currInt = Math.floor(base / 10);
      const currDec = base % 10;
      const nextStep = Math.min(99, base + 1);
      const nextDec = nextStep % 10;

      if (intRef.current) {
        intRef.current.textContent = `${currInt},`;
      }
      if (currDecRef.current) {
        currDecRef.current.textContent = String(currDec);
        currDecRef.current.style.transform = `translate3d(0, ${(frac * 105).toFixed(1)}%, 0)`;
      }
      if (nextDecRef.current) {
        nextDecRef.current.textContent = frac > 0.005 ? String(nextDec) : '';
        nextDecRef.current.style.transform = `translate3d(0, ${((frac - 1) * 105).toFixed(1)}%, 0)`;
      }
    };

    const tick = (now: number) => {
      const dtSec = Math.max(0.004, Math.min(0.05, (now - lastNow) / 1000));
      lastNow = now;
      const elapsed = now - startAt;
      const progress = Math.min(1, elapsed / totalMs);

      if (progress < 1) {
        if (perfect) {
          const pos = sampleTenOdometerPos(progress);
          const deltaPos = pos - lastPos;
          lastPos = pos;
          const signedVelocity = deltaPos / dtSec;
          const clampedDegPerSec = Math.max(-220, Math.min(720, signedVelocity * 5.8));
          const minCreep = Math.abs(clampedDegPerSec) < 14 ? Math.sign(deltaPos || 1) * 14 : clampedDegPerSec;
          angleRef.current = (angleRef.current + minCreep * dtSec) % 360;
          if (sunburstSvgRef.current) {
            sunburstSvgRef.current.style.transform = `rotate(${angleRef.current.toFixed(1)}deg)`;
          }
          renderOdometerPos(pos, pos > 99.0);
        } else {
          const power = target >= 8.0 ? 3.0 : 2.4;
          const eased = 1 - Math.pow(1 - progress, power);
          renderOdometerPos(target * 10 * eased, false);
        }
        rafId = requestAnimationFrame(tick);
      } else {
        completedRef.current = true;
        if (perfect) {
          setFinalSunAngle(angleRef.current);
          setSettled(true);
          setCelebrating(true);
          try {
            navigator.vibrate?.([14, 45, 28]);
          } catch {
            // Haptics unavailable
          }
          nextTimer = window.setTimeout(() => onCompleteRef.current?.(), 580);
        } else {
          setStaticOdometer(target);
          setSettled(true);
          try {
            navigator.vibrate?.(6);
          } catch {
            // Haptics unavailable
          }
          nextTimer = window.setTimeout(() => onCompleteRef.current?.(), 140);
        }
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (nextTimer) window.clearTimeout(nextTimer);
    };
  }, [phase, target, perfect, size]);

  // Synchronize clean static text BEFORE paint when `settled` commits.
  useLayoutEffect(() => {
    if (!settled) return;
    if (wholeRollRef.current) {
      wholeRollRef.current.style.transform = 'translate3d(0, 0, 0)';
      wholeRollRef.current.style.opacity = '1';
    }
    if (target === null) return;
    const parts = formatPtGrade(target).split(',');
    if (intRef.current) intRef.current.textContent = `${parts[0]},`;
    if (currDecRef.current) {
      currDecRef.current.textContent = parts[1] ?? '0';
      currDecRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
    if (nextDecRef.current) {
      nextDecRef.current.textContent = '';
      nextDecRef.current.style.transform = 'translate3d(0, -110%, 0)';
    }
  }, [settled, target]);

  const showTenStyle = perfect && settled;
  const showTenSuspense = perfect && phase === 'counting' && !settled;
  // Strictly appear ONLY on 10,0 grades and ONLY after this specific div has started its count-up animation!
  const showSunburst = perfect && animStarted && phase !== 'waiting';

  const initialInt =
    target === null
      ? size === 'hero'
        ? 'Atualizada'
        : 'Nova'
      : settled
        ? `${formatPtGrade(target).split(',')[0]},`
        : '0,';
  const initialDec =
    target === null ? '' : settled ? (formatPtGrade(target).split(',')[1] ?? '0') : '0';

  /**
   * Renders the AOSP Material 3 Sunny/sunburst figure strictly by its border (`fill="none"`,
   * crisp golden `stroke`) hugging the perimeter of the score badge with zero interior fill.
   */
  const renderSunburstBorder = (haloWidth: number, haloHeight: number, strokeW: number) =>
    showSunburst ? (
      <span
        className="nsac-ten-sunburst-wrap"
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: haloWidth,
          height: haloHeight,
          marginLeft: -haloWidth / 2,
          marginTop: -haloHeight / 2,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        <svg
          ref={sunburstSvgRef}
          viewBox="-4 -4 108 108"
          className={settled && !prefersReducedMotion() ? 'nsac-ten-sunburst-steady' : undefined}
          style={
            {
              width: '100%',
              height: '100%',
              display: 'block',
              overflow: 'visible',
              '--nsac-sun-angle': `${finalSunAngle.toFixed(1)}deg`,
            } as React.CSSProperties
          }
        >
          <path
            d={SUNBURST_PATH}
            fill="none"
            stroke={showTenStyle ? '#FACC15' : '#F59E0B'}
            strokeWidth={strokeW}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            opacity={showTenStyle ? 1 : 0.9}
          />
        </svg>
      </span>
    ) : null;

  const odometerContent = (
    <span
      data-no-size-morph
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        overflow: 'hidden',
        height: '1.22em',
        lineHeight: 1.22,
        verticalAlign: 'middle',
      }}
    >
      <span
        ref={wholeRollRef}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          willChange: phase === 'counting' ? 'transform, opacity' : undefined,
        }}
      >
        <span ref={intRef}>{initialInt}</span>
        {target !== null && (
          <span
            style={{
              position: 'relative',
              display: 'inline-block',
              width: '0.62em',
              height: '1.22em',
              overflow: 'hidden',
              textAlign: 'center',
            }}
          >
            <span
              ref={currDecRef}
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                willChange: phase === 'counting' ? 'transform' : undefined,
              }}
            >
              {initialDec}
            </span>
            <span
              ref={nextDecRef}
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: 'translate3d(0, -110%, 0)',
                willChange: phase === 'counting' ? 'transform' : undefined,
              }}
            />
          </span>
        )}
      </span>
    </span>
  );

  if (size === 'hero') {
    return (
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: showSunburst ? 74 : undefined,
            height: showSunburst ? 74 : undefined,
          }}
        >
          {renderSunburstBorder(72, 72, 2.8)}
          <div
            className={
              showTenStyle
                ? 'nsac-perfect-ten-badge'
                : showTenSuspense
                  ? 'nsac-ten-suspense'
                  : settled
                    ? 'nsac-grade-settle'
                    : undefined
            }
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              width: showSunburst ? 58 : undefined,
              height: showSunburst ? 58 : undefined,
              padding: showSunburst ? 0 : '2px 0',
              borderRadius: showSunburst ? '50%' : 16,
              background: 'transparent',
              color: showTenStyle ? '#FDE047' : 'inherit',
              textShadow: showTenStyle ? '0 2px 12px rgba(245, 158, 11, 0.45)' : undefined,
              fontFamily: 'Outfit, sans-serif',
              fontSize: showSunburst ? '1.38rem' : '2rem',
              fontWeight: 900,
              fontVariantNumeric: 'tabular-nums',
              transition: 'color 180ms ease',
            }}
          >
            {odometerContent}
          </div>
        </div>

        {showTenStyle && (
          <span
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 999,
              backgroundColor: 'rgba(245, 158, 11, 0.2)',
              border: '1px solid rgba(250, 204, 21, 0.65)',
              color: '#FDE047',
              fontSize: '0.7rem',
              fontWeight: 900,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            <Sparkles size={13} strokeWidth={2.5} /> Nota Máxima
          </span>
        )}

        {celebrating &&
          SPARKLE_PARTICLES.map((p, idx) => (
            <span
              key={idx}
              className="nsac-ten-sparkle"
              aria-hidden="true"
              style={
                {
                  zIndex: 3,
                  backgroundColor: p.color,
                  animationDelay: `${p.delay}ms`,
                  '--tx': `${p.tx * 1.35}px`,
                  '--ty': `${p.ty * 1.35}px`,
                } as React.CSSProperties
              }
            />
          ))}
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 52,
        height: 52,
        flexShrink: 0,
      }}
    >
      {renderSunburstBorder(50, 50, 2.5)}
      <div
        className={
          showTenStyle
            ? 'nsac-perfect-ten-badge'
            : showTenSuspense
              ? 'nsac-ten-suspense'
              : settled
                ? 'nsac-grade-settle'
                : undefined
        }
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: showSunburst ? 42 : undefined,
          height: showSunburst ? 42 : 32,
          minWidth: showSunburst ? 42 : 50,
          padding: showSunburst ? 0 : '4px 9px',
          borderRadius: 999,
          background: showSunburst
            ? 'transparent'
            : lowGrade
              ? tokens.errorContainer
              : tokens.primaryContainer,
          color: showTenStyle
            ? '#FDE047'
            : showSunburst
              ? tokens.onSurface
              : lowGrade
                ? tokens.onErrorContainer
                : tokens.onPrimaryContainer,
          textShadow: showTenStyle ? '0 2px 10px rgba(245, 158, 11, 0.45)' : undefined,
          opacity: phase === 'waiting' ? 0.42 : 1,
          transform: phase === 'waiting' ? 'scale(0.92)' : undefined,
          transition:
            'opacity 180ms ease, transform 200ms ease, color 180ms ease, background-color 180ms ease',
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 900,
          fontSize: showSunburst ? '0.94rem' : '1.0rem',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {odometerContent}
      </div>

      {celebrating &&
        SPARKLE_PARTICLES.map((p, idx) => (
          <span
            key={idx}
            className="nsac-ten-sparkle"
            aria-hidden="true"
            style={
              {
                zIndex: 3,
                backgroundColor: p.color,
                animationDelay: `${p.delay}ms`,
                '--tx': `${p.tx}px`,
                '--ty': `${p.ty}px`,
              } as React.CSSProperties
            }
          />
        ))}
    </div>
  );
};
