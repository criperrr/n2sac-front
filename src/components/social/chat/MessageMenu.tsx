import React, { useLayoutEffect, useRef, useState } from 'react';
import { Copy, CornerUpLeft, Info, Pencil, Trash2 } from 'lucide-react';
import { useM3Theme } from '../../../theme/ThemeContext';
import { useBackLayer } from '../../../navigation/backStack';
import { DURATION, EASING, prefersReducedMotion, spring } from '../../../theme/motion';
import { getKeyboardGeometry } from '../../../platform/keyboardInsets';
import { canEdit, formatFullDate, REACTIONS, type ChatItem } from './chatModel';

export interface MenuAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

/**
 * Long-press menu: the pressed bubble is lifted above a scrim, with the reaction bar on one side
 * and the actions on the other (whichever side has room). Reactions pop in with a stagger.
 */
export const MessageMenu: React.FC<{
  item: ChatItem;
  anchor: DOMRect;
  extras: boolean;
  canWrite: boolean;
  bubble: React.ReactNode;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onUnsend: () => void;
}> = ({ item, anchor, extras, canWrite, bubble, onClose, onReact, onReply, onCopy, onEdit, onUnsend }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const [confirmUnsend, setConfirmUnsend] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const close = (after?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    if (!panel || prefersReducedMotion()) {
      onClose();
      after?.();
      return;
    }
    const timing = { duration: DURATION.short4, easing: EASING.emphasizedAccelerate, fill: 'forwards' as const };
    scrim?.animate([{ opacity: 1 }, { opacity: 0 }], timing);
    panel.animate([{ opacity: 1, scale: '1' }, { opacity: 0, scale: '0.92' }], timing).finished.then(() => {
      onClose();
      after?.();
    });
  };

  useBackLayer(true, (source) => (source === 'gesture' ? onClose() : close()), { kind: 'modal', surfaceRef: panelRef, scrimRef });

  const mine = item.is_me;
  const deleted = Boolean(item.deleted);
  const actions: MenuAction[] = [];
  if (extras && canWrite && !deleted) actions.push({ key: 'reply', label: 'Responder', icon: <CornerUpLeft size={18} />, onSelect: () => close(onReply) });
  if (!deleted) actions.push({ key: 'copy', label: item.text.startsWith('giphy:') ? 'Copiar link do GIF' : 'Copiar texto', icon: <Copy size={18} />, onSelect: () => close(onCopy) });
  if (extras && canWrite && canEdit(item)) actions.push({ key: 'edit', label: 'Editar', icon: <Pencil size={18} />, onSelect: () => close(onEdit) });
  actions.push({ key: 'info', label: showInfo ? formatFullDate(item.created_at) : 'Detalhes', icon: <Info size={18} />, onSelect: () => setShowInfo(true) });
  if (extras && mine && !deleted)
    actions.push({
      key: 'unsend',
      label: confirmUnsend ? 'Toque de novo para apagar para todos' : 'Apagar para todos',
      icon: <Trash2 size={18} />,
      danger: true,
      onSelect: () => (confirmUnsend ? close(onUnsend) : setConfirmUnsend(true)),
    });

  const showReactions = extras && canWrite && !deleted;

  // Layout: keep the lifted bubble where it was; put the panel where there's room.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Visible area: the visual viewport minus any keyboard still covering it.
  const kb = getKeyboardGeometry();
  const vvTop = kb.vvTop;
  const vvHeight = kb.vvHeight || vh;
  const usableBottom = vvTop + vvHeight - kb.inset - 12;
  const panelHeight = (showReactions ? 64 : 0) + actions.length * 48 + 16;
  const below = usableBottom - anchor.bottom;
  const placeBelow = below >= panelHeight || below > anchor.top;
  const bubbleTop = placeBelow
    ? Math.max(vvTop + 12, Math.min(anchor.top, usableBottom - panelHeight - anchor.height - 8))
    : Math.min(anchor.top, usableBottom - anchor.height);
  const panelWidth = Math.min(300, vw - 24);
  const panelLeft = mine
    ? Math.max(12, Math.min(anchor.right - panelWidth, vw - panelWidth - 12))
    : Math.max(12, Math.min(anchor.left, vw - panelWidth - 12));

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    const { easing, duration } = spring('fastSpatial');
    scrimRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION.short4, easing: EASING.standard });
    panelRef.current?.animate([{ opacity: 0, scale: '0.85' }, { opacity: 1, scale: '1' }], { duration, easing });
    rootRef.current
      ?.querySelector<HTMLElement>('.nsac-chat-lifted')
      ?.animate([{ translate: `0 ${anchor.top - bubbleTop}px`, scale: '1' }, { translate: '0 0', scale: '1.03' }], {
        duration,
        easing,
        fill: 'forwards',
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={rootRef} style={{ position: 'fixed', inset: 0, zIndex: 30 }} data-ime-managed>
      <div
        ref={scrimRef}
        className="nsac-chat-menu-scrim"
        onClick={() => close()}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: `color-mix(in srgb, ${tokens.background} 62%, transparent)`,
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />
      <div
        className="nsac-chat-lifted"
        style={{
          position: 'absolute',
          top: bubbleTop,
          left: anchor.left,
          width: anchor.width,
          transformOrigin: mine ? 'right center' : 'left center',
          pointerEvents: 'none',
        }}
      >
        {bubble}
      </div>

      <div
        ref={panelRef}
        role="menu"
        aria-label="Ações da mensagem"
        style={{
          position: 'absolute',
          left: panelLeft,
          width: panelWidth,
          ...(placeBelow
            ? { top: bubbleTop + anchor.height + 10 }
            : { bottom: vh - bubbleTop + 10 }),
          display: 'flex',
          flexDirection: placeBelow ? 'column' : 'column-reverse',
          gap: 8,
          transformOrigin: `${mine ? 'right' : 'left'} ${placeBelow ? 'top' : 'bottom'}`,
        }}
      >
        {showReactions && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 8px',
              borderRadius: 999,
              backgroundColor: tokens.surfaceContainerHigh,
              boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
            }}
          >
            {REACTIONS.map((emoji, i) => {
              const active = item.reactions?.some((r) => r.mine && r.emoji === emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  className="nsac-chat-reaction-pick"
                  aria-label={`Reagir com ${emoji}`}
                  onClick={() => close(() => onReact(emoji))}
                  style={{
                    animationDelay: `${i * 22}ms`,
                    width: 32,
                    height: 32,
                    border: 'none',
                    borderRadius: '50%',
                    fontSize: '1.3rem',
                    lineHeight: 1,
                    cursor: 'pointer',
                    backgroundColor: active ? tokens.secondaryContainer : 'transparent',
                  }}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        )}
        <div
          style={{
            padding: '6px 0',
            borderRadius: isMaterialYou ? 20 : 12,
            backgroundColor: tokens.surfaceContainer,
            boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
            overflow: 'hidden',
          }}
        >
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              className="nsac-chat-menu-item"
              onClick={a.onSelect}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                width: '100%',
                minHeight: 48,
                padding: '0 16px',
                border: 'none',
                background: 'transparent',
                color: a.danger ? tokens.error : tokens.onSurface,
                fontSize: '0.9rem',
                fontWeight: a.danger && confirmUnsend ? 800 : 600,
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ display: 'inline-flex', color: a.danger ? tokens.error : tokens.onSurfaceVariant }}>{a.icon}</span>
              <span style={{ flex: 1 }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
