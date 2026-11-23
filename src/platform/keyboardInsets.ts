import { useSyncExternalStore } from 'react';

/**
 * Software keyboard geometry, published as CSS variables on `<html>`:
 *
 * - `--nsac-vv-top` / `--nsac-vv-height`: the visual viewport (the part of the page actually on
 *   screen). Depending on the WebView/browser, the keyboard either shrinks it or not, and the
 *   engine may scroll it to reveal the focused field. Full-screen surfaces (the chat) follow it
 *   so their header never leaves the screen.
 * - `--nsac-ime-inset`: keyboard height still covering the visual viewport (only when the engine
 *   did NOT shrink it, e.g. edge-to-edge WebViews). Added as bottom padding by those surfaces.
 * - `--nsac-ime-height`: keyboard overlap on the layout viewport, for ordinary pages and dialogs.
 *
 * Sources: the Android bridge (`MainActivity`, `nsac:ime`, frame by frame while the keyboard
 * animates) and `visualViewport`. Counting both naively doubles the offset, which pushed the
 * chat composer to the middle of the screen and the header off the top.
 *
 * Focused fields outside `[data-ime-managed]` are scrolled into view once the keyboard settles.
 */

type Listener = () => void;

let nativeOverlap: number | null = null;
let imeHeight = 0;
let keyboardAnimating = false;
let animEndTimer = 0;
let baseViewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
let lastViewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
const listeners = new Set<Listener>();
let installed = false;
let lastKey = '';

function revealFocusedField(): void {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return;
  if (!el.matches('input, textarea, select, [contenteditable="true"]')) return;
  if (el.closest('[data-ime-managed]')) return;
  window.requestAnimationFrame(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
}

export interface KeyboardGeometry {
  /** Visual viewport offset/height (CSS px). */
  vvTop: number;
  vvHeight: number;
  /** Keyboard still covering the visual viewport. */
  inset: number;
  /** Keyboard overlap on the layout viewport. */
  total: number;
}

let geometry: KeyboardGeometry = { vvTop: 0, vvHeight: typeof window === 'undefined' ? 0 : window.innerHeight, inset: 0, total: 0 };
let publishTimer = 0;

/**
 * Root CSS variables are written only once the keyboard stops moving: changing a custom property
 * on `<html>` restyles the whole document, which at 60–120 Hz made the keyboard animation crawl.
 * Surfaces that must follow every frame (the chat) subscribe and write their own inline style.
 */
function publishRootVars(): void {
  const root = document.documentElement;
  const g = geometry;
  root.style.setProperty('--nsac-vv-top', `${g.vvTop}px`);
  root.style.setProperty('--nsac-vv-height', `${g.vvHeight}px`);
  root.style.setProperty('--nsac-ime-inset', `${g.inset}px`);
  root.style.setProperty('--nsac-ime-height', `${g.total}px`);
  root.classList.toggle('nsac-ime-open', g.total > 0);
}

function update(settled: boolean): void {
  const vv = window.visualViewport;
  const layoutWidth = window.innerWidth;
  const layoutHeight = window.innerHeight;
  const vvTop = vv ? Math.max(0, vv.offsetTop) : 0;
  const vvHeight = vv ? vv.height : layoutHeight;
  const visibleBottom = vvTop + vvHeight;

  if (Math.abs(layoutWidth - lastViewportWidth) > 2) {
    lastViewportWidth = layoutWidth;
    baseViewportHeight = Math.max(layoutHeight, visibleBottom);
  } else if ((nativeOverlap === null || nativeOverlap === 0) && visibleBottom >= baseViewportHeight - 10) {
    baseViewportHeight = Math.max(layoutHeight, visibleBottom);
  } else {
    baseViewportHeight = Math.max(baseViewportHeight, layoutHeight, visibleBottom);
  }

  // Part of the viewport the engine already shrank (either visualViewport alone OR both
  // layoutHeight and visualViewport on Android adjustResize WebViews).
  const gapBelow = Math.max(0, layoutHeight - visibleBottom);
  const engineShrunk = Math.max(gapBelow, Math.max(0, baseViewportHeight - visibleBottom));
  const keyboard = nativeOverlap ?? (engineShrunk > 60 ? engineShrunk : 0);
  const insideVisual = Math.max(0, keyboard - engineShrunk);
  const total = Math.max(keyboard, engineShrunk > 60 ? engineShrunk : 0);

  const round = (n: number) => Math.round(n * 10) / 10;
  const key = `${round(vvTop)}|${round(vvHeight)}|${round(insideVisual)}|${round(total)}`;
  if (key !== lastKey) {
    lastKey = key;
    geometry = { vvTop: round(vvTop), vvHeight: round(vvHeight), inset: round(insideVisual), total: round(total) };
    imeHeight = geometry.total;
    keyboardAnimating = !settled;
    window.clearTimeout(animEndTimer);
    if (!settled) {
      animEndTimer = window.setTimeout(() => {
        keyboardAnimating = false;
        listeners.forEach((l) => l());
      }, 180);
    }
    listeners.forEach((l) => l());
    window.clearTimeout(publishTimer);
    publishTimer = window.setTimeout(publishRootVars, settled ? 0 : 160);
  } else if (settled && keyboardAnimating) {
    window.clearTimeout(animEndTimer);
    keyboardAnimating = false;
    listeners.forEach((l) => l());
  }
  if (settled && total > 0) revealFocusedField();
}

export function getKeyboardGeometry(): KeyboardGeometry {
  return geometry;
}

export function installKeyboardInsets(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('nsac:ime', (ev) => {
    const detail = (ev as CustomEvent<{ height: number; animating: boolean }>).detail;
    if (!detail) return;
    nativeOverlap = detail.height;
    update(!detail.animating);
  });
  const nativeInitial = (window as unknown as { __nsacImeHeight?: number }).__nsacImeHeight;
  if (typeof nativeInitial === 'number') nativeOverlap = nativeInitial;

  const vv = window.visualViewport;
  vv?.addEventListener('resize', () => update(true));
  vv?.addEventListener('scroll', () => update(false));
  window.addEventListener('resize', () => update(false));
  update(false);
  publishRootVars();
}

export function getKeyboardInset(): number {
  return imeHeight;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Keyboard overlap on the layout viewport, in CSS px (0 when closed). */
export function useKeyboardInset(): number {
  return useSyncExternalStore(subscribe, getKeyboardInset, () => 0);
}

/** True while the Android software keyboard is actively sliding open or closed. */
export function isKeyboardAnimating(): boolean {
  return keyboardAnimating;
}

/** Subscribes outside React (e.g. to keep a scroll position pinned every animation frame). */
export function onKeyboardInsetChange(listener: Listener): () => void {
  return subscribe(listener);
}
