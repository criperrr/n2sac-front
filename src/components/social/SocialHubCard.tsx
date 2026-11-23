import { describeMessageText } from './chat/giphy';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  Check,
  Clock,
  Handshake,
  MessageCircle,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  acceptFollowRequest,
  declineFollowRequest,
  fetchSocialOverview,
  followStudent,
  unblockStudent,
  unfollowStudent,
} from '../../api/nsacClient';
import type { ConversationSummary, SocialOverview, SocialUserSummary } from '../../api/types';
import { useM3Theme } from '../../theme/ThemeContext';
import {
  EnhancedConnectedButtonGroup,
  EnhancedMorphButton,
  ExpressiveSegmentedCard,
} from '../expressive/ExpressivePrimitives';
import { MorphingShapeIndicator } from '../expressive/ShapeMorph';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { useProfileViewer } from '../profile/ProfileViewer';

type SocialTab = 'conversations' | 'friends' | 'requests' | 'followers' | 'following' | 'blocked';

export const SocialHubCard: React.FC<{ token: string }> = ({ token }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const { openChat, celebrateFriendship, bumpSocialRevision, showNotice, socialRevision } =
    useProfileViewer();
  const [overview, setOverview] = useState<SocialOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<SocialTab>('conversations');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchSocialOverview(token);
      setOverview(data);
    } catch {
      // keep previous overview if offline
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load, socialRevision]);

  const handleAccept = async (u: SocialUserSummary) => {
    setBusyId(u.account_id);
    try {
      const res = await acceptFollowRequest(token, u.account_id);
      bumpSocialRevision();
      await load();
      if (res.became_friends) {
        celebrateFriendship({
          accountId: res.peer_account_id,
          label: res.peer_label,
          avatarUrl: res.peer_avatar_url,
          classCode: res.peer_class_code,
        });
      } else {
        showNotice(`Pedido de ${u.display_label.split(' ')[0]} aceito`);
      }
    } catch {
      showNotice('Não foi possível aceitar agora');
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async (u: SocialUserSummary) => {
    setBusyId(u.account_id);
    try {
      await declineFollowRequest(token, u.account_id);
      bumpSocialRevision();
      await load();
      showNotice('Pedido recusado');
    } catch {
      showNotice('Não foi possível recusar agora');
    } finally {
      setBusyId(null);
    }
  };

  const handleFollowBack = async (u: SocialUserSummary) => {
    setBusyId(u.account_id);
    try {
      const res = await followStudent(token, u.account_id);
      bumpSocialRevision();
      await load();
      if (res.became_friends) {
        celebrateFriendship({
          accountId: res.peer_account_id,
          label: res.peer_label,
          avatarUrl: res.peer_avatar_url,
          classCode: res.peer_class_code,
        });
      } else if (res.status === 'pending') {
        showNotice('Solicitação enviada');
      } else {
        showNotice(`Seguindo ${u.display_label.split(' ')[0]}`);
      }
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Não foi possível seguir');
    } finally {
      setBusyId(null);
    }
  };

  const handleUnfollow = async (u: SocialUserSummary) => {
    setBusyId(u.account_id);
    try {
      await unfollowStudent(token, u.account_id);
      bumpSocialRevision();
      await load();
      showNotice('Você deixou de seguir');
    } catch {
      showNotice('Não foi possível deixar de seguir');
    } finally {
      setBusyId(null);
    }
  };

  const handleUnblock = async (u: SocialUserSummary) => {
    setBusyId(u.account_id);
    try {
      await unblockStudent(token, u.account_id);
      bumpSocialRevision();
      await load();
      showNotice(`${u.display_label.split(' ')[0]} desbloqueado`);
    } catch {
      showNotice('Não foi possível desbloquear');
    } finally {
      setBusyId(null);
    }
  };

  const renderUserRow = (u: SocialUserSummary, actions: React.ReactNode) => (
    <div
      key={u.account_id}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '10px 12px',
        borderRadius: isMaterialYou ? 18 : 12,
        backgroundColor: tokens.surfaceContainer,
        border: `1px solid ${tokens.outlineVariant}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        <ProfileAvatar
          name={u.display_label}
          image={u.avatar_url}
          size={40}
          profile={{
            accountId: u.account_id,
            label: u.display_label,
            avatarUrl: u.avatar_url,
            classCode: u.class_code,
            canOpen: u.has_public_profile,
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: '0.9rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {u.display_label}
          </div>
          <div style={{ fontSize: '0.73rem', color: tokens.onSurfaceVariant }}>
            {u.class_code}
            {u.is_friend ? ' • Amigos' : ''}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>{actions}</div>
    </div>
  );

  const renderConversationRow = (c: ConversationSummary) => (
    <button
      key={c.peer.account_id}
      type="button"
      onClick={() =>
        openChat({
          accountId: c.peer.account_id,
          label: c.peer.display_label,
          avatarUrl: c.peer.avatar_url,
          classCode: c.peer.class_code,
        })
      }
      style={{
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '10px 12px',
        borderRadius: isMaterialYou ? 18 : 12,
        backgroundColor: c.unread_count > 0 ? tokens.primaryContainer + '33' : tokens.surfaceContainer,
        border: `1px solid ${c.unread_count > 0 ? tokens.primary : tokens.outlineVariant}`,
        color: tokens.onSurface,
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        <ProfileAvatar name={c.peer.display_label} image={c.peer.avatar_url} size={42} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: '0.9rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {c.peer.display_label}
            </span>
            {!c.is_friend && (
              <span
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 999,
                  backgroundColor: tokens.surfaceContainerHighest,
                  color: tokens.onSurfaceVariant,
                }}
              >
                Somente leitura
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: '0.76rem',
              color: tokens.onSurfaceVariant,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: 2,
            }}
          >
            {c.last_message_preview ? describeMessageText(c.last_message_preview) : 'Toque para iniciar a conversa'}
          </div>
        </div>
      </div>

      {c.unread_count > 0 ? (
        <span
          style={{
            minWidth: 22,
            height: 22,
            padding: '0 6px',
            borderRadius: 999,
            backgroundColor: tokens.primary,
            color: tokens.onPrimary,
            fontSize: '0.72rem',
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {c.unread_count}
        </span>
      ) : (
        <MessageCircle size={16} color={tokens.onSurfaceVariant} style={{ flexShrink: 0 }} />
      )}
    </button>
  );

  const emptyState = (text: string) => (
    <div
      style={{
        padding: '18px 14px',
        textAlign: 'center',
        borderRadius: isMaterialYou ? 18 : 12,
        backgroundColor: tokens.surfaceContainer,
        color: tokens.onSurfaceVariant,
        fontSize: '0.82rem',
      }}
    >
      {text}
    </div>
  );

  return (
    <ExpressiveSegmentedCard index={0} total={1} style={{ padding: '18px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={18} color={tokens.primary} />
          <span style={{ fontWeight: 800, fontSize: '1rem' }}>Amigos & Conversas</span>
        </div>
        {overview && (
          <div style={{ fontSize: '0.76rem', color: tokens.onSurfaceVariant, fontWeight: 600 }}>
            {overview.friends_count} {overview.friends_count === 1 ? 'amigo' : 'amigos'} •{' '}
            {overview.followers_count} {overview.followers_count === 1 ? 'seguidor' : 'seguidores'}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <EnhancedConnectedButtonGroup<SocialTab>
          wrap
          value={tab}
          onChange={setTab}
          options={[
            {
              value: 'conversations',
              label:
                overview && overview.unread_messages_count > 0
                  ? `Conversas (${overview.unread_messages_count})`
                  : 'Conversas',
              icon: <MessageCircle size={13} />,
            },
            {
              value: 'friends',
              label: overview ? `Amigos (${overview.friends_count})` : 'Amigos',
              icon: <Handshake size={13} />,
            },
            {
              value: 'requests',
              label:
                overview && overview.pending_requests_count > 0
                  ? `Pedidos (${overview.pending_requests_count})`
                  : 'Pedidos',
              icon: <Clock size={13} />,
            },
            {
              value: 'followers',
              label: overview ? `Seguidores (${overview.followers_count})` : 'Seguidores',
            },
            {
              value: 'following',
              label: overview ? `Seguindo (${overview.following_count})` : 'Seguindo',
            },
            ...(overview && overview.blocked.length > 0
              ? [{ value: 'blocked' as const, label: `Bloqueados (${overview.blocked.length})`, icon: <Ban size={13} /> }]
              : []),
          ]}
        />
      </div>

      {loading && !overview ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
          <MorphingShapeIndicator size={24} label="Carregando conexões" />
        </div>
      ) : !overview ? (
        emptyState('Não foi possível carregar suas conexões agora.')
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tab === 'conversations' &&
            (overview.conversations.length > 0
              ? overview.conversations.map(renderConversationRow)
              : emptyState('Nenhuma conversa ainda. Siga um colega e, quando ele seguir de volta, o chat aparece aqui.'))}

          {tab === 'friends' &&
            (overview.friends.length > 0
              ? overview.friends.map((u) =>
                  renderUserRow(
                    u,
                    <EnhancedMorphButton
                      size="sm"
                      variant="filled"
                      icon={<MessageCircle size={13} />}
                      onClick={() =>
                        openChat({
                          accountId: u.account_id,
                          label: u.display_label,
                          avatarUrl: u.avatar_url,
                          classCode: u.class_code,
                        })
                      }
                    >
                      Mensagem
                    </EnhancedMorphButton>
                  )
                )
              : emptyState('Você ainda não tem amigos mútuos. Use a busca na aba Ranking para seguir colegas.'))}

          {tab === 'requests' && (
            <>
              {overview.incoming_requests.length === 0 && overview.outgoing_requests.length === 0 &&
                emptyState('Nenhuma solicitação pendente.')}
              {overview.incoming_requests.map((u) =>
                renderUserRow(
                  u,
                  <>
                    <EnhancedMorphButton
                      size="sm"
                      variant="filled"
                      disabled={busyId === u.account_id}
                      icon={<Check size={13} />}
                      onClick={() => void handleAccept(u)}
                    >
                      Aceitar
                    </EnhancedMorphButton>
                    <EnhancedMorphButton
                      size="sm"
                      variant="outlined"
                      disabled={busyId === u.account_id}
                      icon={<X size={13} />}
                      onClick={() => void handleDecline(u)}
                    >
                      Recusar
                    </EnhancedMorphButton>
                  </>
                )
              )}
              {overview.outgoing_requests.map((u) =>
                renderUserRow(
                  u,
                  <EnhancedMorphButton
                    size="sm"
                    variant="tonal"
                    disabled={busyId === u.account_id}
                    icon={<Clock size={13} />}
                    onClick={() => void handleUnfollow(u)}
                  >
                    Cancelar
                  </EnhancedMorphButton>
                )
              )}
            </>
          )}

          {tab === 'followers' &&
            (overview.followers.length > 0
              ? overview.followers.map((u) =>
                  renderUserRow(
                    u,
                    u.is_friend ? (
                      <EnhancedMorphButton
                        size="sm"
                        variant="tonal"
                        icon={<MessageCircle size={13} />}
                        onClick={() =>
                          openChat({
                            accountId: u.account_id,
                            label: u.display_label,
                            avatarUrl: u.avatar_url,
                            classCode: u.class_code,
                          })
                        }
                      >
                        Chat
                      </EnhancedMorphButton>
                    ) : u.outgoing === 'pending' ? (
                      <EnhancedMorphButton
                        size="sm"
                        variant="tonal"
                        disabled={busyId === u.account_id}
                        icon={<Clock size={13} />}
                        onClick={() => void handleUnfollow(u)}
                      >
                        Solicitado
                      </EnhancedMorphButton>
                    ) : (
                      <EnhancedMorphButton
                        size="sm"
                        variant="filled"
                        disabled={busyId === u.account_id}
                        icon={<UserPlus size={13} />}
                        onClick={() => void handleFollowBack(u)}
                      >
                        Seguir de volta
                      </EnhancedMorphButton>
                    )
                  )
                )
              : emptyState('Nenhum seguidor ainda.'))}

          {tab === 'following' &&
            (overview.following.length > 0
              ? overview.following.map((u) =>
                  renderUserRow(
                    u,
                    <EnhancedMorphButton
                      size="sm"
                      variant="tonal"
                      disabled={busyId === u.account_id}
                      icon={<UserCheck size={13} />}
                      onClick={() => void handleUnfollow(u)}
                    >
                      Seguindo
                    </EnhancedMorphButton>
                  )
                )
              : emptyState('Você ainda não segue ninguém.'))}

          {tab === 'blocked' &&
            overview.blocked.map((u) =>
              renderUserRow(
                u,
                <EnhancedMorphButton
                  size="sm"
                  variant="outlined"
                  disabled={busyId === u.account_id}
                  onClick={() => void handleUnblock(u)}
                >
                  Desbloquear
                </EnhancedMorphButton>
              )
            )}
        </div>
      )}
    </ExpressiveSegmentedCard>
  );
};
