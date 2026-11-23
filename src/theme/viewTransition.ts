import { flushSync } from 'react-dom';
import { prefersReducedMotion } from './motion';

/**
 * Screen-level M3 transition patterns run through the View Transitions API, so the outgoing
 * screen animates out while the incoming one animates in (the CSS for each kind lives in
 * index.css under `html[data-vt="<kind>"]`).
 *
 * - `fade-through`: top-level destinations (tabs via tap).
 * - `swipe-next` / `swipe-prev`: top-level destinations switched via horizontal swipe gesture.
 * - `axis-x-forward` / `axis-x-backward`: moving deeper / back in a hierarchy.
 * - `axis-z-forward` / `axis-z-backward`: entering / leaving a level (login <-> app).
 */
export type ScreenTransition =
  | 'fade-through'
  | 'swipe-next'
  | 'swipe-prev'
  | 'axis-x-forward'
  | 'axis-x-backward'
  | 'axis-z-forward'
  | 'axis-z-backward';

type DocumentWithViewTransition = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

/** True when screen changes will animate through the View Transitions API. */
export function canRunScreenTransition(): boolean {
  return Boolean((document as DocumentWithViewTransition).startViewTransition) && !prefersReducedMotion();
}

export function runScreenTransition(kind: ScreenTransition, update: () => void): void {
  const doc = document as DocumentWithViewTransition;
  if (!doc.startViewTransition || !canRunScreenTransition()) {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset.vt = kind;
  const transition = doc.startViewTransition(() => flushSync(update));
  transition.finished.finally(() => {
    if (root.dataset.vt === kind) delete root.dataset.vt;
  });
}
