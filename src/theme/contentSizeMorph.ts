import { EASING, prefersReducedMotion, springToCss } from './motion';

/**
 * App-wide `animateContentSize` (M3 Expressive): whenever the content of any element changes
 * (a label is rewritten, a status message appears, an icon is swapped for a loading indicator, a
 * loading state turns into an error…) and that changes the element's size, the element springs
 * from its old size to the new one instead of jumping. Buttons, chips, status boxes, cards: all
 * of them, with no per-component code. Opt out of a subtree with `data-no-size-morph`.
 *
 * Spring: fast spatial with a very light overshoot (damping 0.78 → ~2%, settles in ~220ms), so
 * the jiggle is barely perceptible.
 *
 * Performance & Layout-Thrashing Guards:
 * - Subtrees inside `svg` or `[data-no-size-morph]` are skipped BEFORE `ResizeObserver.observe`.
 * - Mutation handling strictly batches DOM reads before any style/animation writes (Read → Cancel →
 *   Read → Write), avoiding interleaved `anim.cancel()` + `offsetWidth` reflow thrashing.
 * - `document.getAnimations()` is only queried lazily when at least one real size delta exists.
 * - Structural swaps, huge viewport boxes, and live counters are skipped.
 */

const SKIP_ANCESTOR = 'svg, [data-no-size-morph]';
/** childList mutations adding/removing more elements than this are structural, not content. */
const MAX_STRUCTURAL_ELEMENTS = 40;
/** Boxes taller than this fraction of the viewport are page-level layout: not animated. */
const MAX_VIEWPORT_FRACTION = 0.7;
/** Single-row controls (buttons, chips): the only boxes whose label is kept on one line. */
const SINGLE_ROW_MAX_HEIGHT = 64;
/** More morphs than this on one element within LIVE_WINDOW_MS → it's a live counter: skip. */
const LIVE_MAX_MORPHS = 3;
const LIVE_WINDOW_MS = 450;
const LIVE_COOLDOWN_MS = 1500;
/** Properties that move or resize boxes; an ancestor animating one of these owns the layout. */
const LAYOUT_PROPS = new Set([
  'width',
  'height',
  'max-height',
  'max-width',
  'min-height',
  'grid-template-rows',
  'grid-template-columns',
  'transform',
  'translate',
  'scale',
  'all',
]);

const SPRING_DAMPING = 0.78;
const SPRING_STIFFNESS = 1400;

export interface MorphSize {
  w: number;
  h: number;
}

/**
 * Targeted M3 Expressive size-morph animation (same spring as `installContentSizeMorph`)
 * for individual elements inside `[data-no-size-morph]` subtrees (such as an edited chat
 * message bubble), avoiding global ResizeObserver overhead on 80+ list items.
 */
export function animateElementSizeMorph(el: HTMLElement, from: MorphSize, to: MorphSize): Animation | null {
  if (prefersReducedMotion()) return null;
  const dw = Math.abs(to.w - from.w) >= 1;
  const dh = Math.abs(to.h - from.h) >= 1;
  if (!dw && !dh) return null;
  if (from.w <= 0 || from.h <= 0 || to.w <= 0 || to.h <= 0) return null;

  const supportsLinear = CSS.supports?.('animation-timing-function', 'linear(0, 1)') ?? false;
  const timing = supportsLinear
    ? springToCss(SPRING_DAMPING, SPRING_STIFFNESS)
    : { easing: EASING.emphasizedDecelerate, duration: 240 };

  const startFrame: Keyframe = { boxSizing: 'border-box' };
  const endFrame: Keyframe = { boxSizing: 'border-box' };
  if (dw) {
    startFrame.width = `${from.w}px`;
    endFrame.width = `${to.w}px`;
  }
  if (dh) {
    startFrame.height = `${from.h}px`;
    endFrame.height = `${to.h}px`;
  }

  const prevOverflow = el.style.overflow;
  el.style.overflow = 'hidden';
  const anim = el.animate([startFrame, endFrame], { duration: timing.duration, easing: timing.easing });
  const restore = () => {
    el.style.overflow = prevOverflow;
  };
  anim.onfinish = restore;
  anim.oncancel = restore;
  return anim;
}

