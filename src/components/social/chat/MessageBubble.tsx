import React, { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, Ban, Check, CheckCheck, Clock3, CornerUpLeft, MoreVertical, SmilePlus } from 'lucide-react';
import { useM3Theme } from '../../../theme/ThemeContext';
import { spring } from '../../../theme/motion';
import { animateElementSizeMorph, type MorphSize } from '../../../theme/contentSizeMorph';
import { openExternalUrl } from '../../../platform/openExternal';
import { chatTone, formatTime, isEmojiOnly, splitText, type ChatItem } from './chatModel';
import { GifMedia } from './GifKit';
import { describeMessageText, parseGifMessage, type GiphyItem } from './giphy';
import { TelegramBubbleTail, telegramBubbleRadius } from './TelegramTail';
import { tightenWrappedBubbleWidth } from './tightBubbleWidth';

/** Distance (px) a bubble must be swiped to the end to start a reply. */
const SWIPE_REPLY_PX = 56;
const LONG_PRESS_MS = 420;

export function haptic(ms = 10): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Not available.
  }
}

export interface BubbleHandlers {
  onReply: (item: ChatItem) => void;
  onOpenMenu: (item: ChatItem, anchor: HTMLElement) => void;
  onToggleReaction: (item: ChatItem, emoji: string) => void;
  onJumpTo: (messageId: number) => void;
  onRetry: (item: ChatItem) => void;
  onOpenGif: (gif: GiphyItem) => void;
}

export const MessageBubble: React.FC<
  {
    item: ChatItem;
    peerFirstName: string;
    groupStart: boolean;
    groupEnd: boolean;
    seen: boolean;
    /** Show the "Visto" caption (last own message the peer read). */
    showSeenCaption: boolean;
    fresh: boolean;
    flash: boolean;
    query: string;
    currentMatch: boolean;
    extras: boolean;
    interactive: boolean;
    /** Static copy shown lifted above the action menu. */
    preview?: boolean;
  } & Partial<BubbleHandlers>
