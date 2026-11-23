import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  CornerUpLeft,
  ImagePlus,
  Megaphone,
  Pencil,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  MessageSquare,
} from 'lucide-react';
import {
  deleteClassroomChannelMessage,
  editClassroomChannelMessage,
  fetchClassroomChannelMessages,
  NsacApiClientError,
  sendClassroomChannelMessage,
  sendClassroomChannelTyping,
  setClassroomChannelMessageReaction,
  subscribeClassroomStream,
} from '../../api/nsacClient';
import type {
  AnnouncementItem,
  ChatRateLimitStatus,
  ClassroomChannelKind,
  ClassroomChatMessage,
} from '../../api/types';
import { useM3Theme } from '../../theme/ThemeContext';
import { prefersReducedMotion } from '../../theme/motion';
import { animateElementSizeMorph, type MorphSize } from '../../theme/contentSizeMorph';
import { useBackLayer } from '../../navigation/backStack';
import { usePushedPage } from '../expressive/PushedPage';
import { getKeyboardGeometry, onKeyboardInsetChange } from '../../platform/keyboardInsets';
import { MorphingLoadingState } from '../expressive/ShapeMorph';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { formatTime, REACTIONS, splitText } from '../social/chat/chatModel';
import { GifMedia, GifViewer } from '../social/chat/GifKit';
import { parseGifMessage, type GiphyItem } from '../social/chat/giphy';
import { openExternalUrl } from '../../platform/openExternal';
import { compressImageToDataUrl } from '../../utils/imageCompress';
import { loadCachedClassroomChat, saveCachedClassroomChat } from '../../utils/chatCache';
import { TelegramBubbleTail, telegramBubbleRadius } from '../social/chat/TelegramTail';
import { tightenWrappedBubbleWidth } from '../social/chat/tightBubbleWidth';
import { useChatOverscroll } from '../social/chat/useChatOverscroll';
import { AnimatedImageLightbox } from './AnimatedImageLightbox';
import { AuthMediaImage } from './AuthMediaImage';

const POLL_FALLBACK_MS = 4500;
const TYPING_PING_MS = 3000;
const PAGE_SIZE = 50;

function mergeClassroomMessages(prev: ClassroomChatMessage[], incoming: ClassroomChatMessage[]): ClassroomChatMessage[] {
  if (incoming.length === 0) return prev;
  const map = new Map<number, ClassroomChatMessage>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.id - b.id);
}

interface ClassroomMessageRowProps {
  m: ClassroomChatMessage;
  token: string;
  classCode: string;
  groupStart: boolean;
  groupEnd: boolean;
  menuOpen: boolean;
  isEditing: boolean;
  amIRep: boolean;
  onToggleMenu: (id: number | null) => void;
  onReact: (m: ClassroomChatMessage, emoji: string) => void;
  onReply: (m: ClassroomChatMessage) => void;
  onEdit: (m: ClassroomChatMessage) => void;
  onDelete: (m: ClassroomChatMessage) => void;
  onOpenLightbox: (url: string) => void;
  onOpenGif: (gif: GiphyItem) => void;
}

/**
 * Memoized Telegram-style classroom message row:
 * - Zero re-renders while typing in the composer (huge win for low-end phones).
 * - Compact `width: fit-content` + floated inline timestamp occupies the minimum space needed.
 * - Smoothly morphs its `(width, height)` via `animateElementSizeMorph` whenever edited/deleted.
 */
