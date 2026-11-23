import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowLeft, ChevronDown, ChevronUp, Lock, MoreVertical, Search, Trash2, UserRound, X } from 'lucide-react';
import {
  deleteConversation,
  editConversationMessage,
  fetchConversationMessages,
  NsacApiClientError,
  sendConversationMessage,
  sendTypingPing,
  setMessageReaction,
  unsendConversationMessage,
} from '../../../api/nsacClient';
import type { ChatMessage, ChatRateLimitStatus, ConversationMessagesPayload } from '../../../api/types';
import { useM3Theme } from '../../../theme/ThemeContext';
import { useBackLayer } from '../../../navigation/backStack';
import { DURATION, EASING, prefersReducedMotion, spring } from '../../../theme/motion';
import { usePushedPage } from '../../expressive/PushedPage';
import { getKeyboardGeometry, onKeyboardInsetChange } from '../../../platform/keyboardInsets';
import { MorphingLoadingState, MorphingShapeIndicator } from '../../expressive/ShapeMorph';
import { ProfileAvatar } from '../../profile/ProfileAvatar';
import { useProfileViewer } from '../../profile/ProfileViewer';
import { buildRows, chatTone, matchesQuery, mergeMessages, QUICK_STARTERS, type ChatItem } from './chatModel';
import { MessageBubble, haptic } from './MessageBubble';
import { MessageMenu } from './MessageMenu';
import { Composer } from './Composer';
import { GifViewer } from './GifKit';
import { encodeGifMessage, giphyPageUrl, parseGifMessage, type GiphyItem } from './giphy';
import { loadCachedDmChat, removeCachedDmChat, saveCachedDmChat } from '../../../utils/chatCache';
import { useChatOverscroll } from './useChatOverscroll';

export interface ChatPeerTarget {
  accountId: number;
  label: string;
  avatarUrl: string | null;
  classCode: string;
}

const POLL_VISIBLE_MS = 2500;
const TYPING_PING_MS = 3000;
const PAGE_SIZE = 50;

const firstNameOf = (label: string) => label.trim().split(/\s+/)[0] || label;