> = memo(function MessageBubble({
  item,
  peerFirstName,
  groupStart,
  groupEnd,
  seen,
  showSeenCaption,
  fresh,
  flash,
  query,
  currentMatch,
  extras,
  interactive,
  preview = false,
  onReply,
  onOpenMenu,
  onToggleReaction,
  onJumpTo,
  onRetry,
  onOpenGif,
}) {
  const { tokens, isMaterialYou } = useM3Theme();
  const mine = item.is_me;
  const rowRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const [burst, setBurst] = useState<{ key: number; emoji: string } | null>(null);
  const prevSizeRef = useRef<MorphSize | null>(null);
  const morphKey = `${item.text}|${item.edited_at ?? ''}|${item.deleted ? 1 : 0}`;
  const prevMorphKeyRef = useRef(morphKey);

  // Trigger a floating emoji burst whenever the user adds or changes their reaction (via menu, pill, or double-tap).
  const myReactionEmoji = (item.reactions ?? []).find((r) => r.mine)?.emoji ?? null;
  const prevMyReactionRef = useRef<string | null>(myReactionEmoji);
  useEffect(() => {
    const prev = prevMyReactionRef.current;
    prevMyReactionRef.current = myReactionEmoji;
    if (myReactionEmoji && myReactionEmoji !== prev) {
      haptic(8);
      setBurst({ key: Date.now() + Math.random(), emoji: myReactionEmoji });
    }
  }, [myReactionEmoji]);

  useEffect(() => {
    if (!burst) return;
    const t = window.setTimeout(() => setBurst(null), 860);
    return () => window.clearTimeout(t);
  }, [burst]);

  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    tightenWrappedBubbleWidth(el, textRef.current);
    const next: MorphSize = { w: el.offsetWidth, h: el.offsetHeight };
    const prev = prevSizeRef.current;
    const changed = prevMorphKeyRef.current !== morphKey;
    prevMorphKeyRef.current = morphKey;
    prevSizeRef.current = next;
    if (changed && prev) {
      animateElementSizeMorph(el, prev, next);
    }
  }, [morphKey]);

  const deleted = Boolean(item.deleted);
  const gif = deleted ? null : parseGifMessage(item.text);
  const emojiOnly = !deleted && !gif && isEmojiOnly(item.text) && !item.reply_to;
  /** GIF without a quote: no bubble around it. */
  const bareGif = Boolean(gif) && !item.reply_to;
  const reactions = item.reactions ?? [];
  const canReact = extras && interactive && !deleted && !item.local;

  // ---- Gestures: swipe to reply, long press for the menu, double tap for ❤️ ----
  const gesture = useRef<{
    x: number;
    y: number;
    dx: number;
    horizontal: boolean | null;
    armed: boolean;
    timer: number | null;
    longPressed: boolean;
  } | null>(null);
  const lastTap = useRef(0);

  const setSwipe = (dx: number) => {
    const row = rowRef.current;
    if (row) row.style.translate = dx ? `${dx}px 0` : '';
    const icon = iconRef.current;
    if (icon) {
      const p = Math.min(1, dx / SWIPE_REPLY_PX);
      icon.style.opacity = String(p);
      icon.style.scale = String(0.4 + p * 0.6);
      icon.style.rotate = `${(1 - p) * -45}deg`;
    }
  };

  const releaseSwipe = (from: number) => {
    const row = rowRef.current;
    setSwipe(0);
    if (!row || from === 0) return;
    const { easing, duration } = spring('fastSpatial');
    row.animate([{ translate: `${from}px 0` }, { translate: '0 0' }], { duration, easing });
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (!interactive || preview) return;
    const t = e.touches[0]!;
    const g = { x: t.clientX, y: t.clientY, dx: 0, horizontal: null, armed: false, timer: null as number | null, longPressed: false };
    g.timer = window.setTimeout(() => {
      g.longPressed = true;
      haptic(14);
      if (bubbleRef.current) onOpenMenu?.(item, bubbleRef.current);
    }, LONG_PRESS_MS);
    gesture.current = g;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    if (!g) return;
    const t = e.touches[0]!;
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      if (g.timer) window.clearTimeout(g.timer);
      g.timer = null;
    }
    if (g.horizontal === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      g.horizontal = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.4 && extras && !deleted && !item.local;
    }
    if (!g.horizontal) return;
    // Rubber band past the threshold.
    const pull = dx <= SWIPE_REPLY_PX ? dx : SWIPE_REPLY_PX + (dx - SWIPE_REPLY_PX) * 0.25;
    g.dx = Math.max(0, Math.min(pull, 96));
    const armed = g.dx >= SWIPE_REPLY_PX;
    if (armed && !g.armed) haptic(8);
    g.armed = armed;
    setSwipe(g.dx);
  };

  const onTouchEnd = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.timer) window.clearTimeout(g.timer);
    if (g.horizontal) {
      releaseSwipe(g.dx);
      if (g.armed) onReply?.(item);
      return;
    }
    if (g.longPressed) return;
    const now = Date.now();
    if (canReact && now - lastTap.current < 300) {
      lastTap.current = 0;
      onToggleReaction?.(item, '❤️');
      return;
    }
    lastTap.current = now;
  };

  const onDoubleClick = () => {
    if (!canReact || 'ontouchstart' in window) return;
    onToggleReaction?.(item, '❤️');
  };

  // ---- Shape (Telegram / Nekogram geometry, preserving theme colors) ----
  const showTail = groupEnd && !deleted && !emojiOnly && !bareGif;
  const radius = telegramBubbleRadius({
    mine,
    groupStart,
    groupEnd,
    showTail,
    isMaterialYou,
  });

  const bg = deleted
    ? 'transparent'
    : mine
      ? tokens.primary
      : chatTone(tokens, 9);
  const fg = deleted ? tokens.onSurfaceVariant : mine ? tokens.onPrimary : tokens.onSurface;

  const statusIcon = !mine ? null : item.local === 'sending' ? (
    <Clock3 size={12} className="nsac-chat-spin-slow" style={{ display: 'block', flexShrink: 0 }} aria-label="Enviando" />
  ) : item.local === 'failed' ? (
    <AlertCircle size={12} style={{ display: 'block', flexShrink: 0 }} aria-label="Falhou" />
  ) : seen ? (
    <CheckCheck size={13} style={{ display: 'block', flexShrink: 0 }} aria-label="Visto" />
  ) : (
    <Check size={13} style={{ display: 'block', flexShrink: 0 }} aria-label="Enviado" />
  );

  const renderText = () =>
    splitText(item.text, query).map((part, i) =>
      part.kind === 'link' ? (
        <a
          key={i}
          href={part.value}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openExternalUrl(part.value);
          }}
          style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2, overflowWrap: 'anywhere' }}
        >
          {part.value}
        </a>
      ) : part.kind === 'match' ? (
        <mark
          key={i}
          style={{
            backgroundColor: tokens.tertiaryContainer,
            color: tokens.onTertiaryContainer,
            borderRadius: 4,
            padding: '0 1px',
          }}
        >
          {part.value}
        </mark>
      ) : (
        <React.Fragment key={i}>{part.value}</React.Fragment>
      )
    );

  const meta = (
    <span
      className="nsac-chat-meta"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: '0.66rem',
        fontWeight: 600,
        lineHeight: 1,
        opacity: mine && !deleted ? 0.82 : 0.7,
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
        color: emojiOnly ? tokens.onSurfaceVariant : undefined,
      }}
    >
      {item.edited_at && !deleted && <span>editada ·</span>}
      <span>{formatTime(item.created_at)}</span>
      {statusIcon}
    </span>
  );

  return (
    <div
      className={`nsac-chat-row${mine ? ' is-mine' : ''}${groupEnd ? ' is-group-end' : ''}`}
      data-message-id={item.id}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: mine ? 'flex-end' : 'flex-start',
        marginTop: groupStart ? 7 : 2,
        paddingLeft: mine ? 0 : 8,
        paddingRight: mine ? 8 : 0,
        position: 'relative',
      }}
    >
      {/* Swipe-to-reply icon, revealed behind the bubble. */}
      {!preview && (
        <span
          ref={iconRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 4,
            top: '50%',
            marginTop: -16,
            width: 32,
            height: 32,
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tokens.secondaryContainer,
            color: tokens.onSecondaryContainer,
            opacity: 0,
            scale: '0.4',
            pointerEvents: 'none',
          }}
        >
          <CornerUpLeft size={16} />
        </span>
      )}

      <div
        ref={rowRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexDirection: mine ? 'row-reverse' : 'row',
          maxWidth: preview ? '100%' : 'min(86%, 560px)',
          touchAction: 'pan-y',
        }}
      >
        <div
          ref={bubbleRef}
          className={[
            'nsac-chat-bubble',
            fresh ? 'is-fresh' : '',
            flash ? 'is-flash' : '',
            emojiOnly ? 'is-emoji' : '',
            currentMatch ? 'is-current-match' : '',
            item.local === 'failed' ? 'is-failed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          onDoubleClick={onDoubleClick}
          onContextMenu={(e) => {
            if (!interactive || preview || item.local) return;
            e.preventDefault();
            if (bubbleRef.current) onOpenMenu?.(item, bubbleRef.current);
          }}
          onClick={item.local === 'failed' ? () => onRetry?.(item) : undefined}
          style={{
            position: 'relative',
            width: 'fit-content',
            maxWidth: '100%',
            minWidth: 0,
            padding: emojiOnly ? '0 2px' : bareGif ? 0 : gif ? '3px' : '5px 8px 5px 9px',
            borderRadius: radius,
            backgroundColor: emojiOnly || bareGif ? 'transparent' : bg,
            color: fg,
            border: deleted ? `1px dashed ${tokens.outlineVariant}` : undefined,
            boxShadow: deleted || emojiOnly || bareGif ? undefined : '0 1px 1.5px rgba(0, 0, 0, 0.14)',
            transformOrigin: mine ? 'bottom right' : 'bottom left',
            outline: currentMatch ? `2px solid ${tokens.tertiary}` : undefined,
            outlineOffset: 2,
            cursor: item.local === 'failed' ? 'pointer' : undefined,
            userSelect: 'text',
            WebkitUserSelect: 'text',
            WebkitTouchCallout: 'none',
          }}
        >
          {showTail && <TelegramBubbleTail mine={mine} color={bg} />}
          {item.reply_to && !deleted && (
            <button
              type="button"
              className="nsac-chat-quote"
              onClick={(e) => {
                e.stopPropagation();
                if (item.reply_to && !preview) onJumpTo?.(item.reply_to.id);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                margin: '1px 0 5px',
                padding: '4px 8px',
                border: 'none',
                borderLeft: `2.5px solid ${mine ? tokens.onPrimary : tokens.primary}`,
                borderRadius: 6,
                backgroundColor: mine
                  ? `color-mix(in srgb, ${tokens.onPrimary} 14%, transparent)`
                  : `color-mix(in srgb, ${tokens.primary} 10%, transparent)`,
                color: 'inherit',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800 }}>
                {item.reply_to.is_me ? 'Você' : peerFirstName}
              </span>
              <span
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  fontSize: '0.78rem',
                  opacity: 0.85,
                  fontStyle: item.reply_to.deleted ? 'italic' : undefined,
                }}
              >
                {item.reply_to.deleted ? 'Mensagem apagada' : describeMessageText(item.reply_to.text)}
              </span>
            </button>
          )}

          {deleted ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontStyle: 'italic', fontSize: '0.84rem' }}>
              <Ban size={14} />
              {mine ? 'Você apagou esta mensagem' : 'Mensagem apagada'}
              <span style={{ marginLeft: 4 }}>{meta}</span>
            </span>
          ) : gif ? (
            <div
              role="button"
              tabIndex={0}
              aria-label={gif.kind === 'stickers' ? 'Abrir figurinha' : 'Abrir GIF'}
              onClick={(e) => {
                e.stopPropagation();
                if (!preview) onOpenGif?.(gif);
              }}
              style={{ position: 'relative', width: gif.kind === 'stickers' ? 'min(150px, 40vw)' : 'min(260px, 64vw)', cursor: 'zoom-in' }}
            >
              <GifMedia item={gif} quality="bubble" radius={bareGif ? radius : isMaterialYou ? 16 : 8} />
              <span
                style={{
                  position: 'absolute',
                  right: 6,
                  bottom: 6,
                  zIndex: 2,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px 8px',
                  borderRadius: 999,
                  backgroundColor: 'rgba(0, 0, 0, 0.55)',
                  color: '#fff',
                  lineHeight: 1,
                }}
              >
                {meta}
              </span>
            </div>
          ) : emojiOnly ? (
            <>
              <span className="nsac-chat-emoji-text" style={{ fontSize: '2.6rem', lineHeight: 1.15 }}>
                {item.text}
              </span>
              {groupEnd && <div style={{ textAlign: mine ? 'right' : 'left' }}>{meta}</div>}
            </>
          ) : (
            <span
              ref={textRef}
              style={{ display: 'flow-root', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.92rem', lineHeight: 1.36 }}
            >
              {renderText()}
              <span
                data-chat-meta
                style={{
                  float: 'right',
                  marginLeft: 7,
                  marginTop: 5,
                  marginBottom: -2,
                  display: 'inline-flex',
                  alignItems: 'center',
                  lineHeight: 1,
                }}
              >
                {meta}
              </span>
            </span>
          )}

          {burst && (
            <span key={burst.key} className="nsac-chat-emoji-burst" aria-hidden="true">
              {burst.emoji}
            </span>
          )}
        </div>

        {/* Desktop hover actions. */}
        {canReact && !preview && (
          <span className="nsac-chat-hover-actions" style={{ display: 'inline-flex', gap: 2, flexDirection: mine ? 'row-reverse' : 'row' }}>
            <button
              type="button"
              aria-label="Reagir"
              className="nsac-chat-hover-btn"
              onClick={() => bubbleRef.current && onOpenMenu?.(item, bubbleRef.current)}
              style={{ color: tokens.onSurfaceVariant }}
            >
              <SmilePlus size={16} />
            </button>
            <button
              type="button"
              aria-label="Responder"
              className="nsac-chat-hover-btn"
              onClick={() => onReply?.(item)}
              style={{ color: tokens.onSurfaceVariant }}
            >
              <CornerUpLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Mais ações"
              className="nsac-chat-hover-btn"
              onClick={() => bubbleRef.current && onOpenMenu?.(item, bubbleRef.current)}
              style={{ color: tokens.onSurfaceVariant }}
            >
              <MoreVertical size={16} />
            </button>
          </span>
        )}
      </div>

      {reactions.length > 0 && !deleted && (
        <div
          style={{
            display: 'flex',
            gap: 4,
            marginTop: -6,
            padding: mine ? '0 10px 0 0' : '0 0 0 10px',
            flexWrap: 'wrap',
            justifyContent: mine ? 'flex-end' : 'flex-start',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {reactions.map((r) => (
            <button
              key={`${r.emoji}:${r.count}:${r.mine}`}
              type="button"
              className="nsac-chat-reaction"
              disabled={!canReact}
              onClick={() => onToggleReaction?.(item, r.emoji)}
              aria-label={`${r.emoji} ${r.count}${r.mine ? ', sua reação' : ''}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                padding: '2px 7px',
                minHeight: 24,
                borderRadius: 999,
                border: `1.5px solid ${r.mine ? tokens.primary : tokens.background}`,
                backgroundColor: r.mine ? tokens.secondaryContainer : chatTone(tokens, 12),
                color: tokens.onSurface,
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: canReact ? 'pointer' : 'default',
              }}
            >
              <span>{r.emoji}</span>
              {r.count > 1 && <span style={{ fontSize: '0.7rem' }}>{r.count}</span>}
            </button>
          ))}
        </div>
      )}

      {item.local === 'failed' && (
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: tokens.error, marginTop: 3 }}>
          Não enviada · toque para tentar de novo
        </span>
      )}
      {showSeenCaption && (
        <span className="nsac-chat-seen" style={{ fontSize: '0.68rem', fontWeight: 600, color: tokens.onSurfaceVariant, marginTop: 3, marginRight: 4 }}>
          Visto
        </span>
      )}
    </div>
  );
});
