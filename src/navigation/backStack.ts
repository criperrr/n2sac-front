import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';

/**
 * App-wide back stack driven by the Android predictive back gesture.
 *
 * Native side (MainActivity) owns an OnBackPressedCallback that is enabled only while this
 * stack is non-empty, so with nothing to close the system plays its own back-to-home
 * animation. While enabled, the gesture is forwarded as `nsac:back` window events
 * (start / progress / cancel / commit) and the top layer animates following the Material
 * predictive back spec: surface scales to 90%, shifts ((width / 20) - 8)dp toward the
 * swipe, follows the finger vertically, and reveals what is underneath.
 */

export type BackLayerKind =
  /** Dialog surface over a scrim: surface previews, scrim fades out revealing the page. */
  | 'modal'
  /** Full-screen surface over another page: scales/shifts and reveals the page below. */
  | 'page'
  /** Top-level tab: previews, then returns to the start destination. */
  | 'tab'
  /** In-place state (expanded panel, filter menu): closes on commit without a preview. */
  | 'inline'
  /** Mandatory choice: consumes back so nothing underneath closes. */
  | 'blocking';

export type BackSource = 'gesture' | 'button';

interface BackLayer {
  id: number;
  kind: BackLayerKind;
  onBack: MutableRefObject<(source: BackSource) => void>;
  surfaceRef?: RefObject<HTMLElement | null>;
  scrimRef?: RefObject<HTMLElement | null>;
  hooks: MutableRefObject<BackGestureHooks>;
  closing?: boolean;
}

/** Optional reactions to the preview itself (e.g. reveal what an overlay page covers). */
export interface BackGestureHooks {
  onGestureStart?: () => void;
  onGestureCancel?: () => void;
}

interface NativeBackBridge {
  setEnabled(enabled: boolean): void;
}

interface NativeBackEventDetail {
  phase: 'start' | 'progress' | 'cancel' | 'commit';
  progress?: number;
  touchX?: number;
  touchY?: number;
  /** 0 = gesture started on the left edge, 1 = right edge. */
  edge?: number;
  density?: number;
}

declare global {
  interface Window {
    NsacAndroidBack?: NativeBackBridge;
  }
}

const layers: BackLayer[] = [];
let nextId = 1;

function syncNativeEnabled(): void {
  try {
    window.NsacAndroidBack?.setEnabled(layers.length > 0);
  } catch {
    // Bridge missing (web / older APK): back handled by Escape and on-screen controls.
  }
}

const SETTLE_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
const COMMIT_EASING = 'cubic-bezier(0.1, 0.1, 0, 1)';
const CANCEL_MS = 260;
const COMMIT_MS = 220;

/** Approximates PathInterpolator(0, 0, 0, 1): strong deceleration so the start of the drag reads clearly. */
const decelerate = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);

interface GestureState {
  layer: BackLayer;
  dir: 1 | -1;
  startY: number;
  eased: number;
  yShift: number;
}

let gesture: GestureState | null = null;
/** Prevents a double/cascading back event right after closing a menu/page from popping the underlying tab. */
let suppressTabBackUntil = 0;

const LAYER_PRIORITY: Record<BackLayerKind, number> = {
  tab: 0,
  page: 1,
  modal: 2,
  inline: 3,
  blocking: 4,
};

/**
 * Picks the highest-priority active layer (LIFO within the same tier):
 * blocking > inline > modal > page > tab.
 * Guarantees an open menu/page/modal ALWAYS intercepts Back before any underlying tab layer.
 */
const topLayer = (): BackLayer | undefined => {
  let best: BackLayer | undefined;
  let bestPriority = -1;
  for (let i = layers.length - 1; i >= 0; i--) {
    const candidate = layers[i]!;
    if (candidate.closing) continue;
    const prio = LAYER_PRIORITY[candidate.kind];
    if (prio > bestPriority) {
      best = candidate;
      bestPriority = prio;
    }
  }
  return best;
};

