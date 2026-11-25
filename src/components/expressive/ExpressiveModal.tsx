import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePageScrollLock } from '../../theme/scrollLock';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useM3Theme } from '../../theme/ThemeContext';
import { IconShapeContainer } from './ExpressivePrimitives';
import { ShimmerVeil } from './ShimmerVeil';
import { useBackLayer } from '../../navigation/backStack';
import { DURATION, EASING, PATTERN, prefersReducedMotion, spring } from '../../theme/motion';

const EXIT_ANIMATION_MS = 220;
const SURFACE_RADIUS = 32;

/**
 * Compositor-only container transform keyframes (GPU `transform` + `opacity`, no `clip-path`).
 * Animating `clip-path: inset(... round ...)` on a full-viewport modal forces Android WebView
 * Skia OpenGL to re-rasterize the rounded mask, shadow, and inner layers on every frame.
 */
function containerKeyframes(origin: HTMLElement, surface: HTMLElement): [Keyframe, Keyframe] {
  const from = origin.getBoundingClientRect();
  const to = surface.getBoundingClientRect();
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const ratio = to.width > 0 && to.height > 0 ? Math.min(from.width / to.width, from.height / to.height) : 0.88;
  const startScale = Math.max(0.84, Math.min(0.96, Number.isFinite(ratio) ? ratio : 0.88));
  return [
    { transform: `translate3d(${dx * 0.35}px, ${dy * 0.35}px, 0) scale(${startScale})`, opacity: 0.2 },
    { transform: 'translate3d(0px, 0px, 0) scale(1)', opacity: 1 },
  ];
}

/**
 * Centered portal dialog sharing the exact look & motion of the subject details popup
 * (`m3-modal-*` enter/exit animations, blurred scrim, Escape + scrim dismissal, body scroll lock).
 *
 * `children` receives `close(next?)`: it plays the exit animation, then runs `next`
 * (or `onClose` when omitted), so in-dialog actions never cut the animation short.
 */