interface Size {
  w: number;
  h: number;
}

let installed = false;

export function installContentSizeMorph(root: HTMLElement = document.body): void {
  if (installed || typeof window === 'undefined' || !('ResizeObserver' in window) || !Element.prototype.animate) return;
  installed = true;

  const supportsLinear = CSS.supports?.('animation-timing-function', 'linear(0, 1)') ?? false;
  const timing = supportsLinear
    ? springToCss(SPRING_DAMPING, SPRING_STIFFNESS)
    : { easing: EASING.emphasizedDecelerate, duration: 260 };

  const sizes = new WeakMap<Element, Size>();
  const observed = new WeakSet<Element>();
  const running = new WeakMap<Element, Animation>();
  const ours = new WeakSet<Animation>();
  const savedStyle = new WeakMap<HTMLElement, { overflow: string; whiteSpace: string }>();
  const history = new WeakMap<Element, number[]>();
  const liveUntil = new WeakMap<Element, number>();

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const box = entry.borderBoxSize?.[0];
      sizes.set(
        entry.target,
        box ? { w: box.inlineSize, h: box.blockSize } : { w: entry.contentRect.width, h: entry.contentRect.height }
      );
    }
  });

  const isSkippableRoot = (el: Element): boolean =>
    el.tagName === 'svg' ||
    el.tagName === 'SVG' ||
    el.hasAttribute('data-no-size-morph') ||
    el instanceof HTMLScriptElement ||
    el instanceof HTMLStyleElement;

  const observable = (el: Element): el is HTMLElement =>
    el instanceof HTMLElement && !isSkippableRoot(el);

  /**
   * Walks a subtree without descending into `<svg>` or `[data-no-size-morph]` containers,
   * so opted-out lists/tables never pay `ResizeObserver.observe` or `querySelectorAll('*')` cost.
   */
  const collectObservableSubtree = (node: Node, out: HTMLElement[]): void => {
    if (!(node instanceof Element)) return;
    if (isSkippableRoot(node) || node.parentElement?.closest(SKIP_ANCESTOR)) return;
    const stack: Element[] = [node];
    while (stack.length > 0) {
      const el = stack.pop()!;
      if (isSkippableRoot(el)) continue;
      if (el instanceof HTMLElement && !observed.has(el)) {
        out.push(el);
      }
      const children = el.children;
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]!);
      }
    }
  };

  const observeElement = (el: HTMLElement) => {
    if (observed.has(el)) return;
    observed.add(el);
    resizeObserver.observe(el);
  };

  const observeTree = (node: Node) => {
    const batch: HTMLElement[] = [];
    collectObservableSubtree(node, batch);
    for (let i = 0; i < batch.length; i++) {
      observeElement(batch[i]!);
    }
  };

  // Big subtrees (a whole screen mounting) are observed in idle time, in slices, so the mount
  // frame (often mid page-transition) doesn't also pay for hundreds of observe() calls.
  const pending: HTMLElement[] = [];
  let idleScheduled = false;
  const idle = (cb: (deadline?: IdleDeadline) => void) =>
    'requestIdleCallback' in window ? window.requestIdleCallback(cb, { timeout: 1000 }) : (window as Window).setTimeout(cb, 50);
  const drain = (deadline?: IdleDeadline) => {
    idleScheduled = false;
    let budget = 250;
    while (pending.length && (deadline ? deadline.timeRemaining() > 2 : budget-- > 0)) {
      const el = pending.pop()!;
      if (el.isConnected && !observed.has(el) && observable(el) && !el.closest(SKIP_ANCESTOR)) {
        observeElement(el);
      }
    }
    if (pending.length) schedule();
  };
  const schedule = () => {
    if (idleScheduled) return;
    idleScheduled = true;
    idle(drain);
  };
  const observeLater = (node: Node) => {
    collectObservableSubtree(node, pending);
    if (pending.length) schedule();
  };

  const unobserveTree = (node: Node) => {
    if (!(node instanceof Element)) return;
    if (node.tagName === 'svg' || node.tagName === 'SVG') return;
    const stack: Element[] = [node];
    while (stack.length > 0) {
      const el = stack.pop()!;
      if (observed.has(el)) {
        observed.delete(el);
        resizeObserver.unobserve(el);
      }
      if (el.tagName === 'svg' || el.tagName === 'SVG') continue;
      const children = el.children;
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]!);
      }
    }
  };

  const elementCount = (nodes: NodeList): number => {
    let n = 0;
    nodes.forEach((node) => {
      if (node instanceof Element) n += 1 + node.getElementsByTagName('*').length;
    });
    return n;
  };

  /** Elements that currently run a layout animation not started by us (CSS or WAAPI). */
  const foreignLayoutTargets = (): Set<Element> => {
    const targets = new Set<Element>();
    for (const anim of document.getAnimations()) {
      if (ours.has(anim) || anim.playState !== 'running') continue;
      const effect = anim.effect as KeyframeEffect | null;
      const target = effect?.target;
      if (!target) continue;
      let props: string[] = [];
      if ('transitionProperty' in anim) {
        props = [(anim as CSSTransition).transitionProperty];
      } else {
        try {
          props = effect.getKeyframes().flatMap((k) => Object.keys(k));
        } catch {
          continue;
        }
      }
      const kebab = props.map((p) => p.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
      if (kebab.some((p) => LAYOUT_PROPS.has(p))) targets.add(target);
    }
    return targets;
  };

  const isLive = (el: Element, now: number): boolean => {
    if ((liveUntil.get(el) ?? 0) > now) return true;
    const recent = (history.get(el) ?? []).filter((t) => now - t < LIVE_WINDOW_MS);
    recent.push(now);
    history.set(el, recent);
    if (recent.length > LIVE_MAX_MORPHS) {
      liveUntil.set(el, now + LIVE_COOLDOWN_MS);
      return true;
    }
    return false;
  };

  interface Plan {
    el: HTMLElement;
    from: Size;
    to: Size;
  }

  const animate = ({ el, from, to }: Plan) => {
    const dw = Math.abs(to.w - from.w) >= 1;
    const dh = Math.abs(to.h - from.h) >= 1;
    const startFrame: Keyframe = { boxSizing: 'border-box' };
    const endFrame: Keyframe = { boxSizing: 'border-box' };
    if (dw) {
      startFrame.width = `${from.w}px`;
      endFrame.width = `${to.w}px`;
    }
    if (dh) {
      startFrame.height = `${from.h}px`;
      endFrame.height = `${to.h}px`;
    }

    if (!savedStyle.has(el)) savedStyle.set(el, { overflow: el.style.overflow, whiteSpace: el.style.whiteSpace });
    // The box is briefly smaller than its content on the growing axis: clip instead of overflowing.
    el.style.overflow = 'hidden';
    // A single-row control growing wider would wrap its label mid-animation: keep it on one line.
    if (dw && !dh && to.w > from.w && to.h <= SINGLE_ROW_MAX_HEIGHT) el.style.whiteSpace = 'nowrap';

    const animation = el.animate([startFrame, endFrame], { duration: timing.duration, easing: timing.easing });
    ours.add(animation);
    running.set(el, animation);
    const cleanup = () => {
      if (running.get(el) !== animation) return;
      running.delete(el);
      const saved = savedStyle.get(el);
      if (!saved) return;
      savedStyle.delete(el);
      el.style.overflow = saved.overflow;
      el.style.whiteSpace = saved.whiteSpace;
    };
    animation.onfinish = cleanup;
    animation.oncancel = cleanup;
  };

  const mutationObserver = new MutationObserver((records) => {
    const starts = new Set<HTMLElement>();
    for (const record of records) {
      if (record.type === 'childList') {
        const structural =
          elementCount(record.addedNodes) + elementCount(record.removedNodes) > MAX_STRUCTURAL_ELEMENTS;
        record.addedNodes.forEach(structural ? observeLater : observeTree);
        record.removedNodes.forEach(unobserveTree);
        if (structural) continue;
      }
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (!(target instanceof HTMLElement) || target.closest(SKIP_ANCESTOR)) continue;
      if (!target.isConnected) continue;
      starts.add(target);
    }
    if (starts.size === 0 || prefersReducedMotion()) return;

    const now = performance.now();
    const viewportCap = window.innerHeight * MAX_VIEWPORT_FRACTION;

    // PHASE 1 (Pure Reads): Walk up from each mutation start to collect candidate chains
    // and capture live `getBoundingClientRect()` for any currently-running animations BEFORE
    // cancelling anything. Memoize display checks per element across starts.
    const displayCache = new Map<HTMLElement, string>();
    const getDisplay = (el: HTMLElement): string => {
      let d = displayCache.get(el);
      if (d === undefined) {
        d = getComputedStyle(el).display;
        displayCache.set(el, d);
      }
      return d;
    };

    const candidateChains: Array<Array<{ el: HTMLElement; from: Size }>> = [];
    const runningToCancel = new Map<HTMLElement, Animation>();
    const runningFromSize = new Map<HTMLElement, Size>();

    starts.forEach((start) => {
      const chain: Array<{ el: HTMLElement; from: Size }> = [];
      let next: HTMLElement | null = start;
      while (next && next !== root.parentElement) {
        const el: HTMLElement = next;
        next = el.parentElement;
        if (el.hasAttribute('data-no-size-morph')) break;
        const anim = running.get(el);
        const cachedSize = sizes.get(el);
        if (!anim && !cachedSize) continue;
        const display = getDisplay(el);
        if (display === 'contents' || display === 'inline' || display === 'none') continue;
        let from: Size;
        if (anim) {
          let rSize = runningFromSize.get(el);
          if (!rSize) {
            const r = el.getBoundingClientRect();
            rSize = { w: r.width, h: r.height };
            runningFromSize.set(el, rSize);
            runningToCancel.set(el, anim);
          }
          from = rSize;
        } else {
          from = cachedSize!;
        }
        chain.push({ el, from });
      }
      if (chain.length > 0) {
        candidateChains.push(chain);
      }
    });

    if (candidateChains.length === 0) return;

    // PHASE 2 (Batched Cancel): Cancel all intersecting running animations in one pass
    // before reading natural target sizes, preventing read/write/read reflow thrashing.
    runningToCancel.forEach((anim) => anim.cancel());

    // PHASE 3 (Pure Reads): Measure natural `offsetWidth`/`offsetHeight` per element once,
    // resolve the innermost changed box per mutation chain, and lazily check foreign animations
    // ONLY if a real size change passes all cheap guards.
    const measuredTo = new Map<HTMLElement, Size>();
    const measureNatural = (el: HTMLElement): Size => {
      let s = measuredTo.get(el);
      if (!s) {
        s = { w: el.offsetWidth, h: el.offsetHeight };
        measuredTo.set(el, s);
      }
      return s;
    };

    let foreign: Set<Element> | null = null;
    const plans = new Map<HTMLElement, Plan>();

    for (let i = 0; i < candidateChains.length; i++) {
      const chain = candidateChains[i]!;
      let chosen: Plan | null = null;
      for (let j = 0; j < chain.length; j++) {
        const { el, from } = chain[j]!;
        const to = measureNatural(el);
        if (Math.abs(to.w - from.w) < 1 && Math.abs(to.h - from.h) < 1) {
          // Size change absorbed by this box — stop climbing.
          break;
        }
        if (from.w === 0 || from.h === 0 || to.w === 0 || to.h === 0) {
          break;
        }
        chosen = { el, from, to };
        break;
      }
      if (!chosen || plans.has(chosen.el)) continue;
      if (Math.max(chosen.from.h, chosen.to.h) > viewportCap) continue;
      foreign ??= foreignLayoutTargets();
      let blockedByForeign = false;
      for (let a: Element | null = chosen.el; a; a = a.parentElement) {
        if (foreign.has(a)) {
          blockedByForeign = true;
          break;
        }
      }
      if (blockedByForeign) continue;
      if (isLive(chosen.el, now)) continue;
      plans.set(chosen.el, chosen);
    }

    // PHASE 4 (Pure Writes): Start WAAPI animations for all approved plans.
    plans.forEach(animate);
  });

  observeLater(root);
  mutationObserver.observe(root, { childList: true, subtree: true, characterData: true });
}