function errorText(err: unknown, fallback: string): string {
  return err instanceof NsacApiClientError || err instanceof Error ? err.message || fallback : fallback;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/**
 * Full-screen conversation. Enters with the shared axis X pattern and leaves with the
 * predictive back preview (the screen underneath is revealed while dragging).
 *
 * The layout follows the visual viewport and the software keyboard (`--nsac-vv-*`, `--nsac-ime-inset`) instead of letting the window
 * pan, so the header and the latest messages stay visible while typing.
 *
 * Replies, reactions, edits, unsend, read receipts and typing need a server with the chat
 * extras (`next_rev` in the payload); against older servers those controls stay hidden.
 */
export const ChatScreen: React.FC<{
  token: string;
  peer: ChatPeerTarget;
  onClose: () => void;
  onDeleted?: () => void;
}> = ({ token, peer, onClose, onDeleted }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const { openProfile } = useProfileViewer();
  const peerFirstName = firstNameOf(peer.label);

  const initialCache = useMemo(() => loadCachedDmChat(token, peer.accountId), [token, peer.accountId]);

  const [items, setItems] = useState<ChatItem[]>(() =>
    initialCache ? initialCache.messages.map((m) => ({ ...m, key: `m${m.id}` })) : []
  );
  const [peerInfo, setPeerInfo] = useState<{ label: string; avatar: string | null; classCode: string }>(() => ({
    label: initialCache?.peerInfo?.label || peer.label,
    avatar: initialCache?.peerInfo?.avatar ?? peer.avatarUrl,
    classCode: initialCache?.peerInfo?.classCode || peer.classCode,
  }));
  const [loading, setLoading] = useState(!initialCache);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: number; text: string; tone: 'error' | 'info' } | null>(null);
  const [isFriend, setIsFriend] = useState(initialCache?.isFriend ?? true);
  const [extras, setExtras] = useState(initialCache?.extras ?? false);
  const [rateLimit, setRateLimit] = useState<ChatRateLimitStatus | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [peerLastRead, setPeerLastRead] = useState(initialCache?.peerLastRead ?? 0);
  const [peerTyping, setPeerTyping] = useState(false);
  const [hasMoreBefore, setHasMoreBefore] = useState(initialCache?.hasMoreBefore ?? false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatItem | null>(null);
  const [editing, setEditing] = useState<ChatItem | null>(null);
  const [menu, setMenu] = useState<{ item: ChatItem; rect: DOMRect } | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [search, setSearch] = useState<{ query: string; index: number } | null>(null);
  const [viewerGif, setViewerGif] = useState<GiphyItem | null>(null);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const stickRef = useRef(true);
  const revRef = useRef(initialCache?.nextRev ?? 0);
  const lastIdRef = useRef(initialCache?.lastId ?? 0);
  const extrasRef = useRef(initialCache?.extras ?? false);
  const freshKeys = useRef<Set<string>>(new Set());
  const anchorRef = useRef<{ height: number; top: number } | null>(null);
  const lastTypingPing = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const showNotice = useCallback((text: string, tone: 'error' | 'info' = 'error') => setNotice({ id: Date.now(), text, tone }), []);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3800);
    return () => window.clearTimeout(t);
  }, [notice]);

  // ---------------------------------------------------------------- data
  const applyPayload = useCallback((payload: ConversationMessagesPayload, mode: 'initial' | 'poll' | 'older') => {
    const supports = typeof payload.next_rev === 'number';
    extrasRef.current = supports;
    setExtras(supports);
    setIsFriend(payload.is_friend);
    setRateLimit(payload.rate_limit);
    if (payload.peer) {
      setPeerInfo((prev) => ({
        label: payload.peer.display_label || prev.label,
        avatar: payload.peer.avatar_url ?? prev.avatar,
        classCode: payload.peer.class_code || prev.classCode,
      }));
    }
    if (supports) {
      if (mode !== 'older') revRef.current = Math.max(revRef.current, payload.next_rev ?? 0);
      setPeerLastRead(payload.peer_last_read_id ?? 0);
      setPeerTyping(Boolean(payload.peer_typing));
    }
    if (mode !== 'poll') setHasMoreBefore(Boolean(payload.has_more_before));
    const incoming = payload.messages;
    if (incoming.length === 0) return;
    const maxId = Math.max(...incoming.map((m) => m.id));
    if (mode === 'poll') {
      const known = new Set(itemsRef.current.map((m) => m.id));
      const arrivals = incoming.filter((m) => !known.has(m.id) && !m.is_me);
      arrivals.forEach((m) => freshKeys.current.add(`m${m.id}`));
      if (arrivals.length > 0) {
        setPeerTyping(false);
        if (!stickRef.current) setUnseen((n) => n + arrivals.length);
        else haptic(6);
      }
    }
    if (mode !== 'older') lastIdRef.current = Math.max(lastIdRef.current, maxId);
    setItems((prev) => mergeMessages(prev, incoming));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cached = loadCachedDmChat(token, peer.accountId);
    if (cached) {
      setItems(cached.messages.map((m) => ({ ...m, key: `m${m.id}` })));
      revRef.current = cached.nextRev;
      lastIdRef.current = cached.lastId;
      extrasRef.current = cached.extras;
      setExtras(cached.extras);
      setIsFriend(cached.isFriend);
      setPeerLastRead(cached.peerLastRead);
      setHasMoreBefore(cached.hasMoreBefore);
      setLoading(false);
      setLoadError(null);
    } else {
      setItems([]);
      revRef.current = 0;
      lastIdRef.current = 0;
      setLoading(true);
    }

    (async () => {
      try {
        const payload =
          cached && cached.extras && cached.nextRev > 0
            ? await fetchConversationMessages(token, peer.accountId, { afterRev: cached.nextRev, limit: 100 })
            : await fetchConversationMessages(token, peer.accountId, { limit: PAGE_SIZE });
        if (cancelled) return;
        applyPayload(payload, cached ? 'poll' : 'initial');
      } catch (err) {
        // If we already rendered cached messages, stay silent and let the user keep reading.
        if (!cancelled && !cached) setLoadError(errorText(err, 'Não foi possível abrir esta conversa.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, peer.accountId, applyPayload]);

  // Persist confirmed messages to local chat cache whenever conversation state advances.
  useEffect(() => {
    if (loading) return;
    const persisted: ChatMessage[] = items
      .filter((m) => !m.local)
      .map(({ key: _k, local: _l, ...rest }) => rest);
    saveCachedDmChat(token, peer.accountId, {
      messages: persisted,
      nextRev: revRef.current,
      lastId: lastIdRef.current,
      hasMoreBefore,
      isFriend,
      extras,
      peerLastRead,
      peerInfo,
      updatedAt: Date.now(),
    });
  }, [items, loading, token, peer.accountId, hasMoreBefore, isFriend, extras, peerLastRead, peerInfo]);

  // Sync loop: new + changed messages (rev), typing and read receipts.
  useEffect(() => {
    if (loading || loadError) return;
    let timer = 0;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const payload = extrasRef.current
            ? await fetchConversationMessages(token, peer.accountId, { afterRev: revRef.current, limit: 100 })
            : await fetchConversationMessages(token, peer.accountId, { afterId: lastIdRef.current || undefined, limit: PAGE_SIZE });
          if (!stopped) applyPayload(payload, 'poll');
        } catch {
          // Keep the conversation on transient failures.
        }
      }
      if (!stopped) timer = window.setTimeout(tick, POLL_VISIBLE_MS);
    };
    timer = window.setTimeout(tick, POLL_VISIBLE_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [loading, loadError, token, peer.accountId, applyPayload]);

  // Rate-limit countdown.
  useEffect(() => {
    if (!rateLimit || rateLimit.remaining > 0) {
      setCooldown(0);
      return;
    }
    setCooldown(rateLimit.retry_after_secs);
    const t = window.setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [rateLimit]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMoreBefore) return;
    const first = itemsRef.current.find((m) => !m.local);
    if (!first) return;
    const el = listRef.current;
    setLoadingOlder(true);
    try {
      const payload = await fetchConversationMessages(token, peer.accountId, { beforeId: first.id, limit: PAGE_SIZE });
      if (el) anchorRef.current = { height: el.scrollHeight, top: el.scrollTop };
      applyPayload(payload, 'older');
      if (payload.messages.length === 0) setHasMoreBefore(false);
    } catch (err) {
      showNotice(errorText(err, 'Não foi possível carregar mensagens antigas.'));
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasMoreBefore, token, peer.accountId, applyPayload, showNotice]);

  // ---------------------------------------------------------------- scrolling
  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
  }, []);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const anchor = anchorRef.current;
    if (anchor) {
      // Older page prepended: keep the same message under the finger.
      el.scrollTop = anchor.top + (el.scrollHeight - anchor.height);
      anchorRef.current = null;
      return;
    }
    if (stickRef.current) el.scrollTop = el.scrollHeight;
  }, [items, peerTyping, loading]);

  // Follow the visible area while the keyboard moves using plain layout properties ONLY (never
  // CSS custom properties, which trigger 13–26ms descendant style recalcs per frame on Android).
  useLayoutEffect(() => {
    let pendingRaf = 0;
    const applyNow = () => {
      pendingRaf = 0;
      const el = surfaceRef.current;
      if (!el) return;
      const g = getKeyboardGeometry();
      el.style.top = `${g.vvTop}px`;
      el.style.height = `${g.vvHeight}px`;
      el.style.paddingBottom = `max(env(safe-area-inset-bottom, 0px), ${g.inset}px)`;
    };
    const schedule = () => {
      if (!pendingRaf) pendingRaf = requestAnimationFrame(applyNow);
    };
    applyNow();
    const off = onKeyboardInsetChange(schedule);
    return () => {
      off();
      if (pendingRaf) cancelAnimationFrame(pendingRaf);
    };
  }, []);

  // Elastic top/bottom overscroll rubber-band at the edges of the conversation.
  useChatOverscroll(listRef, contentRef, !loading && !loadError);

  // Stay pinned to the latest message when the list resizes (batched in rAF to avoid sync layout thrash).
  useEffect(() => {
    const el = listRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    let pinRaf = 0;
    const schedulePin = () => {
      if (!stickRef.current || pinRaf) return;
      pinRaf = requestAnimationFrame(() => {
        pinRaf = 0;
        if (stickRef.current) el.scrollTop = el.scrollHeight;
      });
    };
    const ro = new ResizeObserver(schedulePin);
    ro.observe(el);
    ro.observe(content);
    return () => {
      ro.disconnect();
      if (pinRaf) cancelAnimationFrame(pinRaf);
    };
  }, [loading]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 56;
    stickRef.current = bottom;
    if (bottom !== atBottom) setAtBottom(bottom);
    if (bottom && unseen) setUnseen(0);
    if (el.scrollTop < 240) void loadOlder();
  };

  const jumpTo = useCallback(
    (messageId: number) => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
      if (!el) {
        showNotice('Essa mensagem é mais antiga. Role para cima para carregar.', 'info');
        return;
      }
      stickRef.current = false;
      el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      setFlashId(null);
      window.requestAnimationFrame(() => setFlashId(messageId));
    },
    [showNotice]
  );
  useEffect(() => {
    if (flashId === null) return;
    const t = window.setTimeout(() => setFlashId(null), 1400);
    return () => window.clearTimeout(t);
  }, [flashId]);

  // ---------------------------------------------------------------- actions
  const confirmLocal = (tempKey: string, message: ChatMessage) =>
    setItems((prev) => {
      const without = prev.filter((m) => m.key !== tempKey);
      if (without.some((m) => m.id === message.id)) return without;
      const merged = mergeMessages(without, [message]);
      return merged.map((m) => (m.id === message.id ? { ...m, key: tempKey } : m));
    });

  const sendText = useCallback(
    async (text: string, replyItem: ChatItem | null, retryKey?: string) => {
      const tempKey = retryKey ?? `l${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      const temp: ChatItem = {
        id: -Date.now(),
        key: tempKey,
        sender_id: 0,
        is_me: true,
        text,
        created_at: new Date().toISOString(),
        reply_to: replyItem
          ? { id: replyItem.id, sender_id: replyItem.sender_id, is_me: replyItem.is_me, text: replyItem.text, deleted: false }
          : null,
        reactions: [],
        local: 'sending',
      };
      freshKeys.current.add(tempKey);
      stickRef.current = true;
      setItems((prev) => [...prev.filter((m) => m.key !== tempKey), temp]);
      try {
        const res = await sendConversationMessage(token, peer.accountId, text, replyItem?.id ?? null);
        lastIdRef.current = Math.max(lastIdRef.current, res.message.id);
        setRateLimit(res.rate_limit);
        confirmLocal(tempKey, res.message);
      } catch (err) {
        setItems((prev) => prev.map((m) => (m.key === tempKey ? { ...m, local: 'failed' } : m)));
        showNotice(errorText(err, 'Não foi possível enviar a mensagem.'));
      }
    },
    [token, peer.accountId, showNotice]
  );

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    if (editing) {
      const target = editing;
      setEditing(null);
      setDraft('');
      setItems((prev) => prev.map((m) => (m.id === target.id ? { ...m, text, edited_at: new Date().toISOString() } : m)));
      try {
        const updated = await editConversationMessage(token, peer.accountId, target.id, text);
        setItems((prev) => mergeMessages(prev, [updated]));
      } catch (err) {
        setItems((prev) => mergeMessages(prev, [target]));
        showNotice(errorText(err, 'Não foi possível editar.'));
      }
      return;
    }
    const reply = replyTo;
    setDraft('');
    setReplyTo(null);
    await sendText(text, reply);
  };

  const onDraftChange = (text: string) => {
    setDraft(text);
    if (!extrasRef.current || !isFriend || !text.trim()) return;
    const now = Date.now();
    if (now - lastTypingPing.current > TYPING_PING_MS) {
      lastTypingPing.current = now;
      void sendTypingPing(token, peer.accountId);
    }
  };

  const toggleReaction = useCallback(
    async (item: ChatItem, emoji: string) => {
      if (!extrasRef.current || item.local || item.deleted) return;
      const mineNow = item.reactions?.find((r) => r.mine);
      const next = mineNow?.emoji === emoji ? null : emoji;
      // Optimistic: move the viewer's reaction.
      const optimistic = (item.reactions ?? [])
        .map((r) => (r.mine ? { ...r, count: r.count - 1, mine: false } : r))
        .filter((r) => r.count > 0);
      if (next) {
        const existing = optimistic.find((r) => r.emoji === next);
        if (existing) {
          existing.count += 1;
          existing.mine = true;
        } else optimistic.push({ emoji: next, count: 1, mine: true });
      }
      setItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, reactions: optimistic } : m)));
      haptic(8);
      try {
        const updated = await setMessageReaction(token, peer.accountId, item.id, next);
        setItems((prev) => mergeMessages(prev, [updated]));
      } catch (err) {
        setItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, reactions: item.reactions } : m)));
        showNotice(errorText(err, 'Não foi possível reagir.'));
      }
    },
    [token, peer.accountId, showNotice]
  );

  const startReply = useCallback((item: ChatItem) => {
    if (!extrasRef.current || item.deleted || item.local) return;
    setEditing(null);
    setReplyTo(item);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const openMenu = useCallback((item: ChatItem, anchor: HTMLElement) => {
    setMenu({ item, rect: anchor.getBoundingClientRect() });
  }, []);

  const retry = useCallback(
    (item: ChatItem) => {
      void sendText(item.text, null, item.key);
    },
    [sendText]
  );

  const unsend = async (item: ChatItem) => {
    setItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, deleted: true, text: '', reactions: [] } : m)));
    try {
      const updated = await unsendConversationMessage(token, peer.accountId, item.id);
      setItems((prev) => mergeMessages(prev, [updated]));
    } catch (err) {
      setItems((prev) => mergeMessages(prev, [item]));
      showNotice(errorText(err, 'Não foi possível apagar.'));
    }
  };

  const clearConversation = async () => {
    setConfirmClear(false);
    try {
      await deleteConversation(token, peer.accountId);
      removeCachedDmChat(token, peer.accountId);
      setItems([]);
      setHasMoreBefore(false);
      onDeleted?.();
      showNotice('Conversa apagada para você.', 'info');
    } catch {
      showNotice('Não foi possível apagar a conversa agora.');
    }
  };

  // ---------------------------------------------------------------- page transitions + back
  const close = usePushedPage(surfaceRef, onClose);

  // Back order: menus/search/reply first (their own layers or the handler below), then the page.
  const hasInlineState = Boolean(search || replyTo || editing || overflowOpen);
  useBackLayer(
    hasInlineState,
    () => {
      if (overflowOpen) setOverflowOpen(false);
      else if (search) setSearch(null);
      else {
        setReplyTo(null);
        if (editing) {
          setEditing(null);
          setDraft('');
        }
      }
    },
    { kind: 'inline' }
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || menu || viewerGif) return;
      if (search) setSearch(null);
      else if (replyTo || editing) {
        setReplyTo(null);
        setEditing(null);
      } else close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, menu, viewerGif, search, replyTo, editing]);

  // ---------------------------------------------------------------- derived
  const rows = useMemo(() => buildRows(items), [items]);
  const lastMine = useMemo(() => [...items].reverse().find((m) => m.is_me && !m.local), [items]);
  const matches = useMemo(
    () => (search?.query.trim() ? items.filter((m) => matchesQuery(m, search.query)).map((m) => m.id).reverse() : []),
    [items, search?.query]
  );
  const currentMatchId = search && matches.length ? matches[Math.min(search.index, matches.length - 1)] : null;

  useEffect(() => {
    if (currentMatchId === null || currentMatchId === undefined) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-message-id="${currentMatchId}"]`);
    stickRef.current = false;
    el?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [currentMatchId]);

  // While searching, pull the whole (cleared-aware) history so search covers everything.
  useEffect(() => {
    if (search?.query.trim() && hasMoreBefore && !loadingOlder && items.length < 600) void loadOlder();
  }, [search?.query, hasMoreBefore, loadingOlder, items.length, loadOlder]);

  // Fresh-entry markers are one-shot.
  useEffect(() => {
    if (freshKeys.current.size === 0) return;
    const t = window.setTimeout(() => freshKeys.current.clear(), 700);
    return () => window.clearTimeout(t);
  }, [items]);

  const quotaNote = !rateLimit
    ? null
    : rateLimit.remaining <= 0
      ? `Limite de ${rateLimit.limit} mensagens a cada 3 min. Libera em ${cooldown}s.`
      : rateLimit.remaining <= 3
        ? `Restam ${rateLimit.remaining} de ${rateLimit.limit} mensagens nos próximos minutos.`
        : null;
  const disabledReason = rateLimit && rateLimit.remaining <= 0 && !editing ? `Aguarde ${cooldown}s` : null;

  const subtitle = peerTyping ? 'digitando' : !isFriend ? 'Somente leitura' : [peerInfo.classCode, 'Amigos'].filter(Boolean).join(' · ');

  const handlers = { onReply: startReply, onOpenMenu: openMenu, onToggleReaction: toggleReaction, onJumpTo: jumpTo, onRetry: retry, onOpenGif: setViewerGif };

  const sendGif = (item: GiphyItem) => {
    const reply = replyTo;
    setReplyTo(null);
    void sendText(encodeGifMessage(item), reply);
  };

  // ---------------------------------------------------------------- render
  const iconBtn = (label: string, onClick: () => void, icon: React.ReactNode, active = false) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="nsac-chat-icon-btn"
      style={{ color: active ? tokens.primary : tokens.onSurfaceVariant }}
    >
      {icon}
    </button>
  );

  const header = (
    <header className="nsac-chat-bar" style={{ backgroundColor: chatTone(tokens, 4), color: tokens.onSurface }}>
      {search ? (
        <div key="search" className="nsac-chat-bar-swap" style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
          {iconBtn('Fechar pesquisa', () => setSearch(null), <ArrowLeft size={22} />)}
          <input
            ref={searchInputRef}
            autoFocus
            value={search.query}
            onChange={(e) => setSearch({ query: e.target.value, index: 0 })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches.length) setSearch((s) => s && { ...s, index: (s.index + 1) % matches.length });
            }}
            placeholder="Pesquisar na conversa"
            aria-label="Pesquisar na conversa"
            style={{
              flex: 1,
              minWidth: 0,
              height: 44,
              padding: '0 14px',
              border: 'none',
              outline: 'none',
              borderRadius: 999,
              backgroundColor: chatTone(tokens, 8),
              color: tokens.onSurface,
              fontSize: '0.95rem',
              fontFamily: 'inherit',
            }}
          />
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: tokens.onSurfaceVariant, minWidth: 44, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {search.query.trim() ? (matches.length ? `${Math.min(search.index, matches.length - 1) + 1}/${matches.length}` : '0') : ''}
          </span>
          {iconBtn('Resultado anterior', () => matches.length && setSearch((s) => s && { ...s, index: (s.index + 1) % matches.length }), <ChevronUp size={20} />)}
          {iconBtn('Próximo resultado', () => matches.length && setSearch((s) => s && { ...s, index: (s.index - 1 + matches.length) % matches.length }), <ChevronDown size={20} />)}
        </div>
      ) : (
        <div key="title" className="nsac-chat-bar-swap" style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
          {iconBtn('Voltar', close, <ArrowLeft size={22} />)}
          <button
            type="button"
            className="nsac-chat-peer"
            onClick={() => openProfile({ accountId: peer.accountId, label: peerInfo.label })}
            aria-label={`Abrir perfil de ${peerInfo.label}`}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <ProfileAvatar name={peerInfo.label} image={peerInfo.avatar} size={40} />
            </span>
            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {peerInfo.label}
              </span>
              <span
                key={peerTyping ? 'typing' : 'status'}
                className="nsac-chat-subtitle"
                style={{ fontSize: '0.74rem', fontWeight: 600, color: peerTyping ? tokens.primary : tokens.onSurfaceVariant }}
              >
                {subtitle}
                {peerTyping && <span className="nsac-chat-ellipsis" aria-hidden="true" />}
              </span>
            </span>
          </button>
          {iconBtn('Pesquisar na conversa', () => setSearch({ query: '', index: 0 }), <Search size={20} />)}
          <span style={{ position: 'relative' }}>
            {iconBtn('Mais opções', () => setOverflowOpen((v) => !v), <MoreVertical size={20} />, overflowOpen)}
            {overflowOpen && (
              <>
                <span style={{ position: 'fixed', inset: 0, zIndex: 25 }} onClick={() => setOverflowOpen(false)} />
                <div
                  role="menu"
                  className="nsac-chat-dropdown"
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 'calc(100% + 6px)',
                    zIndex: 26,
                    minWidth: 220,
                    padding: '6px 0',
                    borderRadius: isMaterialYou ? 18 : 10,
                    backgroundColor: tokens.surfaceContainerHigh,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
                  }}
                >
                  {[
                    { key: 'profile', label: 'Ver perfil', icon: <UserRound size={18} />, onClick: () => openProfile({ accountId: peer.accountId, label: peerInfo.label }) },
                    { key: 'search', label: 'Pesquisar', icon: <Search size={18} />, onClick: () => setSearch({ query: '', index: 0 }) },
                    { key: 'clear', label: 'Apagar conversa para mim', icon: <Trash2 size={18} />, danger: true, onClick: () => setConfirmClear(true) },
                  ].map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      role="menuitem"
                      className="nsac-chat-menu-item"
                      onClick={() => {
                        setOverflowOpen(false);
                        a.onClick();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        width: '100%',
                        minHeight: 46,
                        padding: '0 16px',
                        border: 'none',
                        background: 'transparent',
                        color: a.danger ? tokens.error : tokens.onSurface,
                        fontFamily: 'inherit',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ display: 'inline-flex', color: a.danger ? tokens.error : tokens.onSurfaceVariant }}>{a.icon}</span>
                      {a.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </span>
        </div>
      )}
    </header>
  );

  const emptyState = (
    <div className="nsac-chat-empty" style={{ margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '32px 20px', textAlign: 'center' }}>
      <span style={{ position: 'relative', width: 132, height: 132, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ position: 'absolute', inset: 0, color: tokens.primaryContainer, display: 'inline-flex' }}>
          <MorphingShapeIndicator size={132} color={tokens.primaryContainer} label="Nova conversa" />
        </span>
        <ProfileAvatar name={peerInfo.label} image={peerInfo.avatar} size={72} />
      </span>
      <div>
        <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{isFriend ? `Diga oi para ${peerFirstName}` : 'Sem mensagens'}</div>
        <div style={{ fontSize: '0.82rem', color: tokens.onSurfaceVariant, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Lock size={13} /> Mensagens criptografadas no servidor
        </div>
      </div>
      {isFriend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 360 }}>
          {QUICK_STARTERS.map((text, i) => (
            <button
              key={text}
              type="button"
              className="nsac-chat-starter"
              onClick={() => void sendText(text, null)}
              disabled={Boolean(disabledReason)}
              style={{
                animationDelay: `${120 + i * 60}ms`,
                padding: '9px 14px',
                borderRadius: isMaterialYou ? 999 : 10,
                border: `1px solid ${tokens.outlineVariant}`,
                backgroundColor: tokens.surfaceContainerLow,
                color: tokens.onSurface,
                fontFamily: 'inherit',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const body = loading ? (
    <div style={{ margin: 'auto' }}>
      <MorphingLoadingState label="Abrindo conversa" minHeight={200} />
    </div>
  ) : loadError ? (
    <div style={{ margin: 'auto', padding: 24, textAlign: 'center', color: tokens.error, fontWeight: 700 }}>{loadError}</div>
  ) : items.length === 0 ? (
    emptyState
  ) : (
    <>
      {/* Short conversations sit at the bottom, next to the composer. */}
      <div aria-hidden="true" style={{ flex: 1 }} />
      {hasMoreBefore && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', minHeight: 40 }}>
          {loadingOlder ? (
            <MorphingShapeIndicator size={26} label="Carregando mensagens antigas" />
          ) : (
            <button type="button" onClick={() => void loadOlder()} className="nsac-chat-chip" style={{ backgroundColor: chatTone(tokens, 9), color: tokens.onSurfaceVariant }}>
              Carregar mensagens antigas
            </button>
          )}
        </div>
      )}
      {rows.map((row) =>
        row.type === 'day' ? (
          <div key={row.key} className="nsac-chat-day">
            <span style={{ backgroundColor: chatTone(tokens, 9), color: tokens.onSurfaceVariant }}>{row.label}</span>
          </div>
        ) : (
          <MessageBubble
            key={row.key}
            item={row.item!}
            peerFirstName={peerFirstName}
            groupStart={Boolean(row.groupStart)}
            groupEnd={Boolean(row.groupEnd)}
            seen={extras && row.item!.is_me && !row.item!.local && row.item!.id <= peerLastRead}
            showSeenCaption={extras && lastMine?.key === row.key && row.item!.id <= peerLastRead}
            fresh={freshKeys.current.has(row.key)}
            flash={flashId === row.item!.id}
            query={search?.query ?? ''}
            currentMatch={currentMatchId === row.item!.id}
            extras={extras}
            interactive={isFriend}
            {...handlers}
          />
        )
      )}
      {peerTyping && (
        <div className="nsac-chat-typing" aria-label={`${peerFirstName} está digitando`} style={{ backgroundColor: chatTone(tokens, 9) }}>
          <span style={{ backgroundColor: tokens.onSurfaceVariant }} />
          <span style={{ backgroundColor: tokens.onSurfaceVariant }} />
          <span style={{ backgroundColor: tokens.onSurfaceVariant }} />
        </div>
      )}
    </>
  );

  return createPortal(
    <div
      ref={surfaceRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Conversa com ${peerInfo.label}`}
      className="nsac-chat-root"
      data-ime-managed
      // The app-wide content size morph would animate every bubble/tile/list resize here (and
      // fight the GIF grid's scrolling); the chat animates its own pieces.
      data-no-size-morph
      style={{ backgroundColor: tokens.background, color: tokens.onBackground }}
    >
      {header}

      <div className="nsac-chat-body">
        <div ref={listRef} className="nsac-chat-scroll" onScroll={onScroll}>
          <div ref={contentRef} className="nsac-chat-column">
            {body}
          </div>
        </div>

        <button
          type="button"
          aria-label={unseen ? `${unseen} novas mensagens` : 'Ir para o fim'}
          className={`nsac-chat-jump${!atBottom && !loading ? ' is-visible' : ''}`}
          onClick={() => {
            stickRef.current = true;
            setUnseen(0);
            scrollToBottom(true);
          }}
          style={{ backgroundColor: tokens.secondaryContainer, color: tokens.onSecondaryContainer }}
        >
          <ArrowDown size={20} />
          {unseen > 0 && (
            <span key={unseen} className="nsac-chat-jump-badge" style={{ backgroundColor: tokens.primary, color: tokens.onPrimary }}>
              {unseen}
            </span>
          )}
        </button>

        {notice && (
          <div
            key={notice.id}
            role="status"
            className="nsac-chat-notice"
            style={{
              backgroundColor: notice.tone === 'error' ? tokens.errorContainer : tokens.onSurface,
              color: notice.tone === 'error' ? tokens.onErrorContainer : tokens.surface,
            }}
          >
            <span style={{ flex: 1 }}>{notice.text}</span>
            <button type="button" aria-label="Dispensar" onClick={() => setNotice(null)} style={{ border: 'none', background: 'transparent', color: 'inherit', display: 'inline-flex', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      <footer className="nsac-chat-footer" style={{ backgroundColor: tokens.background }}>
        <div className="nsac-chat-column">
          {!loading && !loadError && isFriend ? (
            <Composer
              draft={draft}
              onDraftChange={onDraftChange}
              onSend={() => void handleSend()}
              replyTo={replyTo}
              editing={editing}
              peerFirstName={peerFirstName}
              onCancelContext={() => {
                setReplyTo(null);
                if (editing) {
                  setEditing(null);
                  setDraft('');
                }
              }}
              disabledReason={disabledReason}
              quotaNote={quotaNote}
              inputRef={inputRef}
              onSendGif={sendGif}
            />
          ) : !loading && !loadError ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 16px',
                borderRadius: isMaterialYou ? 22 : 12,
                backgroundColor: tokens.surfaceContainer,
                color: tokens.onSurfaceVariant,
                fontSize: '0.84rem',
              }}
            >
              <Lock size={16} style={{ flexShrink: 0 }} />
              Vocês não são mais amigos. A conversa ficou somente leitura.
            </div>
          ) : null}
        </div>
      </footer>

      {menu && (
        <MessageMenu
          item={menu.item}
          anchor={menu.rect}
          extras={extras}
          canWrite={isFriend}
          bubble={
            <MessageBubble
              item={menu.item}
              peerFirstName={peerFirstName}
              groupStart
              groupEnd
              seen={menu.item.id <= peerLastRead}
              showSeenCaption={false}
              fresh={false}
              flash={false}
              query=""
              currentMatch={false}
              extras={extras}
              interactive={false}
              preview
            />
          }
          onClose={() => setMenu(null)}
          onReact={(emoji) => void toggleReaction(menu.item, emoji)}
          onReply={() => startReply(menu.item)}
          onCopy={() => void copyText(parseGifMessage(menu.item.text) ? giphyPageUrl(parseGifMessage(menu.item.text)!.id) : menu.item.text).then((ok) => showNotice(ok ? 'Mensagem copiada' : 'Não foi possível copiar', ok ? 'info' : 'error'))}
          onEdit={() => {
            setReplyTo(null);
            setEditing(menu.item);
            setDraft(menu.item.text);
            window.requestAnimationFrame(() => inputRef.current?.focus());
          }}
          onUnsend={() => void unsend(menu.item)}
        />
      )}

      {viewerGif && <GifViewer item={viewerGif} onClose={() => setViewerGif(null)} />}

      {confirmClear && (
        <ConfirmSheet
          title="Apagar esta conversa?"
          body={`As mensagens somem só para você. ${peerFirstName} continua vendo o histórico.`}
          confirmLabel="Apagar"
          onConfirm={() => void clearConversation()}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>,
    document.body
  );
};

/** Small M3 confirmation dialog inside the chat surface. */
const ConfirmSheet: React.FC<{
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, body, confirmLabel, onConfirm, onCancel }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  useBackLayer(true, onCancel, { kind: 'modal', surfaceRef, scrimRef });
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    const { easing, duration } = spring('defaultSpatial');
    surfaceRef.current?.animate([{ opacity: 0, scale: '0.8' }, { opacity: 1, scale: '1' }], { duration, easing });
    scrimRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION.short4, easing: EASING.linear });
  }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div ref={scrimRef} onClick={onCancel} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} />
      <div
        ref={surfaceRef}
        role="alertdialog"
        aria-label={title}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 360,
          padding: 24,
          borderRadius: isMaterialYou ? 28 : 14,
          backgroundColor: tokens.surfaceContainerHigh,
          color: tokens.onSurface,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', color: tokens.error, marginBottom: 12 }}>
          <Trash2 size={24} />
        </div>
        <div style={{ fontSize: '1.2rem', fontWeight: 800, textAlign: 'center' }}>{title}</div>
        <div style={{ fontSize: '0.88rem', color: tokens.onSurfaceVariant, marginTop: 10, textAlign: 'center', lineHeight: 1.45 }}>{body}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>
          <button type="button" onClick={onCancel} className="nsac-chat-text-btn" style={{ color: tokens.primary }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="nsac-chat-text-btn"
            style={{ backgroundColor: tokens.error, color: tokens.onError, borderRadius: 999 }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
