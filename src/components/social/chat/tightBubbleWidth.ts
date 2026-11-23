/**
 * Shrink-wraps a wrapped multi-line chat bubble to the exact width of its widest rendered line,
 * mirroring Telegram Android's `ChatMessageCell` (`max(StaticLayout.getLineWidth(i))`).
 *
 * Why needed: CSS `width: fit-content` expands to `max-width` as soon as text wraps to 2+ lines,
 * leaving dead empty space on the right of multi-line messages. Measuring actual line boxes with
 * `Range.getClientRects()` once on mount/edit eliminates that dead space with zero scroll cost.
 */
export function tightenWrappedBubbleWidth(
  bubble: HTMLElement,
  textNode: HTMLElement | null
): void {
  // Reset any previous inline lock so layout computes natural wrapped lines first.
  bubble.style.width = 'fit-content';
  if (!textNode) return;

  const bubbleRect = bubble.getBoundingClientRect();
  if (bubbleRect.width <= 0) return;

  const style = window.getComputedStyle(bubble);
  const padX =
    (Number.parseFloat(style.paddingLeft) || 0) +
    (Number.parseFloat(style.paddingRight) || 0) +
    (Number.parseFloat(style.borderLeftWidth) || 0) +
    (Number.parseFloat(style.borderRightWidth) || 0);

  // Find actual rendered line widths across message text ONLY (excluding floated timestamp `[data-chat-meta]`).
  const lines = new Map<number, { left: number; right: number; top: number }>();
  const addRect = (r: DOMRect) => {
    if (r.width <= 0.5 || r.height <= 0.5) return;
    const bucket = Math.round(r.top / 8);
    const cur = lines.get(bucket);
    if (cur) {
      cur.left = Math.min(cur.left, r.left);
      cur.right = Math.max(cur.right, r.right);
    } else {
      lines.set(bucket, { left: r.left, right: r.right, top: r.top });
    }
  };

  // Walk text nodes inside `textNode`, skipping `[data-chat-meta]` so its vertical offset never spoofs a 2nd line.
  const walker = document.createTreeWalker(textNode, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node: Node | null = walker.nextNode();
  while (node) {
    if (
      node.textContent &&
      node.textContent.trim().length > 0 &&
      !node.parentElement?.closest('[data-chat-meta]')
    ) {
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      for (let i = 0; i < rects.length; i++) {
        addRect(rects[i]!);
      }
    }
    node = walker.nextNode();
  }

  // Only shrink if the message text itself wrapped to 2+ lines (1-line boxes already shrink via fit-content).
  if (lines.size < 2) return;

  let maxLineW = 0;
  let lastLineBucket = -Infinity;
  let lastLineTop = 0;
  let lastLineW = 0;
  lines.forEach((span, bucket) => {
    const w = span.right - span.left;
    if (w > maxLineW) maxLineW = w;
    if (bucket > lastLineBucket) {
      lastLineBucket = bucket;
      lastLineTop = span.top;
      lastLineW = w;
    }
  });

  // Account for the floated meta timestamp if present
  const metaEl = textNode.querySelector<HTMLElement>('[data-chat-meta]');
  if (metaEl) {
    const mr = metaEl.getBoundingClientRect();
    if (mr.width > 0) {
      // If timestamp shares the last text line, reserve space for text + gap + timestamp so nothing wraps onto a new line
      if (Math.abs(mr.top - lastLineTop) < 16) {
        const combined = lastLineW + mr.width + 10;
        if (combined > maxLineW) maxLineW = combined;
      }
      if (mr.width + 4 > maxLineW) maxLineW = mr.width + 4;
    }
  }

  // Also ensure sender header, reply quote, and media children inside the bubble aren't clipped
  let minRequiredContentW = maxLineW;
  const children = bubble.children;
  for (let i = 0; i < children.length; i++) {
    const ch = children[i] as HTMLElement;
    if (ch === textNode || ch.tagName === 'svg' || ch.tagName === 'SVG') continue;
    // Measure intrinsic width of non-text headers/quotes/images
    if (ch.hasAttribute('data-bubble-header')) {
      let headerW = 0;
      for (let j = 0; j < ch.children.length; j++) {
        headerW += (ch.children[j] as HTMLElement).getBoundingClientRect().width;
      }
      headerW += Math.max(0, ch.children.length - 1) * 6;
      if (headerW > minRequiredContentW) minRequiredContentW = headerW;
    } else if (ch.hasAttribute('data-bubble-quote')) {
      // Keep reply quote compact: don't force full max-width unless quote text is short
      const quoteW = Math.min(ch.scrollWidth, bubbleRect.width - padX);
      if (quoteW > minRequiredContentW) minRequiredContentW = quoteW;
    } else {
      const r = ch.getBoundingClientRect();
      if (r.width > minRequiredContentW) minRequiredContentW = r.width;
    }
  }

  // +4px safety buffer so subpixel font metrics never cause an extra wrap
  const tightTotal = Math.ceil(minRequiredContentW + padX + 4);
  if (tightTotal < bubbleRect.width - 4 && tightTotal >= 52) {
    bubble.style.width = `${tightTotal}px`;
  }
}
