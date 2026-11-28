import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Check,
  Clock,
  Crown,
  Handshake,
  Lock,
  MessageCircle,
  Swords,
  Trophy,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  X,
  Flag,
} from 'lucide-react';
import { consumePendingSocialPushOpen, type SocialPushEventDetail } from '../../notifications/pushService';
import {
  acceptFollowRequest,
  blockStudent,
  declineFollowRequest,
  fetchPublicProfile,
  followStudent,
  loadCachedUserProfile,
  NsacApiClientError,
  unblockStudent,
  unfollowStudent,
} from '../../api/nsacClient';
import type { PublicProfile, RelationshipStatus } from '../../api/types';
import { useM3Theme } from '../../theme/ThemeContext';
import { ExpressiveModal, MetricTile, ModalIconButton } from '../expressive/ExpressiveModal';
import { EnhancedMorphButton, RevealNumber } from '../expressive/ExpressivePrimitives';
import { MorphingShapeIndicator } from '../expressive/ShapeMorph';
import { ShimmerVeil } from '../expressive/ShimmerVeil';
import { ChatScreen, type ChatPeerTarget } from '../social/chat/ChatScreen';
import {
  FriendshipCelebrationModal,
  type FriendshipCelebrationTarget,
} from '../social/FriendshipCelebration';
import { ProfileAvatar, useProfileImage } from './ProfileAvatar';
import { ProfileConnectionsStrip } from './ProfileConnectionsStrip';
import { ReportSheet } from './ReportSheet';

/** What the opener already knows, shown instantly while the full profile loads. */
export interface ProfilePreview {
  accountId: number;
  label: string;
  avatarUrl?: string | null;
  classCode?: string | null;
  rank?: number | null;
  average?: number | null;
  /** Offers "Comparar" in the profile and runs it (after the sheet closes). */
  onCompare?: () => void;
}

interface ProfileViewerValue {
  token: string | null;
  socialRevision: number;
  bumpSocialRevision: () => void;
  openProfile: (preview: ProfilePreview, originEl?: HTMLElement | null) => void;
  openChat: (peer: ChatPeerTarget) => void;
  celebrateFriendship: (friend: FriendshipCelebrationTarget) => void;
  showNotice: (text: string) => void;
}

const ProfileViewerContext = createContext<ProfileViewerValue>({
  token: null,
  socialRevision: 0,
  bumpSocialRevision: () => {},
  openProfile: () => {},
  openChat: () => {},
  celebrateFriendship: () => {},
  showNotice: () => {},
});

export const useProfileViewer = (): ProfileViewerValue => useContext(ProfileViewerContext);

/**
 * App-wide profile, chat and friendship celebration provider: any `ProfileAvatar`, search row, or
 * social list can open a classmate's profile, launch a friend chat, or trigger the M3 friendship
 * celebration.
 */
