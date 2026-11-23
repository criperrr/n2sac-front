import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import { useBackLayer } from '../../navigation/backStack';
import { usePageScrollLock } from '../../theme/scrollLock';
import { animateOverlayPageTransition, prefersReducedMotion } from '../../theme/motion';
import { useM3Theme } from '../../theme/ThemeContext';

/**
 * Transition + back behavior of a page pushed above the app (the chat, Configurações, Turma):
 * enters from the right as the exact inverse of the Android predictive-back exit, leaves with the
 * matching exit animation on `close()`, and registers a `page` back layer so the predictive back
 * gesture shrinks this surface and reveals the real screen underneath. Returns `close()`.
 */
export function usePushedPage(surfaceRef: React.RefObject<HTMLElement | null>, onClose: () => void): () => void {
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (surface && !prefersReducedMotion()) animateOverlayPageTransition(surface, 'enter');
  }, [surfaceRef]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const surface = surfaceRef.current;
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (!surface || prefersReducedMotion()) {
      onCloseRef.current();
      return;
    }
    surface.style.pointerEvents = 'none';
    const anim = animateOverlayPageTransition(surface, 'leave');
    anim.finished.then(() => onCloseRef.current());
  }, [surfaceRef]);

  useBackLayer(
    true,
    (source) => {
      if (source === 'gesture') {
        // The preview already animated the surface out.
        closingRef.current = true;
        onCloseRef.current();
      } else close();
    },
    { kind: 'page', surfaceRef }
  );

  usePageScrollLock();
  return close;
}

/**
 * Full-screen page with a top app bar (back + title). On desktop it covers the content area
 * only, so the rail stays usable. `children` receives `close()`.
 */
export const PushedPage: React.FC<{
  title: string;
  /** Hide the title in the bar when the page renders its own large heading. */
  showTitle?: boolean;
  onClose: () => void;
  /** Optional guard called before closing via top bar Back or Escape; return `false` to cancel. */
  beforeClose?: () => boolean;
  /** Stacking layer for nested pushed pages (default 60). */
  zIndex?: number;
  /** Lets the owner trigger the animated close from outside (e.g. switching tabs on the rail). */
  closeRef?: React.MutableRefObject<(() => void) | null>;
  children: React.ReactNode;
}> = ({ title, showTitle = true, onClose, beforeClose, zIndex = 60, closeRef, children }) => {
  const { tokens } = useM3Theme();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const close = usePushedPage(surfaceRef, onClose);
  const beforeCloseRef = useRef(beforeClose);
  beforeCloseRef.current = beforeClose;

  const requestClose = useCallback(() => {
    if (beforeCloseRef.current && !beforeCloseRef.current()) return;
    close();
  }, [close]);

  if (closeRef) closeRef.current = close;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not(.nsac-pushed-page)')) return;
      const pages = document.querySelectorAll('.nsac-pushed-page');
      if (pages.length > 0 && pages[pages.length - 1] !== surfaceRef.current) return;
      e.preventDefault();
      requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  return createPortal(
    <div
      ref={surfaceRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="nsac-pushed-page"
      style={{ backgroundColor: tokens.background, color: tokens.onBackground, zIndex }}
    >
      <header className="nsac-pushed-page-bar" style={{ backgroundColor: tokens.background, color: tokens.onSurface }}>
        <button type="button" aria-label="Voltar" title="Voltar" onClick={requestClose} className="nsac-chat-icon-btn" style={{ color: tokens.onSurface }}>
          <ArrowLeft size={22} />
        </button>
        {showTitle && <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>{title}</h1>}
      </header>
      <div className="nsac-pushed-page-scroll">
        <div className="nsac-pushed-page-content">{children}</div>
      </div>
    </div>,
    document.body
  );
};
