import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CornerUpLeft, Keyboard, Pencil, Send, Sticker, X } from 'lucide-react';
import { useM3Theme } from '../../../theme/ThemeContext';
import { useBackLayer } from '../../../navigation/backStack';
import { getKeyboardGeometry, onKeyboardInsetChange } from '../../../platform/keyboardInsets';
import { Expandable } from '../../expressive/Expandable';
import { chatTone, MAX_CHARS, type ChatItem } from './chatModel';
import { haptic } from './MessageBubble';
import { GifExplorer } from './GifKit';
import { describeMessageText, type GiphyItem } from './giphy';

type PanelTab = 'gifs' | 'stickers';

const MAX_LINES_PX = 6 * 22 + 20;
/** The character ring appears once the text gets close to the limit. */
const RING_FROM = 380;

export const Composer: React.FC<{
  draft: string;
  onDraftChange: (text: string) => void;
  onSend: () => void;
  replyTo: ChatItem | null;
  editing: ChatItem | null;
  peerFirstName: string;
  onCancelContext: () => void;
  disabledReason: string | null;
  quotaNote: string | null;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onSendGif: (item: GiphyItem) => void;
}> = ({ draft, onDraftChange, onSend, onSendGif, replyTo, editing, peerFirstName, onCancelContext, disabledReason, quotaNote, inputRef }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>('gifs');
  // Back gesture/button closes the GIF/sticker panel first instead of leaving the chat.
  useBackLayer(emojiOpen, () => setEmojiOpen(false), { kind: 'inline' });
  useEffect(() => {
    if (!emojiOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setEmojiOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [emojiOpen]);
  const openPanel = (next: PanelTab) => {
    if (emojiOpen && tab === next) {
      setEmojiOpen(false);
      inputRef.current?.focus();
      return;
    }
    setTab(next);
    setEmojiOpen(true);
    // The panel replaces the keyboard.
    inputRef.current?.blur();
  };
  const [lastContext, setLastContext] = useState<{ mode: 'reply' | 'edit'; item: ChatItem } | null>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const keepFocusRef = useRef(false);
  const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window;

  // Size the GIF/sticker panel directly with plain `style.height` (never CSS custom properties),
  // batched in rAF so opening/closing the Android keyboard triggers 0 descendant style recalcs.
  useLayoutEffect(() => {
    if (!emojiOpen) return;
    let rafId = 0;
    const applyHeight = () => {
      rafId = 0;
      const el = panelRef.current;
      if (!el) return;
      const g = getKeyboardGeometry();
      const usable = Math.max(220, (g.vvHeight || window.innerHeight) - g.inset);
      const h = Math.max(180, Math.min(440, usable * 0.62, usable - 170));
      el.style.height = `${Math.round(h)}px`;
    };
    const schedule = () => {
      if (!rafId) rafId = requestAnimationFrame(applyHeight);
    };
    applyHeight();
    const off = onKeyboardInsetChange(schedule);
    return () => {
      off();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [emojiOpen, tab]);

  const context = editing ? { mode: 'edit' as const, item: editing } : replyTo ? { mode: 'reply' as const, item: replyTo } : null;
  // Keep the banner content while it collapses.
  useEffect(() => {
    if (context) setLastContext(context);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, replyTo]);
  const shown = context ?? lastContext;

  const chars = [...draft].length;
  const trimmed = draft.trim().length;
  const over = chars > MAX_CHARS;
  const canSend = trimmed > 0 && !over && !disabledReason;

  // Auto-grow up to 6 lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, MAX_LINES_PX)}px`;
    el.style.overflowY = el.scrollHeight > MAX_LINES_PX ? 'auto' : 'hidden';
  }, [draft, inputRef]);

  const send = () => {
    if (!canSend) return;
    const keepFocus = keepFocusRef.current || document.activeElement === inputRef.current;
    keepFocusRef.current = false;
    sendRef.current?.querySelector('svg')?.animate(
      [
        { translate: '0 0', rotate: '0deg', opacity: 1 },
        { translate: '18px -18px', rotate: '-20deg', opacity: 0, offset: 0.5 },
        { translate: '-14px 14px', rotate: '0deg', opacity: 0, offset: 0.51 },
        { translate: '0 0', opacity: 1 },
      ],
      { duration: 420, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
    );
    haptic(8);
    onSend();
    if (keepFocus) {
      inputRef.current?.focus({ preventScroll: true });
      window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    }
  };

  const ring = Math.min(1, chars / MAX_CHARS);
  const ringVisible = chars >= RING_FROM;
  const r = 25;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="nsac-chat-composer" data-ime-managed>
      <Expandable open={Boolean(context)}>
        {shown && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              margin: '0 4px 8px',
              padding: '8px 8px 8px 12px',
              borderRadius: isMaterialYou ? 18 : 10,
              backgroundColor: chatTone(tokens, 7),
              borderLeft: `4px solid ${shown.mode === 'edit' ? tokens.tertiary : tokens.primary}`,
            }}
          >
            <span style={{ color: shown.mode === 'edit' ? tokens.tertiary : tokens.primary, display: 'inline-flex' }}>
              {shown.mode === 'edit' ? <Pencil size={16} /> : <CornerUpLeft size={16} />}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: shown.mode === 'edit' ? tokens.tertiary : tokens.primary }}>
                {shown.mode === 'edit' ? 'Editando mensagem' : `Respondendo ${shown.item.is_me ? 'a você' : peerFirstName}`}
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: tokens.onSurfaceVariant,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {describeMessageText(shown.item.text)}
              </div>
            </div>
            <button type="button" aria-label="Cancelar" onClick={onCancelContext} className="nsac-chat-icon-btn" style={{ color: tokens.onSurfaceVariant }}>
              <X size={18} />
            </button>
          </div>
        )}
      </Expandable>

      {(quotaNote || over) && (
        <div
          className="nsac-chat-note"
          style={{
            margin: '0 8px 6px',
            fontSize: '0.72rem',
            fontWeight: 700,
            color: over ? tokens.error : tokens.onSurfaceVariant,
          }}
        >
          {over ? `Passou ${chars - MAX_CHARS} caracteres do limite de ${MAX_CHARS}.` : quotaNote}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}
      >
        <div
          className="nsac-chat-field"
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 2,
            padding: '4px 6px 4px 14px',
            borderRadius: isMaterialYou ? 26 : 14,
            backgroundColor: chatTone(tokens, 7),
            border: `1.5px solid ${over ? tokens.error : 'transparent'}`,
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            disabled={Boolean(disabledReason)}
            placeholder={disabledReason ?? (editing ? 'Edite a mensagem' : 'Mensagem')}
            aria-label="Mensagem"
            enterKeyHint={isTouchDevice ? 'enter' : 'send'}
            onChange={(e) => onDraftChange(e.target.value)}
            onFocus={() => setEmojiOpen(false)}
            onKeyDown={(e) => {
              // Enter sends on hardware keyboards; on phones Enter adds a line without closing the IME.
              if (e.key === 'Enter' && !e.shiftKey && !isTouchDevice) {
                e.preventDefault();
                send();
              }
              if (e.key === 'Escape' && (replyTo || editing)) {
                e.stopPropagation();
                onCancelContext();
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 40,
              padding: '10px 6px 10px 0',
              border: 'none',
              outline: 'none',
              resize: 'none',
              background: 'transparent',
              color: tokens.onSurface,
              fontFamily: 'inherit',
              fontSize: '0.95rem',
              lineHeight: '22px',
              boxSizing: 'border-box',
            }}
          />
          {!editing && !draft.trim() && (
            <button
              type="button"
              aria-label={emojiOpen ? 'Mostrar teclado' : 'GIFs e figurinhas'}
              aria-pressed={emojiOpen}
              className="nsac-chat-icon-btn nsac-chat-gif-btn"
              disabled={Boolean(disabledReason)}
              onClick={() => openPanel(tab)}
              style={{ color: emojiOpen ? tokens.primary : tokens.onSurfaceVariant }}
            >
              <span key={String(emojiOpen)} className="nsac-chat-icon-swap" style={{ display: 'inline-flex' }}>
                {emojiOpen ? (
                  <Keyboard size={21} />
                ) : (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 900,
                      letterSpacing: '0.04em',
                      padding: '2px 5px',
                      border: '2px solid currentColor',
                      borderRadius: 6,
                      lineHeight: 1,
                    }}
                  >
                    GIF
                  </span>
                )}
              </span>
            </button>
          )}
        </div>

        <button
          ref={sendRef}
          type="submit"
          aria-label={editing ? 'Salvar edição' : 'Enviar mensagem'}
          disabled={!canSend}
          onPointerDown={() => {
            keepFocusRef.current = document.activeElement === inputRef.current;
          }}
          onMouseDown={(e) => {
            if (canSend) e.preventDefault();
          }}
          className={`nsac-chat-send${canSend ? ' is-ready' : ''}`}
          style={{
            position: 'relative',
            width: 50,
            height: 50,
            flexShrink: 0,
            border: 'none',
            borderRadius: canSend && isMaterialYou ? 18 : 25,
            backgroundColor: canSend ? tokens.primary : chatTone(tokens, 10),
            color: canSend ? tokens.onPrimary : tokens.onSurfaceVariant,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: canSend ? 'pointer' : 'default',
          }}
        >
          {editing ? <Pencil size={19} /> : <Send size={19} />}
          <svg
            aria-hidden="true"
            viewBox="0 0 56 56"
            width={56}
            height={56}
            style={{
              position: 'absolute',
              inset: -3,
              pointerEvents: 'none',
              opacity: ringVisible ? 1 : 0,
              transition: 'opacity 200ms',
              rotate: '-90deg',
            }}
          >
            <circle cx={28} cy={28} r={r} fill="none" stroke={tokens.outlineVariant} strokeWidth={3} />
            <circle
              cx={28}
              cy={28}
              r={r}
              fill="none"
              stroke={over ? tokens.error : chars > 470 ? tokens.tertiary : tokens.primary}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - ring)}
              style={{ transition: 'stroke-dashoffset 160ms linear, stroke 200ms' }}
            />
          </svg>
          {ringVisible && (
            <span
              style={{
                position: 'absolute',
                top: -20,
                fontSize: '0.64rem',
                fontWeight: 800,
                color: over ? tokens.error : tokens.onSurfaceVariant,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {MAX_CHARS - chars}
            </span>
          )}
        </button>
      </form>

      <Expandable open={emojiOpen}>
        <div
          ref={panelRef}
          className="nsac-chat-emoji-panel"
          style={{
            marginTop: 8,
            height: 380,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: isMaterialYou ? 22 : 12,
            backgroundColor: chatTone(tokens, 5),
            overflow: 'hidden',
            contain: 'layout style paint',
          }}
        >
          <div role="tablist" aria-label="Painel" style={{ display: 'flex', gap: 4, padding: '8px 8px 0' }}>
            {(
              [
                { id: 'gifs', label: 'GIFs', icon: <span style={{ fontSize: '0.62rem', fontWeight: 900 }}>GIF</span> },
                { id: 'stickers', label: 'Figurinhas', icon: <Sticker size={15} /> },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className="nsac-chat-tab"
                style={{
                  backgroundColor: tab === t.id ? tokens.secondaryContainer : 'transparent',
                  color: tab === t.id ? tokens.onSecondaryContainer : tokens.onSurfaceVariant,
                }}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
          <div key={tab} className="nsac-chat-panel-body" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {emojiOpen && (
              <GifExplorer
                kind={tab}
                onPick={(item) => {
                  haptic(10);
                  setEmojiOpen(false);
                  onSendGif(item);
                }}
              />
            )}
          </div>
        </div>
      </Expandable>
    </div>
  );
};
