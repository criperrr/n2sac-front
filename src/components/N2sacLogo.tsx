import React, { useEffect, useId, useRef } from 'react';
import { useM3Theme } from '../theme/ThemeContext';
import { N2SAC_LOGO_PATHS } from './n2sacLogoPaths';

export interface N2sacLogoProps {
  /** Rendered width and height in CSS pixels. */
  size?: number;
  /**
   * - `static`: stays still (0 rAF, 0 animations). If previously spinning, coasts smoothly to rest.
   * - `settle`: gives one smooth spin impulse on mount, then coasts gracefully to a complete stop (0 fps idle).
   * - `spin`: smoothly accelerates and maintains continuous planetary spin while active, then coasts to rest when stopped.
   * - `boot`: 2000ms turbo-ramp + 400ms brake-to-0° + Google M3 spring pop.
   */
  mode?: 'static' | 'settle' | 'spin' | 'boot';
  /** Optional key to replay `settle` or `boot` on demand. */
  replayKey?: number;
  className?: string;
  style?: React.CSSProperties;
}

/** Read current Z-rotation angle (in degrees) from a compositor-animated element's computed matrix. */
function readCurrentAngleDeg(el: Element | null, fallback = 0): number {
  if (!el) return fallback;
  const tr = window.getComputedStyle(el).transform;
  if (!tr || tr === 'none') return fallback;
  const m = tr.match(/matrix\(([^)]+)\)/);
  const raw = m?.[1];
  if (!raw) return fallback;
  const parts = raw.split(',').map((v) => parseFloat(v.trim()));
  const a = parts[0];
  const b = parts[1];
  if (a === undefined || b === undefined || Number.isNaN(a) || Number.isNaN(b)) return fallback;
  return (Math.atan2(b, a) * 180) / Math.PI;
}

