import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { usePageScrollLock } from '../../theme/scrollLock';
import { createPortal } from 'react-dom';
import { useM3Theme } from '../../theme/ThemeContext';
import { useBackLayer } from '../../navigation/backStack';
import { animateOverlayPageTransition, prefersReducedMotion } from '../../theme/motion';

/**
 * Full-screen page pushed above the current screen: enters from the right and overlays the
 * current page (exact inverse of Android predictive-back exit), keeping the underlying screen
 * mounted and visible underneath.
 *
 * Covers only the content area: the desktop rail and the mobile bottom navigation stay visible.
 * `children` receives `close()`, which plays the exit animation before calling `onClose`.
 */
export const OverlayPage: React.FC<{
  ariaLabel: string;
  onClose: () => void;
  children: (close: () => void) => React.ReactNode;
}> = ({ ariaLabel, onClose, children }) => {
  const { tokens } = useM3Theme();
  const closingRef = useRef(false);
  const surfaceRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (surface && !prefersReducedMotion()) animateOverlayPageTransition(surface, 'enter');
  }, []);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const surface = surfaceRef.current;
    if (!surface || prefersReducedMotion()) {
      onClose();
      return;
    }
    surface.style.pointerEvents = 'none';
    const anim = animateOverlayPageTransition(surface, 'leave');
    anim.finished.then(() => onClose());
  }, [onClose]);

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
    {
      kind: 'page',
      surfaceRef,
    }
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [close]);
  usePageScrollLock();

  return createPortal(
    <div
      ref={surfaceRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="nsac-overlay-page"
      style={{ backgroundColor: tokens.background, color: tokens.onBackground }}
    >
      <div className="nsac-overlay-page-content">{children(close)}</div>
    </div>,
    document.body
  );
};
