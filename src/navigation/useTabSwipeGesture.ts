import { useEffect, type RefObject } from 'react';
import type { AppTabId } from '../components/ExpressiveNavigation';

const SWIPE_TABS: readonly AppTabId[] = ['boletim', 'turma', 'ranking', 'frequencia', 'profile'];

/** Margin from screen edges reserved for Android's system predictive-back gesture. */
const SYSTEM_EDGE_GUARD_PX = 28;
const LOCK_SLOP_PX = 14;
const COMMIT_DISTANCE_PX = 58;
const COMMIT_VELOCITY_PX_MS = 0.35;
const MAX_DRAG_PREVIEW_PX = 72;

function hasHorizontalScrollableAncestor(target: EventTarget | null, boundary: HTMLElement): boolean {
  let el = target instanceof HTMLElement ? target : null;
  while (el && el !== boundary) {
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    const style = window.getComputedStyle(el);
    const ox = style.overflowX;
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 2) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Horizontal touch swipe between primary bottom-bar tabs, with subtle live finger-follow
 * and a distinct directional slide transition on commit.
 */
export function useTabSwipeGesture(
  surfaceRef: RefObject<HTMLDivElement | null>,
  activeTab: AppTabId,
  onSwipeTab: (nextTab: AppTabId, direction: 'next' | 'prev') => void,
  enabled: boolean
): void {
  useEffect(() => {
    const el = surfaceRef.current;
    if (!enabled || !el) return;

    const currentIdx = SWIPE_TABS.indexOf(activeTab);
    if (currentIdx === -1) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let locked: 'none' | 'horizontal' | 'vertical' = 'none';
    let lastDx = 0;
    let tracking = false;

    const resetTransform = (animate: boolean) => {
      if (!el) return;
      if (animate) {
        el.style.transition = 'transform 220ms cubic-bezier(0.2, 0, 0, 1)';
        el.style.transform = '';
        window.setTimeout(() => {
          if (el) el.style.transition = '';
        }, 230);
      } else {
        el.style.transition = '';
        el.style.transform = '';
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (document.querySelector('[role="dialog"]')) return;

      const touch = e.touches[0]!;
      const vw = window.innerWidth;
      if (touch.clientX < SYSTEM_EDGE_GUARD_PX || touch.clientX > vw - SYSTEM_EDGE_GUARD_PX) {
        return;
      }
      if (hasHorizontalScrollableAncestor(e.target, el)) return;

      tracking = true;
      locked = 'none';
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = performance.now();
      lastDx = 0;
      el.style.transition = '';
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking || e.touches.length !== 1) return;
      const touch = e.touches[0]!;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (locked === 'none') {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (absX < LOCK_SLOP_PX && absY < LOCK_SLOP_PX) return;
        if (absX > absY * 1.25) {
          locked = 'horizontal';
        } else {
          locked = 'vertical';
          tracking = false;
          return;
        }
      }

      if (locked === 'horizontal') {
        lastDx = dx;
        const goingNext = dx < 0;
        const canGo = goingNext ? currentIdx < SWIPE_TABS.length - 1 : currentIdx > 0;
        const resistance = canGo ? 0.42 : 0.14;
        const clamped = Math.max(-MAX_DRAG_PREVIEW_PX, Math.min(MAX_DRAG_PREVIEW_PX, dx * resistance));
        el.style.transform = `translate3d(${clamped.toFixed(1)}px, 0, 0)`;
      }
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      tracking = false;

      if (locked !== 'horizontal') {
        resetTransform(false);
        return;
      }

      const elapsed = Math.max(1, performance.now() - startTime);
      const velocity = Math.abs(lastDx) / elapsed;
      const shouldCommit = Math.abs(lastDx) >= COMMIT_DISTANCE_PX || (Math.abs(lastDx) >= 28 && velocity >= COMMIT_VELOCITY_PX_MS);

      if (shouldCommit) {
        const direction: 'next' | 'prev' = lastDx < 0 ? 'next' : 'prev';
        const targetIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
        const targetTab = SWIPE_TABS[targetIdx];
        if (targetTab) {
          resetTransform(false);
          onSwipeTab(targetTab, direction);
          return;
        }
      }

      resetTransform(true);
    };

    const onTouchCancel = () => {
      if (!tracking) return;
      tracking = false;
      locked = 'none';
      resetTransform(true);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
      el.style.transition = '';
      el.style.transform = '';
    };
  }, [surfaceRef, activeTab, onSwipeTab, enabled]);
}
