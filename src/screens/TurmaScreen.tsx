import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Camera,
  Crown,
  Eye,
  Megaphone,
  MessageSquare,
  Pin,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  deleteClassroomAnnouncement,
  fetchMyClassroomOverview,
  markAnnouncementRead,
  NsacApiClientError,
  setAnnouncementReaction,
  subscribeClassroomStream,
  updateClassroomAnnouncement,
  updateClassroomAppearance,
} from '../api/nsacClient';
import type {
  AnnouncementCategory,
  AnnouncementItem,
  ClassroomChannelKind,
  ClassroomOverviewPayload,
} from '../api/types';
import { useM3Theme } from '../theme/ThemeContext';
import { resolveAvatarRadius } from '../theme/materialYou';
import { EnhancedMorphButton, ExpressiveSegmentedCard } from '../components/expressive/ExpressivePrimitives';
import { ExpressiveModal, ModalHeader } from '../components/expressive/ExpressiveModal';
import { MorphingLoadingState } from '../components/expressive/ShapeMorph';
import { ProfileAvatar } from '../components/profile/ProfileAvatar';
import { AuthMediaImage } from '../components/classrooms/AuthMediaImage';
import { AnimatedImageLightbox } from '../components/classrooms/AnimatedImageLightbox';
import { RepresentativesPage } from '../components/classrooms/RepresentativesPage';
import { AnnouncementComposerPage } from '../components/classrooms/AnnouncementComposerPage';
import { ClassroomChatScreen } from '../components/classrooms/ClassroomChatScreen';
import { formatFullDate, splitText } from '../components/social/chat/chatModel';
import { openExternalUrl } from '../platform/openExternal';
import { compressImageToDataUrl } from '../utils/imageCompress';
import { loadCachedClassroomOverview, saveCachedClassroomOverview } from '../utils/chatCache';
import {
  displayAnnouncementTag,
  extractDynamicTags,
  MAX_VISIBLE_TAGS,
  tagSearchKey,
} from '../utils/announcementTags';

const QUICK_REACTIONS = ['👍', '👀', '❤️', '🔥'];