export const ExpressiveModal: React.FC<{
  ariaLabel: string;
  onClose: () => void;
  maxWidth?: number;
  zIndex?: number;
  dismissible?: boolean;
  /**
   * Element the dialog was opened from (card, row, button). When given, the dialog uses the M3
   * container transform: it grows out of the element and shrinks back into it on close.
   * Otherwise it uses the M3 fade pattern.
   */
  originEl?: HTMLElement | null;
  /**
   * When set, covers the entire dialog surface with the Circle-to-Search loading veil while true
   * (smoothly braking out when false), keeping the close button layered on top of the veil.
   */
  loadingVeil?: boolean;
  children: (close: (next?: () => void) => void) => React.ReactNode;
}> = ({
  ariaLabel,
  onClose,
  maxWidth = 720,
  zIndex = 9999,
  dismissible = true,
  originEl = null,
  loadingVeil,
  children,
}) => {
  const { tokens } = useM3Theme();
  const [isClosing, setIsClosing] = useState(false);
  // Delay showing the loading veil by 140ms so fast responses (<140ms) never mount/unmount
  // oversized shimmer layers mid-opening animation.
  const [delayedVeilActive, setDelayedVeilActive] = useState(false);
  const [veilVisible, setVeilVisible] = useState(false);
  const closingRef = useRef(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loadingVeil) {
      setDelayedVeilActive(false);
      return;
    }
    const timer = window.setTimeout(() => setDelayedVeilActive(true), 140);
    return () => window.clearTimeout(timer);
  }, [loadingVeil]);
  // Freeze the opening origin for this dialog's lifetime so parent re-renders or inner clicks
  // never drop `originEl` and re-trigger the CSS fade-enter animation mid-session.
  const [capturedOrigin] = useState<HTMLElement | null>(() => originEl);
  const useContainerTransform = Boolean(capturedOrigin) && !prefersReducedMotion();

  // Container transform, enter: the surface grows from the origin on the default spatial spring
  // while the incoming content fades in over the first 25% (MDC FADE_MODE_IN).
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!useContainerTransform || !capturedOrigin || !surface) return;
    const { easing, duration } = spring('defaultSpatial');
    surface.animate(containerKeyframes(capturedOrigin, surface), { duration, easing });
    contentRef.current?.animate(
      [{ opacity: 0 }, { opacity: 1, offset: PATTERN.containerFadeInEnd }, { opacity: 1 }],
      { duration, easing: EASING.linear }
    );
    // Mount-only: the transform belongs to the opening of this dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(
    (next?: () => void) => {
      if (closingRef.current) return;
      closingRef.current = true;
      setIsClosing(true);
      const finish = next ?? onClose;
      const surface = surfaceRef.current;
      // Container transform, return: shrink back into the origin if it is still on screen.
      if (useContainerTransform && capturedOrigin?.isConnected && surface) {
        const [collapsed, expanded] = containerKeyframes(capturedOrigin, surface);
        const duration = DURATION.medium1;
        surface.animate([expanded, collapsed], { duration, easing: EASING.emphasizedAccelerate, fill: 'forwards' });
        contentRef.current?.animate([{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }], {
          duration,
          fill: 'forwards',
        });
        window.setTimeout(finish, duration);
        return;
      }
      window.setTimeout(finish, EXIT_ANIMATION_MS);
    },
    [onClose, capturedOrigin, useContainerTransform]
  );

  // Predictive back: the gesture previews the dialog and fades the scrim; a committed gesture
  // has already animated the dialog out, so it is removed without replaying the exit.
  useBackLayer(
    true,
    (source) => {
      if (source === 'gesture') {
        closingRef.current = true;
        onClose();
      } else {
        close();
      }
    },
    { kind: dismissible ? 'modal' : 'blocking', surfaceRef, scrimRef }
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [close, dismissible]);
  usePageScrollLock();

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Keeps the dialog below the status bar and above the software keyboard.
        padding:
          'calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px) + var(--nsac-ime-height, 0px))',
        transition: 'padding-bottom 120ms linear',
      }}
    >
      <div
        ref={scrimRef}
        aria-hidden="true"
        onClick={dismissible ? () => close() : undefined}
        className={isClosing ? 'm3-modal-backdrop-exit' : 'm3-modal-backdrop'}
        style={{
          position: 'absolute',
          inset: 0,
          // M3 scrim: plain dim, no blur. A backdrop blur under a scrolling dialog has to be
          // re-composited on every scroll frame (measured: ~35 dropped frames per 2s at 4x CPU).
          backgroundColor: 'rgba(0, 0, 0, 0.74)',
        }}
      />
      <div
        ref={surfaceRef}
        className={useContainerTransform ? undefined : isClosing ? 'm3-modal-dialog-exit' : 'm3-modal-dialog-enter'}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth,
          maxHeight:
            'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - var(--nsac-ime-height, 0px) - 32px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxSizing: 'border-box',
          borderRadius: SURFACE_RADIUS,
          backgroundColor: tokens.surfaceContainerLow,
          color: tokens.onSurface,
          border: `1px solid ${tokens.outlineVariant}`,
          boxShadow: '0 28px 72px rgba(0, 0, 0, 0.55)',
        }}
      >
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: loadingVeil ? 'hidden' : 'auto',
            overflowX: 'hidden',
            overscrollBehavior: 'contain',
            boxSizing: 'border-box',
            padding: '22px 24px 28px',
          }}
        >
          <div ref={contentRef} data-no-size-morph>
            {children(close)}
          </div>
        </div>
        {loadingVeil !== undefined && (delayedVeilActive || veilVisible) && (
          <div
            data-no-size-morph
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 2,
              pointerEvents: 'none',
              borderRadius: 'inherit',
              overflow: 'hidden',
            }}
          >
            <ShimmerVeil
              active={delayedVeilActive}
              radius={SURFACE_RADIUS}
              surface
              onMountedChange={setVeilVisible}
            />
          </div>
        )}
        {loadingVeil !== undefined && veilVisible && dismissible && (
          <div
            data-no-size-morph
            style={{
              position: 'absolute',
              top: 22,
              right: 24,
              zIndex: 3,
            }}
          >
            <ModalIconButton label="Fechar" onClick={() => close()}>
              <X size={18} />
            </ModalIconButton>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

/** Round tonal icon button used in dialog/page headers (close, expand, back). */
export const ModalIconButton: React.FC<{
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, onClick, children }) => {
  const { tokens } = useM3Theme();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: 38,
        height: 38,
        borderRadius: 999,
        border: `1px solid ${tokens.outlineVariant}`,
        backgroundColor: tokens.surfaceContainerHigh,
        color: tokens.onSurface,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
};

/** Header row: shaped icon + eyebrow + title on the left, actions (close by default) on the right. */
export const ModalHeader: React.FC<{
  icon: React.ReactNode;
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  onClose?: () => void;
  actions?: React.ReactNode;
}> = ({ icon, eyebrow, title, onClose, actions }) => {
  const { tokens } = useM3Theme();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <IconShapeContainer size={46} active>
          {icon}
        </IconShapeContainer>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: '0.76rem',
              fontWeight: 700,
              color: tokens.primary,
              textTransform: 'uppercase',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {eyebrow}
          </div>
          <h2
            style={{
              margin: '4px 0 0',
              fontFamily: 'Outfit, sans-serif',
              fontSize: '1.45rem',
              fontWeight: 800,
              overflowWrap: 'anywhere',
            }}
          >
            {title}
          </h2>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {actions}
        {onClose && (
          <ModalIconButton label="Fechar" onClick={onClose}>
            <X size={18} />
          </ModalIconButton>
        )}
      </div>
    </div>
  );
};

