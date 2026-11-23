import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DesignSystemMode, M3ColorTokens } from '../theme/materialYou';

/**
 * Full-Screen Choreographed Transition / Loading Screen when switching between:
 * 1. `default -> material-you`: Authentic Android AOSP Material You Dynamic Color & Shape Morphing Boot Animation
 *    (expanding circular color ripple from center, morphing 6-point M3 Cookie -> Clover -> Squircle rotating with spring physics,
 *    and segmented AOSP loading wave).
 * 2. `material-you -> default`: OpenAI-inspired Editorial High-Craft Transition Animation
 *    (precision monochrome `#0D0D0D` carbon canvas, 1px hairline geometric reticle & concentric bloom aperture,
 *    emerald `#10A37F` focal pulse, and crisp typographic shutter reveal).
 */
export const DesignSystemTransitionOverlay: React.FC<{
  targetMode: DesignSystemMode | null;
  phase: 'entering' | 'exiting' | null;
  tokens: M3ColorTokens;
  seedHex: string;
}> = ({ targetMode, phase, tokens, seedHex }) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!targetMode) {
      setStep(0);
      return;
    }
    setStep(0);
    const t1 = window.setTimeout(() => setStep(1), 260);
    const t2 = window.setTimeout(() => setStep(2), 540);
    const t3 = window.setTimeout(() => setStep(3), 820);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [targetMode]);

  if (!targetMode || !phase || typeof document === 'undefined') return null;

  const isToMaterialYou = targetMode === 'material-you';

  const overlay = isToMaterialYou ? (
    <div
      role="status"
      aria-live="polite"
      className={`ds-transition-overlay ds-aosp-overlay ${phase === 'exiting' ? 'ds-overlay-exit' : 'ds-overlay-enter'}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: tokens.background,
        color: tokens.onBackground,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Expanding AOSP Dynamic Color Ripple Rings */}
      <div
        className="aosp-ripple-ring aosp-ripple-1"
        style={{
          borderColor: seedHex,
          backgroundColor: `${tokens.primaryContainer}45`,
        }}
      />
      <div
        className="aosp-ripple-ring aosp-ripple-2"
        style={{
          borderColor: tokens.secondary,
          backgroundColor: `${tokens.secondaryContainer}33`,
        }}
      />

      {/* Morphing AOSP M3 Geometric Container (Cookie6 -> Clover -> Squircle) */}
      <div className="aosp-morph-stage">
        <svg
          width="124"
          height="124"
          viewBox="0 0 100 100"
          className="aosp-morph-svg"
        >
          {step === 0 && (
            <path
              d="M50 4 C58 4, 62 12, 70 14 C78 16, 86 14, 90 22 C94 30, 88 38, 88 50 C88 62, 94 70, 90 78 C86 86, 78 84, 70 86 C62 88, 58 96, 50 96 C42 96, 38 88, 30 86 C22 84, 14 86, 10 78 C6 70, 12 62, 12 50 C12 38, 6 30, 10 22 C14 14, 22 16, 30 14 C38 12, 42 4, 50 4 Z"
              fill={tokens.primaryContainer}
              stroke={tokens.primary}
              strokeWidth="2.5"
            />
          )}
          {step === 1 && (
            <path
              d="M50 10 C64 4, 78 14, 82 28 C96 32, 96 68, 82 72 C78 86, 64 96, 50 90 C36 96, 22 86, 18 72 C4 68, 4 32, 18 28 C22 14, 36 4, 50 10 Z"
              fill={tokens.secondaryContainer}
              stroke={tokens.primary}
              strokeWidth="2.5"
            />
          )}
          {step >= 2 && (
            <path
              d="M50 6 C80 6, 94 20, 94 50 C94 80, 80 94, 50 94 C20 94, 6 80, 6 50 C6 20, 20 6, 50 6 Z"
              fill={tokens.primary}
            />
          )}
        </svg>
        <div
          className="aosp-center-glyph"
          style={{
            color: step >= 2 ? tokens.onPrimary : tokens.onPrimaryContainer,
          }}
        >
          n²
        </div>
      </div>

      {/* Typography & Expressive Wavy Pill Loader */}
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', marginTop: 28 }}>
        <div
          style={{
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 800,
            fontSize: '1.45rem',
            letterSpacing: '-0.02em',
            color: tokens.onSurface,
          }}
        >
          Ativando Redesign Material You
        </div>
        <div
          style={{
            fontFamily: 'Nunito, sans-serif',
            fontSize: '0.86rem',
            color: tokens.onSurfaceVariant,
            marginTop: 6,
          }}
        >
          Aplicando formas dinâmicas, superfícies tonais e física de mola...
        </div>

        {/* AOSP Expressive Segmented Pill Track */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            width: 220,
            margin: '18px auto 0',
          }}
        >
          {[0, 1, 2, 3].map((idx) => {
            const active = step >= idx;
            return (
              <div
                key={idx}
                style={{
                  flex: active ? 1.6 : 1,
                  height: 10,
                  borderRadius: 999,
                  backgroundColor: active ? tokens.primary : tokens.surfaceContainerHighest,
                  transition: 'all 260ms cubic-bezier(0.22, 1.25, 0.36, 1)',
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  ) : (
    /* PATH B: Material You -> Padrão (OpenAI High-Craft Editorial Transition) */
    <div
      role="status"
      aria-live="polite"
      className={`ds-transition-overlay ds-openai-overlay ${phase === 'exiting' ? 'ds-overlay-exit' : 'ds-overlay-enter'}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: '#0D0D0D',
        color: '#F5F5F5',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Precision 1px Hairline Editorial Grid Reticle */}
      <div className="openai-grid-reticle" />

      {/* OpenAI-Inspired Concentric Geometric Aperture Bloom */}
      <div className="openai-aperture-stage">
        <svg width="112" height="112" viewBox="0 0 120 120" className="openai-aperture-svg">
          {/* Outer precision hairline ring */}
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke="#262626"
            strokeWidth="1"
          />
          {/* 6 Geometric Petals / Blades converging to center */}
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <g key={angle} transform={`rotate(${angle} 60 60)`}>
              <rect
                x="46"
                y="18"
                width="28"
                height="42"
                rx="14"
                fill="none"
                stroke={step >= 2 ? '#F5F5F5' : '#10A37F'}
                strokeWidth="1.5"
                strokeOpacity="0.85"
                className="openai-petal-rect"
              />
            </g>
          ))}
          {/* Center Focal Pulse Dot */}
          <circle
            cx="60"
            cy="60"
            r={step >= 2 ? 7 : 4}
            fill="#10A37F"
            style={{ transition: 'r 280ms cubic-bezier(0.16, 1, 0.3, 1)' }}
          />
        </svg>
      </div>

      {/* Editorial Typography & Hairline Progress Bar */}
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', marginTop: 26 }}>
        <div
          style={{
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
            fontWeight: 700,
            fontSize: '1.35rem',
            letterSpacing: '-0.03em',
            color: '#F5F5F5',
          }}
        >
          n²sac
        </div>
        <div
          style={{
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: '0.74rem',
            color: '#A3A3A3',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginTop: 6,
          }}
        >
          Restaurando Design Padrão
        </div>

        {/* Hairline 1px Progress Line */}
        <div
          style={{
            width: 200,
            height: 2,
            backgroundColor: '#262626',
            margin: '18px auto 0',
            overflow: 'hidden',
            borderRadius: 2,
          }}
        >
          <div
            style={{
              width: `${Math.min(100, (step + 1) * 28)}%`,
              height: '100%',
              backgroundColor: '#10A37F',
              transition: 'width 260ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};