const ClassroomMessageRow: React.FC<ClassroomMessageRowProps> = memo(function ClassroomMessageRow({
  m,
  token,
  classCode,
  groupStart,
  groupEnd,
  menuOpen,
  isEditing,
  amIRep,
  onToggleMenu,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onOpenLightbox,
  onOpenGif,
}) {
  const { tokens, isMaterialYou } = useM3Theme();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const prevSizeRef = useRef<MorphSize | null>(null);
  const morphKey = `${m.text}|${m.edited_at ?? ''}|${m.deleted ? 1 : 0}`;
  const prevMorphKeyRef = useRef(morphKey);

  // Smooth enter + exit lifecycle for the inline action popover (never snaps shut abruptly).
  const [menuMounted, setMenuMounted] = useState(menuOpen);
  const [menuExiting, setMenuExiting] = useState(false);
  useEffect(() => {
    if (menuOpen && !m.deleted) {
      setMenuMounted(true);
      setMenuExiting(false);
      return;
    }
    if (!menuMounted) return;
    if (prefersReducedMotion()) {
      setMenuMounted(false);
      setMenuExiting(false);
      return;
    }
    setMenuExiting(true);
    const t = window.setTimeout(() => {
      setMenuMounted(false);
      setMenuExiting(false);
    }, 185);
    return () => window.clearTimeout(t);
  }, [menuOpen, m.deleted, menuMounted]);

  // Floating emoji burst whenever the user adds or changes their reaction on this message.
  const myReactionEmoji = m.reactions.find((r) => r.mine)?.emoji ?? null;
  const prevMyReactionRef = useRef<string | null>(myReactionEmoji);
  const [reactionBurst, setReactionBurst] = useState<{ key: number; emoji: string } | null>(null);
  useEffect(() => {
    const prev = prevMyReactionRef.current;
    prevMyReactionRef.current = myReactionEmoji;
    if (myReactionEmoji && myReactionEmoji !== prev) {
      setReactionBurst({ key: Date.now() + Math.random(), emoji: myReactionEmoji });
    }
  }, [myReactionEmoji]);

  useEffect(() => {
    if (!reactionBurst) return;
    const t = window.setTimeout(() => setReactionBurst(null), 860);
    return () => window.clearTimeout(t);
  }, [reactionBurst]);

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

  const showSender = !m.is_me && groupStart;
  const showAvatar = !m.is_me && groupEnd;
  const gif = m.deleted ? null : parseGifMessage(m.text);
  const mediaOnly = !m.deleted && !m.text && Boolean(m.attachment_url || gif);
  const showTail = groupEnd && !m.deleted && !(gif && !m.reply_to && !m.ref_announcement);
  const bg = m.deleted
    ? 'transparent'
    : m.is_me
      ? tokens.primaryContainer
      : tokens.surfaceContainerHigh;
  const fg = m.deleted
    ? tokens.onSurfaceVariant
    : m.is_me
      ? tokens.onPrimaryContainer
      : tokens.onSurface;
  const bubbleRadius = telegramBubbleRadius({
    mine: m.is_me,
    groupStart,
    groupEnd,
    showTail,
    isMaterialYou,
  });
  const timeLabel = formatTime(m.created_at);

  return (
    <div
      data-message-id={m.id}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: m.is_me ? 'flex-end' : 'flex-start',
        marginTop: groupStart ? 7 : 2,
        paddingRight: m.is_me ? 8 : 0,
        paddingLeft: m.is_me ? 0 : 2,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 10,
          maxWidth: '90%',
        }}
      >
        {!m.is_me && (
          <div
            style={{
              width: 40,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              marginBottom: -1,
            }}
          >
            {showAvatar && (
              <ProfileAvatar
                name={m.sender_label}
                image={m.sender_avatar_url}
                size={40}
                profile={{
                  accountId: m.sender_id,
                  label: m.sender_label,
                  avatarUrl: m.sender_avatar_url,
                  classCode,
                  canOpen: true,
                }}
              />
            )}
          </div>
        )}

        <div
          ref={bubbleRef}
          data-chat-bubble
          onClick={(e) => {
            e.stopPropagation();
            if (!m.deleted) onToggleMenu(menuOpen ? null : m.id);
          }}
          style={{
            position: 'relative',
            width: 'fit-content',
            maxWidth: '100%',
            minWidth: 0,
            padding: gif || mediaOnly ? '3px' : m.attachment_url ? '3px 3px 5px' : '5px 8px 5px 9px',
            borderRadius: bubbleRadius,
            backgroundColor: bg,
            color: fg,
            border: m.deleted ? `1px dashed ${tokens.outlineVariant}` : 'none',
            boxShadow: isEditing
              ? `0 0 0 2px ${tokens.primary}, 0 4px 14px rgba(0, 0, 0, 0.2)`
              : m.deleted
                ? undefined
                : '0 1px 1.5px rgba(0, 0, 0, 0.14)',
            transition: 'box-shadow 180ms ease, transform 200ms var(--m3-spring-fast-spatial, cubic-bezier(0.2, 0.9, 0.25, 1))',
            transform: (menuOpen && !menuExiting) || isEditing ? 'scale(1.018)' : undefined,
            cursor: m.deleted ? 'default' : 'pointer',
          }}
        >
          {showTail && <TelegramBubbleTail mine={m.is_me} color={bg} />}
          {reactionBurst && (
            <span key={reactionBurst.key} className="nsac-chat-emoji-burst" aria-hidden="true">
              {reactionBurst.emoji}
            </span>
          )}
          {showSender && (
            <div
              data-bubble-header
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 2,
                padding: m.attachment_url || gif ? '3px 7px 1px' : 0,
              }}
            >
              <span
                style={{
                  fontSize: '0.81rem',
                  fontWeight: 800,
                  color: tokens.primary,
                  lineHeight: 1.22,
                  letterSpacing: '-0.01em',
                }}
              >
                {m.sender_label}
              </span>
              {m.sender_is_representative && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '1px 6px',
                    borderRadius: 999,
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    backgroundColor: tokens.primary,
                    color: tokens.onPrimary,
                  }}
                >
                  <ShieldCheck size={10} /> Rep.
                </span>
              )}
            </div>
          )}

          {m.ref_announcement && (
            <div
              data-bubble-quote
              style={{
                padding: '4px 8px',
                marginBottom: 4,
                borderRadius: 6,
                borderLeft: `2.5px solid ${tokens.primary}`,
                backgroundColor: `color-mix(in srgb, ${tokens.primary} 11%, transparent)`,
                fontSize: '0.74rem',
              }}
            >
              <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Megaphone size={11} /> Anúncio
              </div>
              <div style={{ opacity: 0.88, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.ref_announcement.title || 'Anúncio da turma'}
              </div>
            </div>
          )}

          {m.reply_to && (
            <div
              data-bubble-quote
              style={{
                padding: '4px 8px',
                marginBottom: 4,
                borderRadius: 6,
                borderLeft: `2.5px solid ${m.is_me ? tokens.onPrimaryContainer : tokens.primary}`,
                backgroundColor: m.is_me
                  ? `color-mix(in srgb, ${tokens.onPrimaryContainer} 10%, transparent)`
                  : `color-mix(in srgb, ${tokens.primary} 10%, transparent)`,
                fontSize: '0.74rem',
              }}
            >
              <div style={{ fontWeight: 800, lineHeight: 1.25 }}>{m.reply_to.sender_label}</div>
              <div style={{ opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.reply_to.deleted ? 'Mensagem removida' : m.reply_to.text}
              </div>
            </div>
          )}

          {m.deleted ? (
            <span style={{ fontStyle: 'italic', opacity: 0.72, fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span>
                {m.deletion_kind === 'representative'
                  ? 'Mensagem removida por um representante'
                  : 'Mensagem apagada'}
              </span>
              <span style={{ fontSize: '0.66rem', opacity: 0.75 }}>{timeLabel}</span>
            </span>
          ) : (
            <>
              {m.attachment_url && (
                <div style={{ position: 'relative' }}>
                  <AuthMediaImage
                    token={token}
                    src={m.attachment_url}
                    alt="Imagem do canal"
                    onClick={() => onOpenLightbox(m.attachment_url!)}
                    style={{
                      width: '100%',
                      maxWidth: 268,
                      maxHeight: 280,
                      borderRadius: isMaterialYou ? 14 : 9,
                      objectFit: 'cover',
                      display: 'block',
                      marginBottom: m.text ? 4 : 0,
                      cursor: 'pointer',
                    }}
                  />
                  {!m.text && (
                    <span
                      style={{
                        position: 'absolute',
                        right: 6,
                        bottom: 6,
                        padding: '2px 7px',
                        borderRadius: 999,
                        backgroundColor: 'rgba(0, 0, 0, 0.54)',
                        color: '#fff',
                        fontSize: '0.66rem',
                        fontWeight: 600,
                        lineHeight: 1.25,
                        fontVariantNumeric: 'tabular-nums',
                        pointerEvents: 'none',
                      }}
                    >
                      {timeLabel}
                    </span>
                  )}
                </div>
              )}
              {gif ? (
                <div
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onOpenGif(gif);
                  }}
                  style={{ position: 'relative', cursor: 'pointer' }}
                >
                  <GifMedia item={gif} quality="bubble" radius={isMaterialYou ? 14 : 9} />
                  <span
                    style={{
                      position: 'absolute',
                      right: 6,
                      bottom: 6,
                      padding: '2px 7px',
                      borderRadius: 999,
                      backgroundColor: 'rgba(0, 0, 0, 0.54)',
                      color: '#fff',
                      fontSize: '0.66rem',
                      fontWeight: 600,
                      lineHeight: 1.25,
                      fontVariantNumeric: 'tabular-nums',
                      pointerEvents: 'none',
                    }}
                  >
                    {timeLabel}
                  </span>
                </div>
              ) : m.text ? (
                <div
                  ref={textRef}
                  style={{
                    display: 'flow-root',
                    fontSize: '0.92rem',
                    lineHeight: 1.36,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    padding: m.attachment_url ? '0 6px' : 0,
                  }}
                >
                  {splitText(m.text).map((part, i) =>
                    part.kind === 'link' ? (
                      <a
                        key={i}
                        href={part.value}
                        onClick={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          openExternalUrl(part.value);
                        }}
                        style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}
                      >
                        {part.value}
                      </a>
                    ) : (
                      <React.Fragment key={i}>{part.value}</React.Fragment>
                    )
                  )}
                  <span
                    data-chat-meta
                    style={{
                      float: 'right',
                      marginLeft: 7,
                      marginTop: 5,
                      marginBottom: -2,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      fontSize: '0.66rem',
                      fontWeight: 600,
                      opacity: 0.72,
                      lineHeight: 1,
                      whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {m.edited_at && <span>editada ·</span>}
                    <span>{timeLabel}</span>
                  </span>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Reactions (animated spring pill pop + count bump) */}
      {m.reactions.length > 0 && !m.deleted && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            marginTop: 4,
            marginLeft: m.is_me ? 0 : 50,
          }}
        >
          {m.reactions.map((r) => (
            <button
              key={`${r.emoji}:${r.count}:${r.mine ? 1 : 0}`}
              type="button"
              className="nsac-reaction-badge-in"
              onClick={(e) => {
                e.stopPropagation();
                onReact(m, r.emoji);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 999,
                border: `1.25px solid ${r.mine ? tokens.primary : tokens.outlineVariant}`,
                backgroundColor: r.mine ? tokens.primaryContainer : tokens.surfaceContainerHigh,
                color: r.mine ? tokens.onPrimaryContainer : tokens.onSurface,
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <span>{r.emoji}</span>
              <span>{r.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Quick action popover (smooth M3 spring enter + accelerated exit) */}
      {menuMounted && !m.deleted && (
        <div
          className={menuExiting ? 'nsac-action-menu-out' : 'nsac-action-menu-in'}
          onClick={(e) => e.stopPropagation()}
          style={{
            marginTop: 6,
            marginLeft: m.is_me ? 0 : 50,
            padding: '8px 10px',
            borderRadius: 18,
            backgroundColor: tokens.surfaceContainerHighest,
            border: `1px solid ${tokens.outlineVariant}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
            transformOrigin: m.is_me ? 'top right' : 'top left',
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            {REACTIONS.slice(0, 6).map((em, idx) => {
              const isPicked = m.reactions.some((r) => r.mine && r.emoji === em);
              return (
                <button
                  key={em}
                  type="button"
                  className="nsac-reaction-pop"
                  onClick={() => onReact(m, em)}
                  style={{
                    border: 'none',
                    background: isPicked ? tokens.primaryContainer : 'transparent',
                    borderRadius: 999,
                    fontSize: '1.12rem',
                    cursor: 'pointer',
                    padding: '3px 5px',
                    animationDelay: menuExiting ? '0ms' : `${idx * 22}ms`,
                  }}
                >
                  {em}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onReply(m)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 10px',
                borderRadius: 999,
                border: `1px solid ${tokens.outlineVariant}`,
                backgroundColor: tokens.surface,
                color: tokens.onSurface,
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <CornerUpLeft size={13} /> Responder
            </button>
            {m.is_me && !gif && (
              <button
                type="button"
                onClick={() => onEdit(m)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: `1px solid ${tokens.outlineVariant}`,
                  backgroundColor: tokens.surface,
                  color: tokens.onSurface,
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Pencil size={12} /> Editar
              </button>
            )}
            {(m.is_me || amIRep) && (
              <button
                type="button"
                onClick={() => onDelete(m)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: 'none',
                  backgroundColor: tokens.errorContainer,
                  color: tokens.onErrorContainer,
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={13} /> {m.is_me ? 'Apagar' : 'Moderar'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export const ClassroomChatScreen: React.FC<{
  token: string;
  classCode: string;
  channelKind: ClassroomChannelKind;
  initialRefAnnouncement?: AnnouncementItem | null;
  onClose: () => void;
}> = ({ token, classCode, channelKind, initialRefAnnouncement = null, onClose }) => {
  const { tokens } = useM3Theme();

  const initialCache = loadCachedClassroomChat(token, classCode, channelKind);

  const [messages, setMessages] = useState<ClassroomChatMessage[]>(() => initialCache?.messages ?? []);
  const [amIRep, setAmIRep] = useState(initialCache?.amIRep ?? false);
  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<ChatRateLimitStatus | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [hasMoreBefore, setHasMoreBefore] = useState(initialCache?.hasMoreBefore ?? false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ClassroomChatMessage | null>(null);
  const [editing, setEditing] = useState<ClassroomChatMessage | null>(null);
  const [refAnnouncement, setRefAnnouncement] = useState<AnnouncementItem | null>(initialRefAnnouncement);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const [viewerGif, setViewerGif] = useState<GiphyItem | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Keep the composer banner mounted briefly on close so it glides out smoothly.
  type BannerSnapshot = {
    editing: ClassroomChatMessage | null;
    replyTo: ClassroomChatMessage | null;
    refAnnouncement: AnnouncementItem | null;
    pendingImage: string | null;
  };
  const hasBanner = Boolean(replyTo || editing || refAnnouncement || pendingImage);
  const [renderedBanner, setRenderedBanner] = useState<BannerSnapshot | null>(
    hasBanner ? { editing, replyTo, refAnnouncement, pendingImage } : null
  );
  const [bannerExiting, setBannerExiting] = useState(false);
  useEffect(() => {
    if (hasBanner) {
      setRenderedBanner({ editing, replyTo, refAnnouncement, pendingImage });
      setBannerExiting(false);
      return;
    }
    if (!renderedBanner) return;
    if (prefersReducedMotion()) {
      setRenderedBanner(null);
      setBannerExiting(false);
      return;
    }
    setBannerExiting(true);
    const t = window.setTimeout(() => {
      setRenderedBanner(null);
      setBannerExiting(false);
    }, 165);
    return () => window.clearTimeout(t);
  }, [hasBanner, editing, replyTo, refAnnouncement, pendingImage, renderedBanner]);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickRef = useRef(true);
  const revRef = useRef(initialCache?.nextRev ?? 0);
  const lastTypingPing = useRef(0);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(t);
  }, [notice]);

  const close = usePushedPage(surfaceRef, onClose);

  // Back button closes action menu or edit banner BEFORE closing the chat screen.
  useBackLayer(activeMenuId !== null, () => setActiveMenuId(null), { kind: 'inline' });
  useBackLayer(
    Boolean(editing),
    () => {
      setEditing(null);
      setDraft('');
    },
    { kind: 'inline' }
  );

  const applyPayload = useCallback(
    (payload: Awaited<ReturnType<typeof fetchClassroomChannelMessages>>, mode: 'initial' | 'poll' | 'older') => {
      setAmIRep(payload.am_i_representative);
      setRateLimit(payload.rate_limit);
      setTypingUsers(payload.typing_users ?? []);
      if (mode !== 'older') {
        revRef.current = Math.max(revRef.current, payload.next_rev);
      }
      if (mode !== 'poll') {
        setHasMoreBefore(payload.has_more_before);
      }
      if (payload.messages.length > 0) {
        setMessages((prev) => mergeClassroomMessages(prev, payload.messages));
      }
    },
    []
  );

  const syncIncremental = useCallback(async () => {
    try {
      const payload = await fetchClassroomChannelMessages(token, channelKind, {
        afterRev: revRef.current,
        limit: 100,
      });
      applyPayload(payload, 'poll');
    } catch {
      // transient failure
    }
  }, [token, channelKind, applyPayload]);

  useEffect(() => {
    let cancelled = false;
    const cached = loadCachedClassroomChat(token, classCode, channelKind);
    if (cached) {
      setMessages(cached.messages);
      setAmIRep(cached.amIRep);
      setHasMoreBefore(cached.hasMoreBefore);
      revRef.current = cached.nextRev;
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
      revRef.current = 0;
      setMessages([]);
    }

    void (async () => {
      try {
        const payload =
          cached && cached.nextRev > 0
            ? await fetchClassroomChannelMessages(token, channelKind, { afterRev: cached.nextRev, limit: 100 })
            : await fetchClassroomChannelMessages(token, channelKind, { limit: PAGE_SIZE });
        if (!cancelled) applyPayload(payload, cached ? 'poll' : 'initial');
      } catch (err) {
        // Keep cached messages visible without interrupting the user on transient failures.
        if (!cancelled && !cached) {
          setError(err instanceof NsacApiClientError ? err.message : 'Não foi possível abrir o canal.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, classCode, channelKind, applyPayload]);

  // Persist classroom chat messages locally so re-opening is instant.
  useEffect(() => {
    if (loading) return;
    saveCachedClassroomChat(token, classCode, channelKind, {
      messages,
      nextRev: revRef.current,
      hasMoreBefore,
      amIRep,
      updatedAt: Date.now(),
    });
  }, [messages, loading, token, classCode, channelKind, hasMoreBefore, amIRep]);

  // Realtime SSE stream + periodic fallback poll
  useEffect(() => {
    if (loading || error) return;
    const unsub = subscribeClassroomStream(token, (ev) => {
      if (ev.kind === 'resync' || (ev.kind === 'rev_bump' && ev.channel === channelKind)) {
        void syncIncremental();
      } else if (ev.kind === 'typing' && ev.channel === channelKind) {
        void syncIncremental();
      }
    });
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void syncIncremental();
      }
    }, POLL_FALLBACK_MS);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, [loading, error, token, channelKind, syncIncremental]);

  // Elastic top/bottom overscroll rubber-band at the edges of the conversation.
  useChatOverscroll(listRef, contentRef, !loading && !error);

  // Keyboard inset layout (same zero-recalc approach as 1:1 ChatScreen)
  useLayoutEffect(() => {
    let raf = 0;
    const applyNow = () => {
      raf = 0;
      const el = surfaceRef.current;
      if (!el) return;
      const g = getKeyboardGeometry();
      el.style.top = `${g.vvTop}px`;
      el.style.height = `${g.vvHeight}px`;
      el.style.paddingBottom = `max(env(safe-area-inset-bottom, 0px), ${g.inset}px)`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(applyNow);
    };
    applyNow();
    const off = onKeyboardInsetChange(schedule);
    return () => {
      off();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, typingUsers, loading]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMoreBefore || messages.length === 0) return;
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const payload = await fetchClassroomChannelMessages(token, channelKind, {
        beforeId: oldest.id,
        limit: PAGE_SIZE,
      });
      applyPayload(payload, 'older');
    } catch {
      // ignore
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasMoreBefore, messages, token, channelKind, applyPayload]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
    if (el.scrollTop < 180) void loadOlder();
  };

  const handlePickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file, 1280, 1280, 0.82);
      setPendingImage(dataUrl);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Imagem inválida.');
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text && !pendingImage) return;
    if (sending) return;
    setSending(true);
    try {
      if (editing) {
        const updated = await editClassroomChannelMessage(token, channelKind, editing.id, text);
        setMessages((prev) => mergeClassroomMessages(prev, [updated]));
        setEditing(null);
        setDraft('');
      } else {
        const res = await sendClassroomChannelMessage(token, channelKind, {
          text,
          reply_to_id: replyTo?.id ?? null,
          ref_announcement_id: refAnnouncement?.id ?? null,
          image_data_url: pendingImage,
        });
        revRef.current = Math.max(revRef.current, res.message.rev);
        setRateLimit(res.rate_limit);
        stickRef.current = true;
        setMessages((prev) => mergeClassroomMessages(prev, [res.message]));
        setDraft('');
        setReplyTo(null);
        setRefAnnouncement(null);
        setPendingImage(null);
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (err) {
      showNotice(err instanceof NsacApiClientError ? err.message : 'Não foi possível enviar.');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = useCallback(async (m: ClassroomChatMessage) => {
    setActiveMenuId(null);
    try {
      const updated = await deleteClassroomChannelMessage(token, channelKind, m.id);
      setMessages((prev) => mergeClassroomMessages(prev, [updated]));
    } catch (err) {
      showNotice(err instanceof NsacApiClientError ? err.message : 'Não foi possível remover.');
    }
  }, [token, channelKind, showNotice]);

  const handleReact = useCallback(async (m: ClassroomChatMessage, emoji: string) => {
    setActiveMenuId(null);
    const already = m.reactions.some((r) => r.mine && r.emoji === emoji);
    const nextEmoji = already ? null : emoji;
    try {
      navigator.vibrate?.(8);
    } catch {
      // Haptics unavailable
    }

    // Optimistic update: immediate pill bounce + floating emoji burst on frame 0.
    const optimisticReactions = m.reactions
      .map((r) => (r.mine ? { ...r, count: r.count - 1, mine: false } : r))
      .filter((r) => r.count > 0);
    if (nextEmoji) {
      const existing = optimisticReactions.find((r) => r.emoji === nextEmoji);
      if (existing) {
        existing.count += 1;
        existing.mine = true;
      } else {
        optimisticReactions.push({ emoji: nextEmoji, count: 1, mine: true });
      }
    }
    setMessages((prev) =>
      prev.map((item) => (item.id === m.id ? { ...item, reactions: optimisticReactions } : item))
    );

    try {
      const updated = await setClassroomChannelMessageReaction(
        token,
        channelKind,
        m.id,
        nextEmoji
      );
      setMessages((prev) => mergeClassroomMessages(prev, [updated]));
    } catch {
      // Rollback on failure
      setMessages((prev) => mergeClassroomMessages(prev, [m]));
    }
  }, [token, channelKind]);

  const handleStartReply = useCallback((m: ClassroomChatMessage) => {
    setReplyTo(m);
    setEditing(null);
    setActiveMenuId(null);
    inputRef.current?.focus();
  }, []);

  const handleStartEdit = useCallback((m: ClassroomChatMessage) => {
    setEditing(m);
    setDraft(m.text);
    setReplyTo(null);
    setActiveMenuId(null);
    inputRef.current?.focus();
  }, []);

  const isOffTopic = channelKind === 'off_topic';
  const headerTitle = isOffTopic ? `Off-Topic • ${classCode}` : `Chat da Turma • ${classCode}`;
  const headerSub = isOffTopic ? 'Conversa livre e resenha da sala' : 'Provas, trabalhos, horários e dúvidas';

  return createPortal(
    <div
      ref={surfaceRef}
      role="dialog"
      aria-modal="true"
      aria-label={headerTitle}
      className="nsac-chat-root"
      data-ime-managed
      data-no-size-morph
      style={{
        backgroundColor: tokens.background,
        color: tokens.onBackground,
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 12px 10px',
          backgroundColor: tokens.surfaceContainerLow,
          borderBottom: `1px solid ${tokens.outlineVariant}`,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => close()}
          aria-label="Voltar"
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            border: 'none',
            backgroundColor: 'transparent',
            color: tokens.onSurface,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={22} />
        </button>

        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 14,
            backgroundColor: isOffTopic ? tokens.tertiaryContainer : tokens.primaryContainer,
            color: isOffTopic ? tokens.onTertiaryContainer : tokens.onPrimaryContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isOffTopic ? <Sparkles size={18} /> : <MessageSquare size={18} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '0.98rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {headerTitle}
          </div>
          <div style={{ fontSize: '0.73rem', color: tokens.onSurfaceVariant, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {typingUsers.length > 0 ? `${typingUsers.slice(0, 2).join(', ')} digitando…` : headerSub}
          </div>
        </div>
      </header>

      {notice && (
        <div
          role="status"
          style={{
            padding: '8px 14px',
            backgroundColor: tokens.errorContainer,
            color: tokens.onErrorContainer,
            fontSize: '0.8rem',
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          {notice}
        </div>
      )}

      {/* Messages list */}
      <div
        ref={listRef}
        data-chat-scroller
        onScroll={handleScroll}
        onClick={() => setActiveMenuId(null)}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          ref={contentRef}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '8px 6px 10px',
            boxSizing: 'border-box',
          }}
        >
        {loading ? (
          <div style={{ margin: 'auto' }}>
            <MorphingLoadingState label="Carregando mensagens..." />
          </div>
        ) : error ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: tokens.error, maxWidth: 320 }}>
            {error}
          </div>
        ) : messages.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: tokens.onSurfaceVariant, maxWidth: 300 }}>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: tokens.onSurface, marginBottom: 6 }}>
              {isOffTopic ? 'Off-Topic da Turma' : 'Chat Oficial da Turma'}
            </div>
            <div style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
              Nenhuma mensagem ainda. Comece a conversa com seus colegas da {classCode}!
            </div>
          </div>
        ) : (
          <>
          <div aria-hidden="true" style={{ flex: 1 }} />
          {messages.map((m, idx) => {
            const prev = messages[idx - 1];
            const next = messages[idx + 1];
            const sameAsPrev =
              Boolean(prev) &&
              prev!.sender_id === m.sender_id &&
              Math.abs(Date.parse(m.created_at) - Date.parse(prev!.created_at)) < 5 * 60_000;
            const sameAsNext =
              Boolean(next) &&
              next!.sender_id === m.sender_id &&
              Math.abs(Date.parse(next!.created_at) - Date.parse(m.created_at)) < 5 * 60_000;
            return (
              <ClassroomMessageRow
                key={m.id}
                m={m}
                token={token}
                classCode={classCode}
                groupStart={!sameAsPrev}
                groupEnd={!sameAsNext}
                menuOpen={activeMenuId === m.id}
                isEditing={editing?.id === m.id}
                amIRep={amIRep}
                onToggleMenu={setActiveMenuId}
                onReact={handleReact}
                onReply={handleStartReply}
                onEdit={handleStartEdit}
                onDelete={handleDelete}
                onOpenLightbox={setLightboxUrl}
                onOpenGif={setViewerGif}
              />
            );
          })}
          </>
        )}
        </div>
      </div>

      {/* Composer banners (animated M3 slide+fade enter & exit) */}
      {renderedBanner && (
        <div
          className={bannerExiting ? 'nsac-composer-banner-out' : 'nsac-composer-banner-in'}
          style={{
            padding: '8px 14px',
            backgroundColor: tokens.surfaceContainerLow,
            borderTop: `1px solid ${tokens.outlineVariant}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            fontSize: '0.78rem',
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            {renderedBanner.editing && <strong>Editando mensagem</strong>}
            {renderedBanner.replyTo && (
              <>
                <strong>Respondendo a {renderedBanner.replyTo.sender_label}</strong>
                <div style={{ opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {renderedBanner.replyTo.text}
                </div>
              </>
            )}
            {renderedBanner.refAnnouncement && (
              <>
                <strong>Discutindo anúncio:</strong>{' '}
                {renderedBanner.refAnnouncement.title || renderedBanner.refAnnouncement.body.slice(0, 60)}
              </>
            )}
            {renderedBanner.pendingImage && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <img src={renderedBanner.pendingImage} alt="Prévia" style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover' }} />
                <span>Imagem pronta para envio</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setReplyTo(null);
              setEditing(null);
              setRefAnnouncement(null);
              setPendingImage(null);
              if (editing) setDraft('');
            }}
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              border: 'none',
              backgroundColor: tokens.surfaceContainerHigh,
              color: tokens.onSurface,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Input Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          padding: '8px 12px 10px',
          backgroundColor: tokens.surfaceContainerLow,
          borderTop: `1px solid ${tokens.outlineVariant}`,
          flexShrink: 0,
        }}
      >
        {amIRep && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handlePickImage}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title="Anexar imagem (Representante)"
              aria-label="Anexar imagem"
              style={{
                width: 42,
                height: 42,
                borderRadius: 999,
                border: `1px solid ${tokens.outlineVariant}`,
                backgroundColor: tokens.surfaceContainerHigh,
                color: tokens.primary,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                cursor: 'pointer',
              }}
            >
              <ImagePlus size={19} />
            </button>
          </>
        )}

        <textarea
          ref={inputRef}
          rows={1}
          maxLength={500}
          enterKeyHint="enter"
          placeholder={
            rateLimit && rateLimit.remaining <= 0
              ? `Aguarde ${rateLimit.retry_after_secs}s…`
              : isOffTopic
                ? 'Mande algo no Off-Topic…'
                : 'Mensagem para a turma…'
          }
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const now = Date.now();
            if (now - lastTypingPing.current > TYPING_PING_MS) {
              lastTypingPing.current = now;
              void sendClassroomChannelTyping(token, channelKind);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
              e.preventDefault();
              void handleSend();
            }
          }}
          style={{
            flex: 1,
            minHeight: 42,
            maxHeight: 120,
            padding: '10px 14px',
            borderRadius: 22,
            border: `1px solid ${tokens.outlineVariant}`,
            backgroundColor: tokens.surfaceContainerLowest,
            color: tokens.onSurface,
            fontSize: '0.92rem',
            fontFamily: 'inherit',
            lineHeight: 1.35,
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        <button
          type="button"
          disabled={sending || (!draft.trim() && !pendingImage)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void handleSend()}
          aria-label="Enviar mensagem"
          style={{
            width: 42,
            height: 42,
            borderRadius: 999,
            border: 'none',
            backgroundColor: tokens.primary,
            color: tokens.onPrimary,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            cursor: 'pointer',
            opacity: sending || (!draft.trim() && !pendingImage) ? 0.5 : 1,
            transition: prefersReducedMotion() ? undefined : 'opacity 150ms',
          }}
        >
          <Send size={18} />
        </button>
      </div>

      {viewerGif && <GifViewer item={viewerGif} onClose={() => setViewerGif(null)} />}
      {lightboxUrl && (
        <AnimatedImageLightbox
          token={token}
          src={lightboxUrl}
          alt="Imagem ampliada"
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </div>,
    document.body
  );
};