/**
 * Summary metric tile from the subject details popup (label / big value / caption),
 * shared so every dialog renders its KPIs with the same shape and type scale.
 */
export const MetricTile: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  caption?: React.ReactNode;
  background: string;
  color: string;
  borderColor?: string;
  labelColor?: string;
  captionColor?: string;
  compactValue?: boolean;
}> = ({ label, value, caption, background, color, borderColor, labelColor, captionColor, compactValue = false }) => (
  <div
    style={{
      padding: '14px 16px',
      borderRadius: 22,
      backgroundColor: background,
      color,
      border: borderColor ? `1px solid ${borderColor}` : undefined,
      minWidth: 0,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontSize: '0.7rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        color: labelColor,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontFamily: 'Outfit, sans-serif',
        fontSize: compactValue ? '1.02rem' : '1.75rem',
        fontWeight: 800,
        marginTop: compactValue ? 6 : 4,
      }}
    >
      {value}
    </div>
    {caption !== undefined && (
      <div style={{ fontSize: '0.74rem', marginTop: 2, opacity: captionColor ? 1 : 0.85, color: captionColor }}>
        {caption}
      </div>
    )}
  </div>
);

/** Container transform origins by priority: the whole card/row reads better than the button in it. */
const ORIGIN_SELECTORS = ['[data-transform-origin]', '.m3-segmented-card', 'tr', '[role="button"]', 'button'];

/**
 * Remembers the card/row/button the user last clicked inside a screen, so a dialog opened by
 * that click can grow out of it (container transform) without threading refs through every
 * call site. Attach `onClickCapture` to the screen root and pass `originRef.current` as `originEl`.
 */
export function useTransformOrigin(): {
  originRef: React.MutableRefObject<HTMLElement | null>;
  onClickCapture: (event: React.MouseEvent) => void;
} {
  const originRef = useRef<HTMLElement | null>(null);
  const onClickCapture = useCallback((event: React.MouseEvent) => {
    const target = event.target as HTMLElement | null;
    // Portaled dialogs bubble React events to the screen root; never let inner clicks overwrite
    // the card/row that originally opened the dialog.
    if (target?.closest('[role="dialog"]')) return;
    originRef.current = null;
    for (const selector of ORIGIN_SELECTORS) {
      const match = target?.closest<HTMLElement>(selector);
      if (match) {
        originRef.current = match;
        break;
      }
    }
  }, []);
  return { originRef, onClickCapture };
}