export const ProfileViewerProvider: React.FC<{
  token: string | null;
  accountId?: number | null;
  children: React.ReactNode;
}> = ({ token, accountId = null, children }) => {
  const [open, setOpen] = useState<{ preview: ProfilePreview; origin: HTMLElement | null } | null>(null);
  const [chatPeer, setChatPeer] = useState<ChatPeerTarget | null>(null);
  const [celebration, setCelebration] = useState<FriendshipCelebrationTarget | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [socialRevision, setSocialRevision] = useState(0);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const bumpSocialRevision = useCallback(() => setSocialRevision((n) => n + 1), []);
  const showNotice = useCallback((text: string) => setToast({ id: Date.now(), text }), []);
  const openProfile = useCallback(
    (preview: ProfilePreview, originEl: HTMLElement | null = null) => setOpen({ preview, origin: originEl }),
    []
  );
  const openChat = useCallback((peer: ChatPeerTarget) => setChatPeer(peer), []);
  const celebrateFriendship = useCallback((friend: FriendshipCelebrationTarget) => {
    setCelebration(friend);
  }, []);

  // React to live social push notifications (new message, new follower, friendship) and notification taps.
  useEffect(() => {
    if (!token) return;
    const onPush = (ev: Event) => {
      const detail = (ev as CustomEvent<SocialPushEventDetail>).detail;
      if (!detail) return;
      bumpSocialRevision();
      const sameChatOpen = detail.kind === 'chat_message' && detail.actorId !== null && chatPeer?.accountId === detail.actorId;
      if (!sameChatOpen) {
        const msg = detail.body ? `${detail.title}: ${detail.body}` : detail.title;
        showNotice(msg);
      }
    };
    const handleSocialPushOpen = (detail: SocialPushEventDetail) => {
      if (!detail || !detail.actorId) return;
      bumpSocialRevision();
      if (detail.kind === 'chat_message') {
        openChat({
          accountId: detail.actorId,
          label: detail.actorLabel,
          avatarUrl: null,
          classCode: '',
        });
      } else {
        openProfile({
          accountId: detail.actorId,
          label: detail.actorLabel,
        });
      }
    };
    const onPushOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<SocialPushEventDetail>).detail;
      if (detail) handleSocialPushOpen(detail);
    };
    const pendingSocial = consumePendingSocialPushOpen();
    if (pendingSocial) {
      handleSocialPushOpen(pendingSocial);
    }
    const onManualSocialRefresh = () => {
      bumpSocialRevision();
    };
    window.addEventListener('n2sac:social-push', onPush);
    window.addEventListener('n2sac:social-push-open', onPushOpen);
    window.addEventListener('n2sac:social-refresh', onManualSocialRefresh);
    return () => {
      window.removeEventListener('n2sac:social-push', onPush);
      window.removeEventListener('n2sac:social-push-open', onPushOpen);
      window.removeEventListener('n2sac:social-refresh', onManualSocialRefresh);
    };
  }, [token, chatPeer?.accountId, bumpSocialRevision, showNotice, openChat, openProfile]);

  const value = useMemo(
    () => ({
      token,
      socialRevision,
      bumpSocialRevision,
      openProfile,
      openChat,
      celebrateFriendship,
      showNotice,
    }),
    [token, socialRevision, bumpSocialRevision, openProfile, openChat, celebrateFriendship, showNotice]
  );

  const cachedMe = accountId ? loadCachedUserProfile(accountId) : null;
  const meLabel = cachedMe?.display_name || cachedMe?.first_name || 'Você';
  const meAvatarUrl = cachedMe?.avatar_data_url ?? null;

  return (
    <ProfileViewerContext.Provider value={value}>
      {children}
      {open && token && (
        <ExpressiveModal
          ariaLabel={`Perfil de ${open.preview.label}`}
          onClose={() => setOpen(null)}
          originEl={open.origin}
          maxWidth={460}
          // Above the full-screen chat, which opens profiles from its header.
          zIndex={10120}
        >
          {(close) => {
            const closeAnd = (after?: () => void) =>
              close(() => {
                setOpen(null);
                after?.();
              });
            return (
              <ProfileSheet
                token={token}
                preview={open.preview}
                close={closeAnd}
                onPrivate={() => closeAnd(() => showNotice('Perfil privado'))}
              />
            );
          }}
        </ExpressiveModal>
      )}
      {chatPeer && token && (
        <ChatScreen
          token={token}
          peer={chatPeer}
          onClose={() => {
            setChatPeer(null);
            bumpSocialRevision();
          }}
          onDeleted={bumpSocialRevision}
        />
      )}
      {celebration && (
        <FriendshipCelebrationModal
          meLabel={meLabel}
          meAvatarUrl={meAvatarUrl}
          friend={celebration}
          onClose={() => setCelebration(null)}
          onMessage={(friend) => setChatPeer(friend)}
        />
      )}
      {toast && <Snackbar key={toast.id} text={toast.text} />}
    </ProfileViewerContext.Provider>
  );
};