export const N2sacLogo: React.FC<N2sacLogoProps> = React.memo(({
  size = 44,
  mode = 'static',
  replayKey = 0,
  className,
  style,
}) => {
  const { tokens, effectiveIsDark: isDark } = useM3Theme();
  const uid = useId().replace(/:/g, '');
  const maskId = `n2sac-seal-mask-${uid}`;

  const orb1Ref = useRef<SVGSVGElement | null>(null);
  const orb2Ref = useRef<SVGSVGElement | null>(null);
  const sealRef = useRef<SVGSVGElement | null>(null);

  // Off-main-thread Web Animations API handles (100% GPU compositor, immune to JS main-thread jank!)
  const animsRef = useRef<{
    orb1: Animation | null;
    orb2: Animation | null;
    seal: Animation | null;
    hasSettledOnce: boolean;
    wasSpinning: boolean;
  }>({
    orb1: null,
    orb2: null,
    seal: null,
    hasSettledOnce: false,
    wasSpinning: false,
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const state = animsRef.current;
    const layers: Array<{
      key: 'orb1' | 'orb2' | 'seal';
      el: SVGSVGElement | null;
      spinMs: number;
      dir: 1 | -1;
      coastDeg: number;
    }> = [
      { key: 'orb1', el: orb1Ref.current, spinMs: 1500, dir: 1, coastDeg: 180 },
      { key: 'orb2', el: orb2Ref.current, spinMs: 1920, dir: -1, coastDeg: -140 },
      { key: 'seal', el: sealRef.current, spinMs: 3570, dir: 1, coastDeg: 75 },
    ];

    if (mode === 'spin') {
      state.wasSpinning = true;
      for (const l of layers) {
        if (!l.el || typeof l.el.animate !== 'function') continue;
        const startDeg = readCurrentAngleDeg(l.el, 0);
        state[l.key]?.cancel();
        state[l.key] = l.el.animate(
          [
            { transform: `rotate(${startDeg.toFixed(2)}deg)` },
            { transform: `rotate(${(startDeg + 360 * l.dir).toFixed(2)}deg)` },
          ],
          {
            duration: l.spinMs,
            iterations: Infinity,
            easing: 'linear',
          }
        );
      }
      return;
    }

    // Decelerate smoothly on the GPU compositor when stopping a spin OR on initial `settle` mount
    const shouldCoast = state.wasSpinning || (mode === 'settle' && !state.hasSettledOnce);
    if (mode === 'settle') state.hasSettledOnce = true;
    state.wasSpinning = false;

    if (shouldCoast) {
      for (const l of layers) {
        if (!l.el || typeof l.el.animate !== 'function') continue;
        const startDeg = readCurrentAngleDeg(l.el, 0);
        const endDeg = startDeg + l.coastDeg;
        state[l.key]?.cancel();
        state[l.key] = l.el.animate(
          [
            { transform: `rotate(${startDeg.toFixed(2)}deg)` },
            { transform: `rotate(${endDeg.toFixed(2)}deg)` },
          ],
          {
            duration: 950,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'forwards',
          }
        );
      }
    }
  }, [mode, replayKey]);

  // Clean up compositor animations only on unmount
  useEffect(() => {
    return () => {
      const state = animsRef.current;
      state.orb1?.cancel();
      state.orb2?.cancel();
      state.seal?.cancel();
    };
  }, []);

  // Always adapt logo roles to the active theme palette (both Default Editorial and Material You)
  const sealColor = tokens.primary;
  const orb1Color = tokens.tertiary;
  const orb2Color = tokens.secondary;
  const textColor = tokens.onSurface;
  const blendMode: React.CSSProperties['mixBlendMode'] = isDark ? 'screen' : 'multiply';

  const layerBase: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    display: 'block',
    transformOrigin: 'center center',
    pointerEvents: 'none',
  };

  // IMPORTANT: Never set `transform` in JSX style on animated layers!
  // Otherwise React resets `style.transform` back to 0deg on every re-render,
  // causing visible stutter/snap-back while the rAF loop is spinning.
  const gpuLayer: React.CSSProperties = {
    ...layerBase,
    willChange: 'transform',
  };

  return (
    <div
      role="img"
      aria-label="Logo n²sac"
      className={className}
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        isolation: 'isolate',
        ...style,
      }}
    >
      {/* Layer 1: Orbital 1 (GPU-composited, rasterized once) */}
      <svg
        ref={orb1Ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1000 1000"
        aria-hidden="true"
        style={{ ...gpuLayer, mixBlendMode: blendMode }}
      >
        <path fill={orb1Color} fillOpacity={0.54} fillRule="evenodd" d={N2SAC_LOGO_PATHS.orbital1} />
      </svg>

      {/* Layer 2: Orbital 2 (GPU-composited, rasterized once) */}
      <svg
        ref={orb2Ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1000 1000"
        aria-hidden="true"
        style={{ ...gpuLayer, mixBlendMode: blendMode }}
      >
        <path fill={orb2Color} fillOpacity={0.52} fillRule="evenodd" d={N2SAC_LOGO_PATHS.orbital2} />
      </svg>

      {/* Layer 3: Wavy Seal + Mask (GPU-composited, mask rasterized ONCE instead of every frame!) */}
      <svg
        ref={sealRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1000 1000"
        aria-hidden="true"
        style={gpuLayer}
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width="1000" height="1000" fill="white" />
            <path fill="black" fillRule="evenodd" d={N2SAC_LOGO_PATHS.cutouts.topDots} />
            <path
              fill="none"
              stroke="black"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
              d={N2SAC_LOGO_PATHS.cutouts.waveTl}
            />
            <path fill="black" fillRule="evenodd" d={N2SAC_LOGO_PATHS.cutouts.planetTr} />
            <path fill="black" fillRule="evenodd" d={N2SAC_LOGO_PATHS.cutouts.rightCluster} />
            <path
              fill="none"
              stroke="black"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray="22 18"
              d={N2SAC_LOGO_PATHS.cutouts.dashArcBr}
            />
            <path
              fill="none"
              stroke="black"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
              d={N2SAC_LOGO_PATHS.cutouts.waveBl}
            />
            <path fill="black" fillRule="evenodd" d={N2SAC_LOGO_PATHS.cutouts.accentDots} />
          </mask>
        </defs>
        <g fill={sealColor} fillRule="evenodd" mask={`url(#${maskId})`}>
          <path d={N2SAC_LOGO_PATHS.wavySeal} />
        </g>
      </svg>

      {/* Layer 4: Static n²sac Typography */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1000 1000"
        aria-hidden="true"
        style={layerBase}
      >
        <g fill={textColor} fillRule="evenodd">
          <path d={N2SAC_LOGO_PATHS.letterN} />
          <path d={N2SAC_LOGO_PATHS.superscript2} />
          <path d={N2SAC_LOGO_PATHS.letterS} />
          <path d={N2SAC_LOGO_PATHS.letterA} />
          <path d={N2SAC_LOGO_PATHS.letterC} />
        </g>
      </svg>
    </div>
  );
});