function daysUntilLabel(isoDate: string): string {
  const target = new Date(`${isoDate}T12:00:00`);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 86_400_000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff > 1) return `Em ${diff} dias`;
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export const TurmaScreen: React.FC<{
  token: string;
  refreshSignal: number;
  initialOpenChannel?: ClassroomChannelKind | null;
  onConsumedInitialChannel?: () => void;
  highlightAnnouncementId?: number | null;
  onConsumedHighlightAnnouncement?: () => void;
  onRefreshingChange?: (busy: boolean) => void;
}> = ({
  token,
  refreshSignal,
  initialOpenChannel = null,
  onConsumedInitialChannel,
  highlightAnnouncementId = null,
  onConsumedHighlightAnnouncement,
  onRefreshingChange,
}) => {
  const { tokens, isMaterialYou, settings } = useM3Theme();
  const initialOverview = useMemo(() => loadCachedClassroomOverview(token), [token]);
  const [overview, setOverview] = useState<ClassroomOverviewPayload | null>(initialOverview);
  const [loading, setLoading] = useState(!initialOverview);
  const [error, setError] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<'all' | AnnouncementCategory>('all');
  const [tagsMenuOpen, setTagsMenuOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState('');

  const [electionOpen, setElectionOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [activeChat, setActiveChat] = useState<{
    kind: ClassroomChannelKind;
    refAnnouncement?: AnnouncementItem | null;
  } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const avatarFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) onRefreshingChange?.(true);
      try {
        const data = await fetchMyClassroomOverview(token);
        setOverview(data);
        saveCachedClassroomOverview(token, data);
        setError(null);
      } catch (err) {
        if (!overview) {
          setError(err instanceof NsacApiClientError ? err.message : 'Não foi possível carregar o canal da turma.');
        }
      } finally {
        setLoading(false);
        if (!silent) onRefreshingChange?.(false);
      }
    },
    [token, onRefreshingChange]
  );

  useEffect(() => {
    void load(Boolean(initialOverview) && refreshSignal === 0);
  }, [load, refreshSignal, initialOverview]);

  // Open chat directly when triggered by a push notification tap
  useEffect(() => {
    if (initialOpenChannel && overview?.room.is_functional) {
      setActiveChat({ kind: initialOpenChannel });
      onConsumedInitialChannel?.();
    }
  }, [initialOpenChannel, overview?.room.is_functional, onConsumedInitialChannel]);

  // Scroll to & briefly highlight an announcement when opened from a push notification tap
  const [flashedAnnouncementId, setFlashedAnnouncementId] = useState<number | null>(null);
  useEffect(() => {
    if (!highlightAnnouncementId || !overview) return;
    setTagFilter('all');
    const found = overview.announcements.some((a) => a.id === highlightAnnouncementId);
    if (!found) return;
    setFlashedAnnouncementId(highlightAnnouncementId);
    onConsumedHighlightAnnouncement?.();
    const raf = window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-announcement-id="${highlightAnnouncementId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const timer = window.setTimeout(() => setFlashedAnnouncementId(null), 2600);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [highlightAnnouncementId, overview, onConsumedHighlightAnnouncement]);

  // Live SSE updates for announcements, unread chat counters, representatives & appearance
  useEffect(() => {
    if (!overview) return;
    return subscribeClassroomStream(token, () => {
      void load(true);
    });
  }, [token, overview?.room.id, load]);

  // Mark unread announcements as read automatically when viewed
  useEffect(() => {
    if (!overview) return;
    const unread = overview.announcements.filter((a) => !a.read_by_me && !a.deleted);
    if (unread.length === 0) return;
    for (const ann of unread.slice(0, 8)) {
      void markAnnouncementRead(token, ann.id).catch(() => {});
    }
  }, [token, overview?.announcements]);

  const handleAppearanceUpload = async (
    kind: 'avatar' | 'banner',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSavingAppearance(true);
    try {
      const maxW = kind === 'avatar' ? 512 : 1280;
      const maxH = kind === 'avatar' ? 512 : 640;
      const dataUrl = await compressImageToDataUrl(file, maxW, maxH, 0.82);
      const updatedRoom = await updateClassroomAppearance(
        token,
        kind === 'avatar' ? { avatar_data_url: dataUrl } : { banner_data_url: dataUrl }
      );
      setOverview((prev) => (prev ? { ...prev, room: updatedRoom } : prev));
      setAppearanceOpen(false);
      await load(true);
    } catch (err) {
      setError(err instanceof NsacApiClientError ? err.message : 'Falha ao atualizar aparência do canal.');
    } finally {
      setSavingAppearance(false);
    }
  };

  const handleTogglePin = async (ann: AnnouncementItem) => {
    try {
      await updateClassroomAnnouncement(token, ann.id, { pinned: !ann.pinned });
      await load(true);
    } catch (err) {
      setError(err instanceof NsacApiClientError ? err.message : 'Não foi possível alterar fixação.');
    }
  };

  const handleDeleteAnnouncement = async (ann: AnnouncementItem) => {
    try {
      await deleteClassroomAnnouncement(token, ann.id);
      await load(true);
    } catch (err) {
      setError(err instanceof NsacApiClientError ? err.message : 'Não foi possível apagar o anúncio.');
    }
  };

  const handleReaction = async (ann: AnnouncementItem, emoji: string) => {
    const already = ann.reactions.some((r) => r.mine && r.emoji === emoji);
    try {
      await setAnnouncementReaction(token, ann.id, already ? null : emoji);
      await load(true);
    } catch {
      // ignore
    }
  };

  const radius = isMaterialYou ? 28 : 14;

  const dynamicTags = useMemo(
    () => extractDynamicTags(overview?.announcements ?? []),
    [overview?.announcements]
  );

  const visibleFilterTags = useMemo(() => {
    const top = dynamicTags.slice(0, MAX_VISIBLE_TAGS);
    if (tagFilter !== 'all') {
      const selKey = tagSearchKey(tagFilter);
      if (!top.some((t) => tagSearchKey(t.tag) === selKey)) {
        const found = dynamicTags.find((t) => tagSearchKey(t.tag) === selKey);
        if (found) return [found, ...top.slice(0, MAX_VISIBLE_TAGS - 1)];
      }
    }
    return top;
  }, [dynamicTags, tagFilter]);

  const hiddenTagsCount = Math.max(0, dynamicTags.length - visibleFilterTags.length);

  const filteredModalTags = useMemo(() => {
    const q = tagSearchKey(tagSearch);
    if (!q) return dynamicTags;
    return dynamicTags.filter((t) => tagSearchKey(t.tag).includes(q));
  }, [dynamicTags, tagSearch]);

  if (loading && !overview) {
    return (
      <div style={{ padding: '64px 16px', display: 'flex', justifyContent: 'center' }}>
        <MorphingLoadingState label="Carregando canal da turma..." />
      </div>
    );
  }

  if (!overview) {
    return (
      <ExpressiveSegmentedCard index={0} total={1} style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 8 }}>Canal da Turma indisponível</div>
        <p style={{ margin: '0 0 16px', fontSize: '0.86rem', color: tokens.onSurfaceVariant }}>
          {error || 'Não foi possível identificar sua sala no NSAC.'}
        </p>
        <EnhancedMorphButton size="md" variant="filled" onClick={() => void load()}>
          Tentar novamente
        </EnhancedMorphButton>
      </ExpressiveSegmentedCard>
    );
  }

  const { room } = overview;
  const visibleAnnouncements = overview.announcements.filter(
    (a) =>
      !a.deleted &&
      (tagFilter === 'all' || tagSearchKey(displayAnnouncementTag(a.category)) === tagSearchKey(tagFilter))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMaterialYou ? 16 : 12 }}>
      {/* 1. ROOM HERO CARD (Banner + Room Avatar + Representatives) */}
      <section
        style={{
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: tokens.surfaceContainerLow,
          border: `1px solid ${tokens.outlineVariant}`,
        }}
      >
        {/* Banner */}
        <div
          style={{
            position: 'relative',
            height: 112,
            background: `linear-gradient(135deg, ${tokens.primaryContainer}, ${tokens.tertiaryContainer})`,
          }}
        >
          {room.banner_url && (
            <AuthMediaImage
              token={token}
              src={room.banner_url}
              alt={`Banner da turma ${room.class_code}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )}
          {overview.am_i_representative && (
            <button
              type="button"
              onClick={() => setAppearanceOpen(true)}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 999,
                border: 'none',
                backgroundColor: 'rgba(0,0,0,0.58)',
                color: '#fff',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
              }}
            >
              <Camera size={13} /> Personalizar canal
            </button>
          )}
        </div>

        <div style={{ padding: '0 18px 18px', position: 'relative' }}>
          {/* Room Avatar overlapping banner */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -34, marginBottom: 10 }}>
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <button
                type="button"
                disabled={!overview.am_i_representative || savingAppearance}
                onClick={() => {
                  if (overview.am_i_representative) avatarFileRef.current?.click();
                }}
                aria-label={overview.am_i_representative ? 'Alterar foto de perfil do canal' : `Foto da turma ${room.class_code}`}
                style={{
                  width: 68,
                  height: 68,
                  padding: 0,
                  borderRadius: resolveAvatarRadius(settings.avatarShape, 68),
                  border: `3px solid ${tokens.surfaceContainerLow}`,
                  backgroundColor: tokens.primary,
                  color: tokens.onPrimary,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: '1.1rem',
                  cursor: overview.am_i_representative ? 'pointer' : 'default',
                }}
              >
                {room.avatar_url ? (
                  <AuthMediaImage
                    token={token}
                    src={room.avatar_url}
                    alt={`Foto da turma ${room.class_code}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  room.class_code
                )}
              </button>
              {overview.am_i_representative && (
                <button
                  type="button"
                  disabled={savingAppearance}
                  onClick={() => avatarFileRef.current?.click()}
                  aria-label="Trocar foto de perfil do canal"
                  style={{
                    position: 'absolute',
                    right: -4,
                    bottom: -4,
                    width: 26,
                    height: 26,
                    borderRadius: 999,
                    border: `2px solid ${tokens.surfaceContainerLow}`,
                    backgroundColor: tokens.primary,
                    color: tokens.onPrimary,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <Camera size={13} />
                </button>
              )}
            </div>

            <EnhancedMorphButton
              size="sm"
              variant="tonal"
              icon={<Crown size={14} />}
              onClick={() => setElectionOpen(true)}
            >
              Representantes ({overview.representatives.length}/{room.max_representatives})
            </EnhancedMorphButton>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Turma {room.class_code}
            </h1>
            <span
              style={{
                padding: '2px 10px',
                borderRadius: 999,
                fontSize: '0.72rem',
                fontWeight: 800,
                backgroundColor: tokens.secondaryContainer,
                color: tokens.onSecondaryContainer,
              }}
            >
              {room.school_year}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: '0.8rem', color: tokens.onSurfaceVariant, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Users size={14} /> {room.member_count} alunos no canal
            </span>
            {overview.representatives.length > 0 && (
              <span>
                • Rep.:{' '}
                <strong>
                  {overview.representatives.map((r) => r.display_label.split(' ')[0]).join(', ')}
                </strong>
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 2. MINIMUM MEMBERS GATE (requires > 5 students, i.e. >= 6) */}
      {!room.is_functional ? (
        <ExpressiveSegmentedCard index={0} total={1} style={{ padding: '22px 20px' }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 6 }}>
            Quase lá para ativar o canal da {room.class_code}!
          </div>
          <p style={{ margin: '0 0 14px', fontSize: '0.84rem', color: tokens.onSurfaceVariant, lineHeight: 1.5 }}>
            Para garantir eleições democráticas de Representantes de Classe e evitar panelinhas, o canal precisa de
            mais de 5 alunos cadastrados da mesma turma (mínimo <strong>{room.min_members_required}</strong>).
          </p>
          <div
            style={{
              height: 10,
              borderRadius: 999,
              backgroundColor: tokens.surfaceContainerHighest,
              overflow: 'hidden',
              marginBottom: 8,
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.round((room.member_count / room.min_members_required) * 100))}%`,
                height: '100%',
                borderRadius: 999,
                backgroundColor: tokens.primary,
              }}
            />
          </div>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: tokens.primary }}>
            {room.member_count} / {room.min_members_required} alunos — faltam{' '}
            {Math.max(0, room.min_members_required - room.member_count)} colegas entrarem no n²sac
          </div>
        </ExpressiveSegmentedCard>
      ) : (
        <>
          {/* 3. TWO DISTINCT CHAT BUTTONS (Chat da Turma + Chat Off-Topic) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 10,
            }}
          >
            {/* Button 1: Chat da Turma */}
            <button
              type="button"
              onClick={() => setActiveChat({ kind: 'chat' })}
              style={{
                textAlign: 'left',
                padding: '15px 14px',
                borderRadius: isMaterialYou ? 24 : 12,
                border: `1px solid ${overview.chat.unread_count > 0 ? tokens.primary : tokens.outlineVariant}`,
                backgroundColor: tokens.primaryContainer,
                color: tokens.onPrimaryContainer,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: tokens.primary,
                    color: tokens.onPrimary,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MessageSquare size={18} />
                </span>
                {overview.chat.unread_count > 0 && (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      backgroundColor: tokens.primary,
                      color: tokens.onPrimary,
                    }}
                  >
                    {overview.chat.unread_count}
                  </span>
                )}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Chat da Turma</div>
                <div
                  style={{
                    fontSize: '0.74rem',
                    opacity: 0.85,
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {overview.chat.last_message_preview
                    ? `${overview.chat.last_sender_label?.split(' ')[0] ?? ''}: ${overview.chat.last_message_preview}`
                    : 'Provas, trabalhos e dúvidas'}
                </div>
              </div>
            </button>

            {/* Button 2: Chat Off-Topic */}
            <button
              type="button"
              onClick={() => setActiveChat({ kind: 'off_topic' })}
              style={{
                textAlign: 'left',
                padding: '15px 14px',
                borderRadius: isMaterialYou ? 24 : 12,
                border: `1px solid ${overview.off_topic.unread_count > 0 ? tokens.tertiary : tokens.outlineVariant}`,
                backgroundColor: tokens.tertiaryContainer,
                color: tokens.onTertiaryContainer,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: tokens.tertiary,
                    color: tokens.onTertiary,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Sparkles size={18} />
                </span>
                {overview.off_topic.unread_count > 0 && (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      backgroundColor: tokens.tertiary,
                      color: tokens.onTertiary,
                    }}
                  >
                    {overview.off_topic.unread_count}
                  </span>
                )}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Chat Off-Topic</div>
                <div
                  style={{
                    fontSize: '0.74rem',
                    opacity: 0.85,
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {overview.off_topic.last_message_preview
                    ? `${overview.off_topic.last_sender_label?.split(' ')[0] ?? ''}: ${overview.off_topic.last_message_preview}`
                    : 'Resenha e conversa livre'}
                </div>
              </div>
            </button>
          </div>

          {/* 4. OFFICIAL ANNOUNCEMENTS HEADER & ACTIONS */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Megaphone size={18} color={tokens.primary} />
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Anúncios Oficiais</h2>
            </div>

            {overview.am_i_representative && (
              <EnhancedMorphButton
                size="sm"
                variant="filled"
                icon={<Plus size={15} />}
                onClick={() => setComposerOpen(true)}
              >
                Novo anúncio
              </EnhancedMorphButton>
            )}
          </div>

          <div
            onClick={() => setElectionOpen(true)}
            style={{
              padding: '14px 16px',
              borderRadius: 18,
              backgroundColor: tokens.secondaryContainer,
              color: tokens.onSecondaryContainer,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <span>
              {overview.representatives.length === 0 ? (
                <>
                  <strong>Nenhum representante eleito ainda.</strong> Toque aqui para votar (quórum:{' '}
                  {room.quorum} votos).
                </>
              ) : overview.representatives.length < room.max_representatives ? (
                <>
                  <strong>
                    {overview.representatives.length} de {room.max_representatives} representantes eleitos.
                  </strong>{' '}
                  A votação continua aberta — toque para votar ou alterar seus votos (
                  {overview.my_votes.length}/{room.max_votes_per_student}).
                </>
              ) : (
                <>
                  <strong>
                    {overview.representatives.length} representantes ativos.
                  </strong>{' '}
                  Votação contínua — toque para ver o ranking ou alterar seus votos (
                  {overview.my_votes.length}/{room.max_votes_per_student}).
                </>
              )}
            </span>
            <Crown size={18} style={{ flexShrink: 0 }} />
          </div>

          {/* Dynamic tag filter pills (up to 5 shown + searchable submenu when > 5) */}
          {dynamicTags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setTagFilter('all')}
                style={{
                  padding: '6px 13px',
                  borderRadius: 999,
                  border: `1px solid ${tagFilter === 'all' ? tokens.primary : tokens.outlineVariant}`,
                  backgroundColor: tagFilter === 'all' ? tokens.primaryContainer : tokens.surfaceContainerLow,
                  color: tagFilter === 'all' ? tokens.onPrimaryContainer : tokens.onSurfaceVariant,
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                Todas
              </button>
              {visibleFilterTags.map((entry) => {
                const selected = tagFilter !== 'all' && tagSearchKey(tagFilter) === tagSearchKey(entry.tag);
                return (
                  <button
                    key={entry.tag}
                    type="button"
                    onClick={() => setTagFilter(entry.tag)}
                    style={{
                      padding: '6px 13px',
                      borderRadius: 999,
                      border: `1px solid ${selected ? tokens.primary : tokens.outlineVariant}`,
                      backgroundColor: selected ? tokens.primaryContainer : tokens.surfaceContainerLow,
                      color: selected ? tokens.onPrimaryContainer : tokens.onSurfaceVariant,
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                    }}
                  >
                    {entry.tag}
                  </button>
                );
              })}
              {hiddenTagsCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setTagSearch('');
                    setTagsMenuOpen(true);
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 999,
                    border: `1px dashed ${tokens.outline}`,
                    backgroundColor: 'transparent',
                    color: tokens.primary,
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Search size={12} /> +{hiddenTagsCount} tags
                </button>
              )}
            </div>
          )}

          {error && (
            <div
              role="alert"
              style={{
                padding: '10px 14px',
                borderRadius: 14,
                backgroundColor: tokens.errorContainer,
                color: tokens.onErrorContainer,
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}

          {/* 5. ANNOUNCEMENTS FEED */}
          {visibleAnnouncements.length === 0 ? (
            <ExpressiveSegmentedCard index={0} total={1} style={{ padding: '28px 20px', textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: '0.98rem', marginBottom: 6 }}>
                Nenhum anúncio publicado ainda
              </div>
              <div style={{ fontSize: '0.82rem', color: tokens.onSurfaceVariant }}>
                Apenas os Representantes de Classe podem publicar aqui. Todos da turma são notificados em alta prioridade.
              </div>
            </ExpressiveSegmentedCard>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visibleAnnouncements.map((ann) => (
                <article
                  key={ann.id}
                  data-announcement-id={ann.id}
                  style={{
                    padding: '16px 18px',
                    borderRadius: isMaterialYou ? 24 : 12,
                    backgroundColor:
                      flashedAnnouncementId === ann.id
                        ? tokens.primaryContainer + '55'
                        : ann.pinned
                          ? tokens.primaryContainer + '28'
                          : tokens.surfaceContainerLow,
                    border: `${flashedAnnouncementId === ann.id ? 2 : 1}px solid ${
                      flashedAnnouncementId === ann.id || ann.pinned ? tokens.primary : tokens.outlineVariant
                    }`,
                    transition: 'background-color 300ms ease, border-color 300ms ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {/* Author & Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <ProfileAvatar name={ann.author_label} image={ann.author_avatar_url} size={36} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>{ann.author_label}</span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              padding: '1px 7px',
                              borderRadius: 999,
                              fontSize: '0.66rem',
                              fontWeight: 800,
                              backgroundColor: tokens.primary,
                              color: tokens.onPrimary,
                            }}
                          >
                            <ShieldCheck size={10} /> Representante
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: tokens.onSurfaceVariant }}>
                          {formatFullDate(ann.created_at)}
                        </div>
                      </div>
                    </div>

                    {overview.am_i_representative && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => void handleTogglePin(ann)}
                          title={ann.pinned ? 'Desafixar' : 'Fixar no topo'}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 999,
                            border: `1px solid ${tokens.outlineVariant}`,
                            backgroundColor: ann.pinned ? tokens.primaryContainer : tokens.surfaceContainerHigh,
                            color: ann.pinned ? tokens.onPrimaryContainer : tokens.onSurfaceVariant,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <Pin size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteAnnouncement(ann)}
                          title="Apagar anúncio"
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 999,
                            border: 'none',
                            backgroundColor: tokens.errorContainer,
                            color: tokens.onErrorContainer,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Category + Event date chips */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {ann.pinned && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 9px',
                          borderRadius: 999,
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          backgroundColor: tokens.primaryContainer,
                          color: tokens.onPrimaryContainer,
                        }}
                      >
                        <Pin size={11} /> Fixado
                      </span>
                    )}
                    <span
                      style={{
                        padding: '2px 9px',
                        borderRadius: 999,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        backgroundColor: tokens.surfaceContainerHigh,
                        color: tokens.onSurfaceVariant,
                      }}
                    >
                      {displayAnnouncementTag(ann.category)}
                    </span>
                    {ann.event_date && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 9px',
                          borderRadius: 999,
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          backgroundColor: tokens.gradeWarningContainer,
                          color: tokens.onGradeWarningContainer,
                        }}
                      >
                        <Calendar size={11} /> {daysUntilLabel(ann.event_date)}
                      </span>
                    )}
                  </div>

                  {ann.title && (
                    <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800 }}>{ann.title}</h3>
                  )}

                  {ann.body && (
                    <div style={{ fontSize: '0.9rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {splitText(ann.body).map((part, i) =>
                        part.kind === 'link' ? (
                          <a
                            key={i}
                            href={part.value}
                            onClick={(ev) => {
                              ev.preventDefault();
                              openExternalUrl(part.value);
                            }}
                            style={{ color: tokens.primary, textDecoration: 'underline' }}
                          >
                            {part.value}
                          </a>
                        ) : (
                          <React.Fragment key={i}>{part.value}</React.Fragment>
                        )
                      )}
                    </div>
                  )}

                  {ann.attachment_url && (
                    <AuthMediaImage
                      token={token}
                      src={ann.attachment_url}
                      alt={ann.title || 'Imagem do anúncio'}
                      onClick={() => setLightboxUrl(ann.attachment_url)}
                      style={{
                        width: '100%',
                        maxHeight: 320,
                        borderRadius: 16,
                        objectFit: 'cover',
                        cursor: 'pointer',
                        display: 'block',
                      }}
                    />
                  )}

                  {/* Footer: quick reactions + read count + discuss in chat */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      flexWrap: 'wrap',
                      paddingTop: 4,
                      borderTop: `1px solid ${tokens.outlineVariant}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {QUICK_REACTIONS.map((em) => {
                        const r = ann.reactions.find((x) => x.emoji === em);
                        return (
                          <button
                            key={em}
                            type="button"
                            onClick={() => void handleReaction(ann, em)}
                            style={{
                              padding: '4px 9px',
                              borderRadius: 999,
                              border: `1px solid ${r?.mine ? tokens.primary : tokens.outlineVariant}`,
                              backgroundColor: r?.mine ? tokens.primaryContainer : tokens.surfaceContainerHigh,
                              color: tokens.onSurface,
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {em} {r ? r.count : ''}
                          </button>
                        );
                      })}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.73rem',
                          color: tokens.onSurfaceVariant,
                          marginLeft: 4,
                        }}
                      >
                        <Eye size={13} /> {ann.read_count}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveChat({ kind: 'chat', refAnnouncement: ann })}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '5px 11px',
                        borderRadius: 999,
                        border: 'none',
                        backgroundColor: tokens.secondaryContainer,
                        color: tokens.onSecondaryContainer,
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      <MessageSquare size={13} /> Discutir no Chat
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {/* Sub-pages & Modals */}
      {electionOpen && (
        <RepresentativesPage
          token={token}
          onClose={() => setElectionOpen(false)}
          onElectionUpdated={() => void load(true)}
        />
      )}

      {composerOpen && (
        <AnnouncementComposerPage
          token={token}
          classCode={room.class_code}
          existingTags={dynamicTags.map((t) => t.tag)}
          onClose={() => setComposerOpen(false)}
          onPublished={() => void load(true)}
        />
      )}

      {tagsMenuOpen && (
        <ExpressiveModal
          ariaLabel="Pesquisar tags"
          onClose={() => setTagsMenuOpen(false)}
          maxWidth={440}
        >
          {(close) => (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ModalHeader
                icon={<Tag size={18} />}
                eyebrow={`Turma ${room.class_code}`}
                title="Todas as Tags"
                onClose={() => close(() => setTagsMenuOpen(false))}
              />
              <div style={{ position: 'relative' }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: tokens.onSurfaceVariant,
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  placeholder="Pesquisar tag por nome…"
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    height: 42,
                    padding: '0 36px 0 36px',
                    borderRadius: 14,
                    border: `1.5px solid ${tokens.outlineVariant}`,
                    backgroundColor: tokens.surfaceContainerLowest,
                    color: tokens.onSurface,
                    fontSize: '0.88rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
                {tagSearch && (
                  <button
                    type="button"
                    onClick={() => setTagSearch('')}
                    aria-label="Limpar busca"
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 'none',
                      background: 'transparent',
                      color: tokens.onSurfaceVariant,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      padding: 4,
                    }}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                <button
                  type="button"
                  onClick={() => {
                    setTagFilter('all');
                    close(() => setTagsMenuOpen(false));
                  }}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 999,
                    border: `1px solid ${tagFilter === 'all' ? tokens.primary : tokens.outlineVariant}`,
                    backgroundColor: tagFilter === 'all' ? tokens.primaryContainer : tokens.surfaceContainerHigh,
                    color: tagFilter === 'all' ? tokens.onPrimaryContainer : tokens.onSurface,
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  Todas
                </button>
                {filteredModalTags.length === 0 ? (
                  <div style={{ width: '100%', fontSize: '0.84rem', color: tokens.onSurfaceVariant, padding: '8px 0' }}>
                    Nenhuma tag encontrada para “{tagSearch}”.
                  </div>
                ) : (
                  filteredModalTags.map((entry) => {
                    const selected = tagFilter !== 'all' && tagSearchKey(tagFilter) === tagSearchKey(entry.tag);
                    return (
                      <button
                        key={entry.tag}
                        type="button"
                        onClick={() => {
                          setTagFilter(entry.tag);
                          close(() => setTagsMenuOpen(false));
                        }}
                        style={{
                          padding: '7px 14px',
                          borderRadius: 999,
                          border: `1px solid ${selected ? tokens.primary : tokens.outlineVariant}`,
                          backgroundColor: selected ? tokens.primaryContainer : tokens.surfaceContainerHigh,
                          color: selected ? tokens.onPrimaryContainer : tokens.onSurface,
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span>{entry.tag}</span>
                        <span style={{ opacity: 0.7, fontSize: '0.74rem' }}>{entry.count}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </ExpressiveModal>
      )}

      {activeChat && (
        <ClassroomChatScreen
          token={token}
          classCode={room.class_code}
          channelKind={activeChat.kind}
          initialRefAnnouncement={activeChat.refAnnouncement}
          onClose={() => {
            setActiveChat(null);
            void load(true);
          }}
        />
      )}

      {/* Persistent hidden file inputs for channel avatar & banner (outside modal so Android file picker stays mounted) */}
      <input
        ref={avatarFileRef}
        type="file"
        accept="image/*"
        onChange={(e) => void handleAppearanceUpload('avatar', e)}
        style={{ display: 'none' }}
      />
      <input
        ref={bannerFileRef}
        type="file"
        accept="image/*"
        onChange={(e) => void handleAppearanceUpload('banner', e)}
        style={{ display: 'none' }}
      />

      {appearanceOpen && (
        <ExpressiveModal
          ariaLabel="Personalizar foto e banner do canal"
          onClose={() => setAppearanceOpen(false)}
          maxWidth={420}
        >
          {(close) => (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ModalHeader
                icon={<Camera size={18} />}
                eyebrow={`Exclusivo para Representantes da ${room.class_code}`}
                title="Aparência do Canal"
                onClose={() => close(() => setAppearanceOpen(false))}
              />
              <EnhancedMorphButton
                size="md"
                variant="filled"
                fullWidth
                disabled={savingAppearance}
                icon={<Camera size={16} />}
                onClick={() => avatarFileRef.current?.click()}
              >
                {savingAppearance ? 'Salvando…' : 'Alterar foto de perfil do canal'}
              </EnhancedMorphButton>
              <EnhancedMorphButton
                size="md"
                variant="tonal"
                fullWidth
                disabled={savingAppearance}
                icon={<Camera size={16} />}
                onClick={() => bannerFileRef.current?.click()}
              >
                {savingAppearance ? 'Salvando…' : 'Alterar banner do canal'}
              </EnhancedMorphButton>
            </div>
          )}
        </ExpressiveModal>
      )}

      {lightboxUrl && (
        <AnimatedImageLightbox
          token={token}
          src={lightboxUrl}
          alt="Imagem do anúncio"
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </div>
  );
};
