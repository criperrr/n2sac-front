import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Clock,
  Handshake,
  Lock,
  MessageCircle,
  Search,
  UserCheck,
  UserPlus,
  UserSearch,
  X,
} from 'lucide-react';
import {
  acceptFollowRequest,
  followStudent,
  searchStudents,
  unfollowStudent,
} from '../../api/nsacClient';
import type { RelationshipStatus, StudentSearchResult } from '../../api/types';
import { useM3Theme } from '../../theme/ThemeContext';
import { EnhancedMorphButton, ExpressiveSegmentedCard } from '../expressive/ExpressivePrimitives';
import { MorphingShapeIndicator } from '../expressive/ShapeMorph';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { useProfileViewer } from '../profile/ProfileViewer';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 300;

/**
 * Find students by name (display name or real email-derived name) or exact e-mail.
 * Supports following / requesting to follow directly from results, even for discoverable
 * students outside the ranking whose profile is private.
 */
export const StudentSearch: React.FC<{ token: string }> = ({ token }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const { openProfile, openChat, celebrateFriendship, bumpSocialRevision, showNotice, socialRevision } =
    useProfileViewer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StudentSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();
  useEffect(() => {
    if (trimmed.length < MIN_QUERY) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchStudents(token, trimmed, controller.signal)
        .then((r) => {
          setResults(r);
          setError(null);
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          setError(e instanceof Error ? e.message : 'Não foi possível buscar agora.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [token, trimmed, socialRevision]);

  const patchResultRel = (accountId: number, rel: RelationshipStatus, followersDelta = 0) => {
    setResults((prev) =>
      prev
        ? prev.map((item) =>
            item.account_id === accountId
              ? {
                  ...item,
                  relationship: rel,
                  has_public_profile: item.has_public_profile || rel.is_friend,
                  followers_count:
                    item.followers_count !== undefined
                      ? Math.max(0, item.followers_count + followersDelta)
                      : item.followers_count,
                }
              : item
          )
        : prev
    );
  };

  const handleFollowToggle = async (r: StudentSearchResult) => {
    if (busyId === r.account_id) return;
    const rel = r.relationship ?? {
      outgoing: 'none' as const,
      incoming: 'none' as const,
      is_friend: false,
      blocked_by_me: false,
      blocked_me: false,
    };
    setBusyId(r.account_id);
    try {
      if (rel.incoming === 'pending' && rel.outgoing === 'none') {
        const res = await acceptFollowRequest(token, r.account_id);
        patchResultRel(r.account_id, res.relationship);
        bumpSocialRevision();
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
      } else if (rel.outgoing === 'accepted' || rel.outgoing === 'pending') {
        const updated = await unfollowStudent(token, r.account_id);
        patchResultRel(r.account_id, updated, rel.outgoing === 'accepted' ? -1 : 0);
        bumpSocialRevision();
        showNotice(rel.outgoing === 'accepted' ? 'Você deixou de seguir' : 'Solicitação cancelada');
      } else {
        const res = await followStudent(token, r.account_id);
        patchResultRel(r.account_id, res.relationship, res.status === 'accepted' ? 1 : 0);
        bumpSocialRevision();
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
          showNotice(`Você está seguindo ${r.display_label.split(' ')[0]}`);
        }
      }
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Não foi possível concluir');
    } finally {
      setBusyId(null);
    }
  };

  const isEmail = trimmed.includes('@');

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 14px',
          height: 48,
          borderRadius: isMaterialYou ? 999 : 12,
          backgroundColor: tokens.surfaceContainerHigh,
          border: `1px solid ${tokens.outlineVariant}`,
        }}
      >
        {loading ? (
          <MorphingShapeIndicator size={18} label="Buscando" />
        ) : (
          <Search size={18} color={tokens.onSurfaceVariant} style={{ flexShrink: 0 }} />
        )}
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar aluno por nome ou e-mail"
          aria-label="Buscar aluno por nome ou e-mail"
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: tokens.onSurface,
            fontSize: '0.92rem',
            fontFamily: 'inherit',
          }}
        />
        {query && (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            style={{
              border: 'none',
              background: 'none',
              color: tokens.onSurfaceVariant,
              display: 'inline-flex',
              padding: 4,
              cursor: 'pointer',
            }}
          >
            <X size={17} />
          </button>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 10, fontSize: '0.8rem', color: tokens.error }}>{error}</div>
      )}

      {results && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
          {results.length === 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 16px',
                borderRadius: isMaterialYou ? 20 : 12,
                backgroundColor: tokens.surfaceContainer,
                color: tokens.onSurfaceVariant,
                fontSize: '0.84rem',
              }}
            >
              <UserSearch size={18} style={{ flexShrink: 0 }} />
              {isEmail
                ? 'Ninguém com esse e-mail pode ser encontrado. A busca por e-mail precisa do endereço completo.'
                : 'Nenhum aluno encontrado. Só aparece quem mostra o nome no ranking ou permite ser encontrado.'}
            </div>
          ) : (
            results.map((r, idx) => {
              const rel = r.relationship;
              const isFriend = Boolean(rel?.is_friend);
              const outgoing = rel?.outgoing ?? 'none';
              const incoming = rel?.incoming ?? 'none';
              const isBusy = busyId === r.account_id;

              const preview = {
                accountId: r.account_id,
                label: r.display_label,
                avatarUrl: r.avatar_url,
                classCode: r.class_code,
              };

              const actionLabel = isFriend
                ? 'Amigos'
                : incoming === 'pending' && outgoing === 'none'
                  ? 'Aceitar'
                  : outgoing === 'accepted'
                    ? 'Seguindo'
                    : outgoing === 'pending'
                      ? 'Solicitado'
                      : incoming === 'accepted'
                        ? 'Seguir de volta'
                        : r.requires_follow_approval
                          ? 'Solicitar'
                          : 'Seguir';

              const actionIcon = isBusy ? (
                <MorphingShapeIndicator size={13} label="Carregando" />
              ) : isFriend ? (
                <Handshake size={13} />
              ) : incoming === 'pending' && outgoing === 'none' ? (
                <Check size={13} />
              ) : outgoing === 'accepted' ? (
                <UserCheck size={13} />
              ) : outgoing === 'pending' ? (
                <Clock size={13} />
              ) : (
                <UserPlus size={13} />
              );

              return (
                <ExpressiveSegmentedCard
                  key={r.account_id}
                  index={idx}
                  total={results.length}
                  staggerIndex={idx}
                  onClick={
                    r.has_public_profile
                      ? () =>
                          openProfile(
                            preview,
                            document.querySelector<HTMLElement>(`[data-search-result="${r.account_id}"]`)
                          )
                      : undefined
                  }
                  style={{ padding: '10px 14px' }}
                >
                  <div
                    data-search-result={r.account_id}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                      <ProfileAvatar
                        name={r.display_label}
                        image={r.avatar_url}
                        size={40}
                        profile={{ ...preview, canOpen: r.has_public_profile }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: '0.94rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {r.display_label}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: '0.74rem',
                            color: tokens.onSurfaceVariant,
                          }}
                        >
                          <span>{r.class_code}</span>
                          {r.followers_count !== undefined && (
                            <>
                              <span>•</span>
                              <span>
                                {r.followers_count} {r.followers_count === 1 ? 'seguidor' : 'seguidores'}
                              </span>
                              <span>•</span>
                              <span>{r.following_count ?? 0} seguindo</span>
                            </>
                          )}
                          {!r.has_public_profile && (
                            <>
                              <span>•</span>
                              <Lock size={11} />
                              <span>Requer aprovação</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                    >
                      {isFriend && (
                        <EnhancedMorphButton
                          size="sm"
                          variant="filled"
                          icon={<MessageCircle size={13} />}
                          onClick={() =>
                            openChat({
                              accountId: r.account_id,
                              label: r.display_label,
                              avatarUrl: r.avatar_url,
                              classCode: r.class_code,
                            })
                          }
                        >
                          Chat
                        </EnhancedMorphButton>
                      )}
                      <EnhancedMorphButton
                        size="sm"
                        variant={outgoing === 'none' ? 'filled' : 'tonal'}
                        disabled={isBusy}
                        icon={actionIcon}
                        onClick={() => void handleFollowToggle(r)}
                      >
                        {actionLabel}
                      </EnhancedMorphButton>
                    </div>
                  </div>
                </ExpressiveSegmentedCard>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
