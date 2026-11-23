import { useEffect, type RefObject } from 'react';

const MAX_PULL_PX = 76;
const RESISTANCE = 140;
const SNAP_BACK_MS = 300;
const SNAP_EASING = 'cubic-bezier(0.2, 1.15, 0.35, 1)';

/**
 * Elastic top & bottom overscroll rubber-band effect for chat scroll containers.
 * Registers a non-passive `touchmove` listener up front on the chat scroller (required by
 * Chromium/Android WebView so `preventDefault()` works on the very first gesture) and mutates
 * `contentRef.current.style.transform` directly on the GPU compositor thread (zero React re-renders).
 */
export function useChatOverscroll(
  scrollRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  active = true
): void {
  useEffect(() => {
    if (!active) return;
    const scroller = scrollRef.current;
    if (!scroller) return;

    let tracking = false;
    let startX = 0;
    let startY = 0;
    let anchorY = 0;
    let mode: 'idle' | 'top' | 'bottom' | 'ignore' = 'idle';
    let offset = 0;
    let snapTimer = 0;

    const getContent = () => contentRef.current;

    const clearSnapTimer = () => {
      if (snapTimer) {
        window.clearTimeout(snapTimer);
        snapTimer = 0;
      }
    };

    const setOffset = (px: number) => {
      const content = getContent();
      if (!content) return;
      offset = px;
      content.style.transition = 'none';
      content.style.willChange = 'transform';
      content.style.transform = `translate3d(0, ${px.toFixed(1)}px, 0)`;
    };

    const snapBack = () => {
      const content = getContent();
      mode = 'idle';
      tracking = false;
      if (!content || Math.abs(offset) < 0.5) {
        offset = 0;
        return;
      }
      offset = 0;
      content.style.transition = `transform ${SNAP_BACK_MS}ms ${SNAP_EASING}`;
      content.style.transform = 'translate3d(0, 0, 0)';
      clearSnapTimer();
      snapTimer = window.setTimeout(() => {
        snapTimer = 0;
        const c = getContent();
        if (!c) return;
        c.style.transition = '';
        c.style.transform = '';
        c.style.willChange = '';
      }, SNAP_BACK_MS + 30);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      clearSnapTimer();
      const content = getContent();
      if (content && offset !== 0) {
        // Catch mid-rebound cleanly
        content.style.transition = 'none';
      }
      const t = e.touches[0]!;
      tracking = true;
      startX = t.clientX;
      startY = t.clientY;
      anchorY = t.clientY;
      mode = 'idle';
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking || e.touches.length !== 1) return;
      const t = e.touches[0]!;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (mode === 'idle') {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        // Never fight horizontal gestures (swipe-to-reply).
        if (Math.abs(dx) > Math.abs(dy) * 0.9) {
          mode = 'ignore';
          return;
        }
        const atTop = scroller.scrollTop <= 1;
        const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
        if (dy > 0 && atTop) {
          mode = 'top';
          anchorY = t.clientY;
        } else if (dy < 0 && atBottom) {
          mode = 'bottom';
          anchorY = t.clientY;
        } else {
          // Keep watching in case user reaches top or bottom later in the same drag.
          startY = t.clientY;
          startX = t.clientX;
          return;
        }
      }

      if (mode === 'ignore') return;

      const delta = t.clientY - anchorY;
      if (mode === 'top') {
        if (delta <= 0) {
          setOffset(0);
          mode = 'idle';
          startY = t.clientY;
          return;
        }
        if (e.cancelable) e.preventDefault();
        const pull = MAX_PULL_PX * (1 - Math.exp(-delta / RESISTANCE));
        setOffset(pull);
      } else if (mode === 'bottom') {
        if (delta >= 0) {
          setOffset(0);
          mode = 'idle';
          startY = t.clientY;
          return;
        }
        if (e.cancelable) e.preventDefault();
        const pull = MAX_PULL_PX * (1 - Math.exp(-Math.abs(delta) / RESISTANCE));
        setOffset(-pull);
      }
    };

    const onTouchEnd = () => {
      if (!tracking && offset === 0) return;
      snapBack();
    };

    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchmove', onTouchMove, { passive: false });
    scroller.addEventListener('touchend', onTouchEnd, { passive: true });
    scroller.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      clearSnapTimer();
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchmove', onTouchMove);
      scroller.removeEventListener('touchend', onTouchEnd);
      scroller.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [scrollRef, contentRef, active]);
}