/** M3 snackbar (inverse surface pill) at the bottom of the screen. */
const Snackbar: React.FC<{ text: string }> = ({ text }) => {
  const { tokens } = useM3Theme();
  return (
    <div
      role="status"
      className="n2sac-snackbar"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
        zIndex: 10150,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 18px',
        borderRadius: 999,
        backgroundColor: tokens.onSurface,
        color: tokens.background,
        fontSize: '0.86rem',
        fontWeight: 600,
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <Lock size={15} />
      {text}
    </div>
  );
};

const BANNER_HEIGHT = 132;

const ProfileSheet: React.FC<{
  token: string;
  preview: ProfilePreview;
  close: (next?: () => void) => void;
  onPrivate: () => void;
}> = ({ token, preview, close, onPrivate }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const { openChat, celebrateFriendship, bumpSocialRevision, showNotice } = useProfileViewer();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'private' | 'error'>('loading');
  const [socialBusy, setSocialBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    setState('loading');
    try {
      const p = await fetchPublicProfile(token, preview.accountId);
      setProfile(p);
      setState('ready');
    } catch (err: unknown) {
      setState(err instanceof NsacApiClientError && err.status === 404 ? 'private' : 'error');
    }
  }, [token, preview.accountId]);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchPublicProfile(token, preview.accountId)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(err instanceof NsacApiClientError && err.status === 404 ? 'private' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [token, preview.accountId]);

  const onPrivateRef = React.useRef(onPrivate);
  onPrivateRef.current = onPrivate;
  useEffect(() => {
    if (state === 'private') onPrivateRef.current();
  }, [state]);

  const banner = useProfileImage(profile?.banner_url ?? null);
  const [bannerLoaded, setBannerLoaded] = useState<string | null>(null);
  const bannerPending =
    state === 'loading' ||
    (Boolean(profile?.banner_url) && (banner === undefined || (banner !== null && bannerLoaded !== banner)));
  const label = profile?.display_label ?? preview.label;
  const avatar = profile?.avatar_url ?? preview.avatarUrl ?? null;
  const classCode = profile?.class_code ?? preview.classCode ?? null;
  const isMe = profile?.is_me ?? false;
  const rel: RelationshipStatus | null = profile?.relationship ?? null;

  const applyRelationship = (nextRel: RelationshipStatus, followersDelta = 0) => {
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            relationship: nextRel,
            followers_count: Math.max(0, (prev.followers_count ?? 0) + followersDelta),
          }
        : prev
    );
    bumpSocialRevision();
  };

  const handleFollowAction = async () => {
    if (!rel || socialBusy) return;
    setSocialBusy(true);
    try {
      if (rel.outgoing === 'accepted' || rel.outgoing === 'pending') {
        const wasAccepted = rel.outgoing === 'accepted';
        const updated = await unfollowStudent(token, preview.accountId);
        applyRelationship(updated, wasAccepted ? -1 : 0);
        showNotice(wasAccepted ? 'Você deixou de seguir' : 'Solicitação cancelada');
      } else {
        const res = await followStudent(token, preview.accountId);
        applyRelationship(res.relationship, res.status === 'accepted' ? 1 : 0);
        if (res.became_friends) {
          celebrateFriendship({
            accountId: res.peer_account_id,
            label: res.peer_label,
            avatarUrl: res.peer_avatar_url,
            classCode: res.peer_class_code,
          });
        } else if (res.status === 'pending') {
          showNotice('Solicitação enviada — aguardando aprovação');
        } else {
          showNotice(`Você está seguindo ${label.split(' ')[0]}`);
        }
      }
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Não foi possível concluir a ação');
    } finally {
      setSocialBusy(false);
    }
  };

  const handleAcceptIncoming = async () => {
    if (socialBusy) return;
    setSocialBusy(true);
    try {
      const res = await acceptFollowRequest(token, preview.accountId);
      applyRelationship(res.relationship);
      if (res.became_friends) {
        celebrateFriendship({
          accountId: res.peer_account_id,
          label: res.peer_label,
          avatarUrl: res.peer_avatar_url,
          classCode: res.peer_class_code,
        });
      } else {
        showNotice('Pedido aceito');
      }
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Não foi possível aceitar agora');
    } finally {
      setSocialBusy(false);
    }
  };

  const handleDeclineIncoming = async () => {
    if (socialBusy) return;
    setSocialBusy(true);
    try {
      const updated = await declineFollowRequest(token, preview.accountId);
      applyRelationship(updated);
      showNotice('Pedido recusado');
    } catch {
      showNotice('Não foi possível recusar agora');
    } finally {
      setSocialBusy(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!rel || socialBusy) return;
    if (!rel.blocked_by_me && !confirmBlock) {
      setConfirmBlock(true);
      return;
    }
    setSocialBusy(true);
    try {
      if (rel.blocked_by_me) {
        await unblockStudent(token, preview.accountId);
        setConfirmBlock(false);
        bumpSocialRevision();
        showNotice('Aluno desbloqueado');
        await loadProfile();
      } else {
        await blockStudent(token, preview.accountId);
        setConfirmBlock(false);
        bumpSocialRevision();
        close(() => showNotice(`${label.split(' ')[0]} foi bloqueado`));
      }
    } catch {
      showNotice('Não foi possível atualizar o bloqueio');
    } finally {
      setSocialBusy(false);
    }
  };

  return (
    <div style={{ margin: '-4px -4px 0' }}>
      {/* Banner with the avatar overlapping its bottom edge */}
      <div
        style={{
          position: 'relative',
          height: BANNER_HEIGHT,
          flexShrink: 0,
          borderRadius: isMaterialYou ? 24 : 12,
          background: `linear-gradient(135deg, ${tokens.primaryContainer}, ${tokens.tertiaryContainer})`,
        }}
      >
        {/* Clipped layer: image + loading veil (the avatar below overflows the banner on purpose). */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden' }}>
          {banner && (
            <img
              src={banner}
              alt=""
              draggable={false}
              onLoad={() => setBannerLoaded(banner)}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: bannerLoaded === banner ? 1 : 0,
                transform: bannerLoaded === banner ? 'scale(1)' : 'scale(1.06)',
                transition:
                  'opacity 700ms cubic-bezier(0.2, 0, 0, 1), transform 1100ms cubic-bezier(0.05, 0.7, 0.1, 1)',
              }}
            />
          )}
          <ShimmerVeil active={bannerPending} />
        </div>
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, display: 'flex', gap: 6 }}>
          {!isMe && state === 'ready' && (
            <ModalIconButton label="Denunciar perfil" onClick={() => setReportOpen(true)}>
              <Flag size={16} />
            </ModalIconButton>
          )}
          {reportOpen && (
            <ReportSheet
              token={token}
              accountId={preview.accountId}
              label={label}
              onClose={() => setReportOpen(false)}
              onDone={(message) => {
                setReportOpen(false);
                showNotice(message);
              }}
            />
          )}
          {!isMe && state === 'ready' && rel && (
            <ModalIconButton
              label={rel.blocked_by_me ? 'Desbloquear aluno' : confirmBlock ? 'Confirmar bloqueio' : 'Bloquear aluno'}
              onClick={() => void handleToggleBlock()}
            >
              <Ban size={16} color={confirmBlock || rel.blocked_by_me ? tokens.error : undefined} />
            </ModalIconButton>
          )}
          <ModalIconButton label="Fechar" onClick={() => close()}>
            <X size={17} />
          </ModalIconButton>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 20,
            bottom: -40,
            zIndex: 2,
            padding: 4,
            borderRadius: isMaterialYou ? '50%' : 28,
            backgroundColor: tokens.surfaceContainerLow,
          }}
        >
          <ProfileAvatar name={label} image={avatar} size={84} rank={preview.rank ?? null} />
        </div>
      </div>

      <div style={{ padding: '50px 4px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.01em' }}>{label}</h2>
          {classCode && (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: '0.72rem',
                fontWeight: 700,
                backgroundColor: tokens.surfaceContainerHighest,
                color: tokens.onSurfaceVariant,
              }}
            >
              {classCode}
            </span>
          )}
          {isMe && (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: '0.72rem',
                fontWeight: 700,
                backgroundColor: tokens.primaryContainer,
                color: tokens.onPrimaryContainer,
              }}
            >
              Você
            </span>
          )}
          {!isMe && rel?.is_friend && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 9px',
                borderRadius: 999,
                fontSize: '0.72rem',
                fontWeight: 800,
                backgroundColor: tokens.gradeSuccessContainer,
                color: tokens.onGradeSuccessContainer,
              }}
            >
              <Handshake size={12} />
              Amigos
            </span>
          )}
        </div>

        {state === 'ready' && profile?.official_name && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              marginTop: 4,
              fontSize: '0.82rem',
              fontWeight: 600,
              color: tokens.onSurfaceVariant,
            }}
          >
            <UserRound size={13} style={{ flexShrink: 0, opacity: 0.85 }} />
            <span>{profile.official_name}</span>
          </div>
        )}

        {state === 'ready' && profile && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: isMaterialYou ? 999 : 10,
                backgroundColor: tokens.surfaceContainerHigh,
                border: `1px solid ${tokens.outlineVariant}`,
                fontSize: '0.8rem',
                color: tokens.onSurfaceVariant,
              }}
            >
              <Users size={13} color={tokens.primary} />
              <strong style={{ color: tokens.onSurface, fontWeight: 800 }}>
                {profile.followers_count ?? 0}
              </strong>
              {(profile.followers_count ?? 0) === 1 ? 'seguidor' : 'seguidores'}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: isMaterialYou ? 999 : 10,
                backgroundColor: tokens.surfaceContainerHigh,
                border: `1px solid ${tokens.outlineVariant}`,
                fontSize: '0.8rem',
                color: tokens.onSurfaceVariant,
              }}
            >
              <UserCheck size={13} color={tokens.tertiary} />
              <strong style={{ color: tokens.onSurface, fontWeight: 800 }}>
                {profile.following_count ?? 0}
              </strong>
              seguindo
            </span>
          </div>
        )}

        {confirmBlock && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: isMaterialYou ? 16 : 10,
              backgroundColor: tokens.errorContainer,
              color: tokens.onErrorContainer,
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span>Toque no ícone de bloqueio no topo para confirmar (desfaz amizade e impede mensagens).</span>
            <button
              type="button"
              onClick={() => setConfirmBlock(false)}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                fontWeight: 800,
                cursor: 'pointer',
                fontSize: '0.76rem',
                flexShrink: 0,
              }}
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Incoming pending follow request banner */}
        {!isMe && state === 'ready' && rel?.incoming === 'pending' && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: isMaterialYou ? 18 : 10,
              backgroundColor: tokens.secondaryContainer,
              color: tokens.onSecondaryContainer,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Pediu para seguir você</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <EnhancedMorphButton
                size="sm"
                variant="filled"
                disabled={socialBusy}
                icon={<Check size={13} />}
                onClick={() => void handleAcceptIncoming()}
              >
                Aceitar
              </EnhancedMorphButton>
              <EnhancedMorphButton
                size="sm"
                variant="outlined"
                disabled={socialBusy}
                icon={<X size={13} />}
                onClick={() => void handleDeclineIncoming()}
              >
                Recusar
              </EnhancedMorphButton>
            </div>
          </div>
        )}

        {/* Bio skeleton: same footprint as the bio, so the sheet keeps its size while loading. */}
        {state === 'loading' && (
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }} aria-label="Carregando perfil">
            {[92, 64].map((w) => (
              <div
                key={w}
                style={{
                  position: 'relative',
                  height: 12,
                  width: `${w}%`,
                  borderRadius: 999,
                  backgroundColor: tokens.surfaceContainerHighest,
                  overflow: 'hidden',
                }}
              >
                <ShimmerVeil active compact radius={999} />
              </div>
            ))}
          </div>
        )}

        {state === 'ready' && (
          <p style={{ margin: '10px 0 0', fontSize: '0.9rem', lineHeight: 1.5, color: profile?.bio ? tokens.onSurface : tokens.onSurfaceVariant }}>
            {profile?.bio ?? 'Sem bio ainda.'}
          </p>
        )}

        {state === 'ready' && profile?.connections && profile.connections.length > 0 && (
          <ProfileConnectionsStrip connections={profile.connections} />
        )}

        {state === 'error' && (
          <div
            style={{
              marginTop: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              borderRadius: isMaterialYou ? 18 : 10,
              backgroundColor: tokens.surfaceContainer,
              color: tokens.onSurfaceVariant,
              fontSize: '0.84rem',
            }}
          >
            <UserRound size={17} />
            Não foi possível carregar o perfil agora.
          </div>
        )}

        {(preview.rank != null || preview.average != null) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 16 }}>
            {preview.rank != null && (
              <MetricTile
                label={<><Trophy size={13} /><span>Posição</span></>}
                value={
                  preview.rank === 1 ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      1º <Crown size={20} strokeWidth={2.4} />
                    </span>
                  ) : (
                    `${preview.rank}º`
                  )
                }
                caption="no ranking atual"
                background={preview.rank === 1 ? tokens.gradeWarningContainer : tokens.surfaceContainerHigh}
                color={preview.rank === 1 ? tokens.onGradeWarningContainer : tokens.onSurface}
              />
            )}
            {preview.average != null && (
              <MetricTile
                label="Média"
                value={<RevealNumber value={preview.average} decimals={2} />}
                caption="no período filtrado"
                background={tokens.primaryContainer}
                color={tokens.onPrimaryContainer}
              />
            )}
          </div>
        )}

        {/* Primary social actions */}
        {!isMe && state === 'ready' && rel && !rel.blocked_by_me && !rel.blocked_me && (
          <div style={{ display: 'grid', gridTemplateColumns: rel.is_friend ? '1fr 1fr' : '1fr', gap: 8, marginTop: 16 }}>
            <EnhancedMorphButton
              fullWidth
              variant={rel.outgoing === 'none' ? 'filled' : 'tonal'}
              disabled={socialBusy}
              icon={
                socialBusy ? (
                  <MorphingShapeIndicator size={15} label="Atualizando" />
                ) : rel.outgoing === 'accepted' ? (
                  <UserCheck size={15} />
                ) : rel.outgoing === 'pending' ? (
                  <Clock size={15} />
                ) : (
                  <UserPlus size={15} />
                )
              }
              onClick={() => void handleFollowAction()}
            >
              {rel.outgoing === 'accepted'
                ? 'Seguindo'
                : rel.outgoing === 'pending'
                  ? 'Solicitado'
                  : rel.incoming === 'accepted'
                    ? 'Seguir de volta'
                    : 'Seguir'}
            </EnhancedMorphButton>

            {rel.is_friend && (
              <EnhancedMorphButton
                fullWidth
                variant="filled"
                icon={<MessageCircle size={15} />}
                onClick={() =>
                  close(() =>
                    openChat({
                      accountId: preview.accountId,
                      label,
                      avatarUrl: avatar,
                      classCode: classCode ?? 'CTI',
                    })
                  )
                }
              >
                Mensagem
              </EnhancedMorphButton>
            )}
          </div>
        )}

        {preview.onCompare && !isMe && (
          <div style={{ marginTop: 10 }}>
            <EnhancedMorphButton
              fullWidth
              variant="outlined"
              icon={<Swords size={15} />}
              onClick={() => close(preview.onCompare)}
            >
              Comparar comigo
            </EnhancedMorphButton>
          </div>
        )}
      </div>
    </div>
  );
};