function previewTransform(eased: number, dir: number, yShift: number, minScale = 0.9): string {
  const xMax = Math.max(0, window.innerWidth / 20 - 8);
  const scale = 1 - (1 - minScale) * eased;
  return `translate3d(${(dir * xMax * eased).toFixed(2)}px, ${yShift.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
}

function prepare(el: HTMLElement | null | undefined): void {
  if (!el) return;
  // CSS enter animations use `fill-mode: forwards`, which would override inline transforms.
  // Cancelling them (instead of `animation: none`) lets a later class swap, such as the
  // dialog exit animation, still run normally.
  for (const animation of el.getAnimations()) animation.cancel();
  el.style.transition = 'none';
  el.style.willChange = 'transform, opacity';
  el.style.transformOrigin = 'center center';
}

function clearStyles(el: HTMLElement | null | undefined): void {
  if (!el) return;
  for (const prop of ['transform', 'opacity', 'transition', 'willChange', 'borderRadius', 'overflow', 'boxShadow', 'transformOrigin']) {
    el.style.removeProperty(prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
  }
}

function applyPreview(state: GestureState): void {
  const { layer, eased, dir, yShift } = state;
  const surface = layer.surfaceRef?.current;
  const scrim = layer.scrimRef?.current;
  if (!surface) return;

  switch (layer.kind) {
    case 'modal':
      surface.style.transform = previewTransform(eased, dir, yShift);
      if (scrim) scrim.style.opacity = String(1 - 0.45 * eased);
      break;
    case 'page':
    case 'tab':
      surface.style.transform = previewTransform(eased, dir, yShift);
      surface.style.borderRadius = `${(28 * eased).toFixed(1)}px`;
      surface.style.overflow = 'hidden';
      surface.style.boxShadow = `0 18px 48px rgba(0,0,0,${(0.35 * eased).toFixed(3)})`;
      break;
    default:
      break;
  }
}

function settle(layer: BackLayer): void {
  const surface = layer.surfaceRef?.current;
  const scrim = layer.scrimRef?.current;
  for (const el of [surface, scrim]) {
    if (!el) continue;
    el.style.transition = `transform ${CANCEL_MS}ms ${SETTLE_EASING}, opacity ${CANCEL_MS}ms ${SETTLE_EASING}, border-radius ${CANCEL_MS}ms ${SETTLE_EASING}, box-shadow ${CANCEL_MS}ms ${SETTLE_EASING}`;
  }
  if (surface) {
    surface.style.transform = 'translate3d(0, 0, 0) scale(1)';
    surface.style.borderRadius = '0px';
    surface.style.boxShadow = '0 0 0 rgba(0,0,0,0)';
  }
  if (scrim) scrim.style.opacity = '1';
  window.setTimeout(() => {
    clearStyles(surface);
    clearStyles(scrim);
  }, CANCEL_MS + 20);
}

/** Continues from the preview into an exit that reveals what is underneath, then pops the layer. */
function commitWithAnimation(state: GestureState): void {
  const { layer, dir, yShift } = state;
  const surface = layer.surfaceRef?.current;
  const scrim = layer.scrimRef?.current;
  layer.closing = true;
  if (layer.kind !== 'tab') {
    suppressTabBackUntil = performance.now() + 340;
  }
  if (!surface || layer.kind === 'inline') {
    layer.onBack.current('gesture');
    return;
  }

  const exitShift = layer.kind === 'modal' ? Math.max(0, window.innerWidth / 20 - 8) * 1.6 : window.innerWidth * 0.3;
  const transition = `transform ${COMMIT_MS}ms ${COMMIT_EASING}, opacity ${COMMIT_MS}ms ${COMMIT_EASING}`;
  surface.style.transition = transition;
  surface.style.transform = `translate3d(${(dir * exitShift).toFixed(2)}px, ${yShift.toFixed(2)}px, 0) scale(${layer.kind === 'modal' ? 0.82 : 0.88})`;
  surface.style.opacity = '0';
  if (scrim) {
    scrim.style.transition = transition;
    scrim.style.opacity = '0';
  }

  window.setTimeout(() => {
    layer.onBack.current('gesture');
    // Tabs keep their surface element mounted until React swaps the page; reset it afterwards.
    if (layer.kind === 'tab') window.requestAnimationFrame(() => clearStyles(surface));
  }, COMMIT_MS);
}

function onNativeBack(event: Event): void {
  const detail = (event as CustomEvent<NativeBackEventDetail>).detail ?? { phase: 'commit' };
  const density = detail.density && detail.density > 0 ? detail.density : window.devicePixelRatio || 1;

  switch (detail.phase) {
    case 'start': {
      const layer = topLayer();
      if (!layer || layer.kind === 'blocking') {
        gesture = null;
        return;
      }
      layer.hooks.current.onGestureStart?.();
      prepare(layer.surfaceRef?.current);
      prepare(layer.scrimRef?.current);
      gesture = {
        layer,
        dir: detail.edge === 1 ? -1 : 1,
        startY: (detail.touchY ?? 0) / density,
        eased: 0,
        yShift: 0,
      };
      return;
    }
    case 'progress': {
      if (!gesture) return;
      const yMax = Math.max(0, window.innerHeight / 20 - 8);
      const dy = (detail.touchY ?? 0) / density - gesture.startY;
      gesture.eased = decelerate(detail.progress ?? 0);
      gesture.yShift = Math.max(-yMax, Math.min(yMax, dy * 0.15));
      applyPreview(gesture);
      return;
    }
    case 'cancel': {
      if (gesture) {
        settle(gesture.layer);
        gesture.layer.hooks.current.onGestureCancel?.();
      }
      gesture = null;
      return;
    }
    case 'commit': {
      const active = gesture;
      gesture = null;
      const layer = topLayer();
      if (!layer) {
        syncNativeEnabled();
        return;
      }
      if (layer.kind === 'blocking') {
        if (active) settle(active.layer);
        return;
      }
      if (layer.kind === 'tab' && performance.now() < suppressTabBackUntil) {
        if (active) settle(active.layer);
        return;
      }
      // No preview happened (3-button navigation, Android < 14): run the layer's normal close.
      if (!active || active.layer !== layer || active.eased <= 0) {
        if (active) clearStyles(active.layer.surfaceRef?.current);
        layer.closing = true;
        if (layer.kind !== 'tab') {
          suppressTabBackUntil = performance.now() + 340;
        }
        layer.onBack.current('button');
        return;
      }
      commitWithAnimation(active);
      return;
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('nsac:back', onNativeBack);
  // A fresh document (first load or OTA reload) starts with an empty stack.
  syncNativeEnabled();
}

/**
 * Registers a back layer while `active` is true. Layers stack in activation order; the most
 * recently activated one receives the next back gesture.
 *
 * `onBack('gesture')` means the surface already animated out: remove it immediately.
 * `onBack('button')` means no preview ran: play the regular close animation.
 */
export function useBackLayer(
  active: boolean,
  onBack: (source: BackSource) => void,
  options: {
    kind?: BackLayerKind;
    surfaceRef?: RefObject<HTMLElement | null>;
    scrimRef?: RefObject<HTMLElement | null>;
  } & BackGestureHooks = {}
): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const { kind = 'inline', surfaceRef, scrimRef, onGestureStart, onGestureCancel } = options;
  const hooksRef = useRef<BackGestureHooks>({});
  hooksRef.current = { onGestureStart, onGestureCancel };

  useEffect(() => {
    if (!active) return;
    const layer: BackLayer = { id: nextId++, kind, onBack: onBackRef, surfaceRef, scrimRef, hooks: hooksRef };
    layers.push(layer);
    syncNativeEnabled();
    return () => {
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
      if (gesture?.layer === layer) gesture = null;
      syncNativeEnabled();
    };
  }, [active, kind, surfaceRef, scrimRef]);
}
