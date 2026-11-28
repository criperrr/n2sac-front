import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Bug, Code2, ImagePlus, Lightbulb, Megaphone, MessageSquare, MessageSquareHeart, Pin, Plus, Send, Trash2, X } from 'lucide-react';
import { useM3Theme } from '../../theme/ThemeContext';
import {
  createDevAnnouncement,
  createDevAnnouncementComment,
  deleteDevAnnouncement,
  deleteDevAnnouncementComment,
  fetchDevAnnouncementComments,
  fetchDevAnnouncements,
  markDevAnnouncementRead,
  toggleDevAnnouncementReaction,
  voteDevAnnouncementPoll,
} from '../../api/nsacClient';
import type { DevAnnouncementComment, DevAnnouncementItem } from '../../api/types';

interface DevAnnouncementsPanelProps {
  token: string;
  refreshSignal?: number;
  onUnreadCountChange?: (count: number) => void;
}

const DEV_TAGS = ['novidade', 'correção', 'aviso', 'manutenção', 'versão'] as const;
const QUICK_EMOJIS = ['👍', '❤️', '🔥', '🎉', '👀'] as const;

async function compressHighQualityImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxDim = 2048;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const webp = canvas.toDataURL('image/webp', 0.92);
  if (webp.startsWith('data:image/webp')) return webp;
  return canvas.toDataURL('image/jpeg', 0.92);
}

export const DevAnnouncementsPanel: React.FC<DevAnnouncementsPanelProps> = ({
  token,
  refreshSignal = 0,
  onUnreadCountChange,
}) => {
  const { tokens } = useM3Theme();
  const [items, setItems] = useState<DevAnnouncementItem[]>([]);
  const [canPublish, setCanPublish] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tag, setTag] = useState<string>('novidade');
  const [pinned, setPinned] = useState(false);
  const [sendPush, setSendPush] = useState(true);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [openCommentsFor, setOpenCommentsFor] = useState<Record<number, boolean>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<number, DevAnnouncementComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [loadingComments, setLoadingComments] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDevAnnouncements(token, 50);
      setItems(data.items);
      setCanPublish(data.can_publish);
      onUnreadCountChange?.(data.unread_count);

      const unread = data.items.filter((a) => !a.read_by_me);
      if (unread.length > 0) {
        void Promise.allSettled(unread.map((a) => markDevAnnouncementRead(token, a.id))).then(() => {
          onUnreadCountChange?.(0);
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar anúncios de desenvolvimento.');
    } finally {
      setLoading(false);
    }
  }, [token, onUnreadCountChange]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || submitting) return;

    const cleanPoll = pollEnabled
      ? pollOptions.map((o) => o.trim()).filter(Boolean)
      : [];
    if (pollEnabled && (cleanPoll.length < 2 || cleanPoll.length > 6)) {
      setError('A enquete deve ter entre 2 e 6 opções preenchidas.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const created = await createDevAnnouncement(token, {
        title: title.trim(),
        body: body.trim(),
        tag: tag.trim() || 'novidade',
        pinned,
        send_push: sendPush,
        image_data_url: imageDataUrl,
        poll_options: cleanPoll,
      });
      setItems((prev) => [created, ...prev]);
      setTitle('');
      setBody('');
      setPinned(false);
      setPollEnabled(false);
      setPollOptions(['', '']);
      setImageDataUrl(null);
      setComposerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível publicar o anúncio.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteDevAnnouncement(token, id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover anúncio.');
    }
  };

  const handleToggleReaction = async (announcementId: number, emoji: string) => {
    try {
      const reactions = await toggleDevAnnouncementReaction(token, announcementId, emoji);
      setItems((prev) =>
        prev.map((item) => (item.id === announcementId ? { ...item, reactions } : item))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao reagir.');
    }
  };

  const handleVotePoll = async (announcementId: number, optionId: number) => {
    try {
      const updatedOptions = await voteDevAnnouncementPoll(token, announcementId, optionId);
      setItems((prev) =>
        prev.map((item) =>
          item.id === announcementId ? { ...item, poll_options: updatedOptions } : item
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao votar na enquete.');
    }
  };

  const handleToggleComments = async (announcementId: number) => {
    const nextOpen = !openCommentsFor[announcementId];
    setOpenCommentsFor((prev) => ({ ...prev, [announcementId]: nextOpen }));
    if (nextOpen && !commentsByPost[announcementId]) {
      setLoadingComments((prev) => ({ ...prev, [announcementId]: true }));
      try {
        const list = await fetchDevAnnouncementComments(token, announcementId);
        setCommentsByPost((prev) => ({ ...prev, [announcementId]: list }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar comentários.');
      } finally {
        setLoadingComments((prev) => ({ ...prev, [announcementId]: false }));
      }
    }
  };

  const handleCreateComment = async (e: React.FormEvent, announcementId: number) => {
    e.preventDefault();
    const draft = (commentDrafts[announcementId] ?? '').trim();
    if (!draft) return;
    try {
      const created = await createDevAnnouncementComment(token, announcementId, draft);
      setCommentsByPost((prev) => ({
        ...prev,
        [announcementId]: [...(prev[announcementId] ?? []), created],
      }));
      setCommentDrafts((prev) => ({ ...prev, [announcementId]: '' }));
      setItems((prev) =>
        prev.map((item) =>
          item.id === announcementId ? { ...item, comment_count: item.comment_count + 1 } : item
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar comentário.');
    }
  };

  const handleDeleteComment = async (announcementId: number, commentId: number) => {
    try {
      await deleteDevAnnouncementComment(token, commentId);
      setCommentsByPost((prev) => ({
        ...prev,
        [announcementId]: (prev[announcementId] ?? []).filter((c) => c.id !== commentId),
      }));
      setItems((prev) =>
        prev.map((item) =>
          item.id === announcementId
            ? { ...item, comment_count: Math.max(0, item.comment_count - 1) }
            : item
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir comentário.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '14px 16px',
          borderRadius: 20,
          background: tokens.surfaceContainerLow,
          border: `1px solid ${tokens.outlineVariant}55`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                background: tokens.primaryContainer,
                color: tokens.onPrimaryContainer,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Code2 size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.96rem', color: tokens.onSurface }}>
                Canal de Desenvolvimento
              </div>
              <div style={{ fontSize: '0.78rem', color: tokens.onSurfaceVariant }}>
                Novidades, enquetes e avisos oficiais do n²sac
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('n2sac:open-feedback', { detail: { kind: 'bug' } }))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 11px',
                borderRadius: 999,
                border: `1px solid ${tokens.outlineVariant}`,
                backgroundColor: tokens.errorContainer,
                color: tokens.onErrorContainer,
                fontSize: '0.74rem',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              <Bug size={13} /> Reportar bug
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('n2sac:open-feedback', { detail: { kind: 'suggestion' } }))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 11px',
                borderRadius: 999,
                border: `1px solid ${tokens.outlineVariant}`,
                backgroundColor: tokens.primaryContainer,
                color: tokens.onPrimaryContainer,
                fontSize: '0.74rem',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              <Lightbulb size={13} /> Sugestão
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('n2sac:open-feedback', { detail: { kind: 'feedback' } }))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 11px',
                borderRadius: 999,
                border: `1px solid ${tokens.outlineVariant}`,
                backgroundColor: tokens.tertiaryContainer,
                color: tokens.onTertiaryContainer,
                fontSize: '0.74rem',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              <MessageSquareHeart size={13} /> Feedback
            </button>
          </div>
        </div>

        {canPublish && (
          <button
            type="button"
            onClick={() => setComposerOpen((v) => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.82rem',
              background: tokens.primary,
              color: tokens.onPrimary,
              flexShrink: 0,
            }}
          >
            <Plus size={16} />
            {composerOpen ? 'Fechar' : 'Publicar'}
          </button>
        )}
      </div>

      {canPublish && composerOpen && (
        <form
          onSubmit={(e) => void handlePublish(e)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: 16,
            borderRadius: 20,
            background: tokens.surfaceContainer,
            border: `1px solid ${tokens.primary}44`,
          }}
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título do anúncio (ex: Atualização v1.6.0)"
            maxLength={140}
            required
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 12,
              border: `1px solid ${tokens.outlineVariant}`,
              background: tokens.surface,
              color: tokens.onSurface,
              fontSize: '0.9rem',
              fontWeight: 600,
              boxSizing: 'border-box',
            }}
          />

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escreva os detalhes da novidade, aviso ou pergunta da enquete..."
            rows={4}
            maxLength={4000}
            required
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 12,
              border: `1px solid ${tokens.outlineVariant}`,
              background: tokens.surface,
              color: tokens.onSurface,
              fontSize: '0.88rem',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {DEV_TAGS.map((t) => {
              const active = tag === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTag(t)}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 999,
                    border: `1px solid ${active ? tokens.primary : tokens.outlineVariant}`,
                    background: active ? tokens.primaryContainer : 'transparent',
                    color: active ? tokens.onPrimaryContainer : tokens.onSurfaceVariant,
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {pollEnabled && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 12,
                borderRadius: 14,
                background: tokens.surfaceContainerLow,
                border: `1px solid ${tokens.outlineVariant}66`,
              }}
            >
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: tokens.onSurface }}>
                Opções da enquete (2 a 6)
              </div>
              {pollOptions.map((opt, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) =>
                      setPollOptions((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                    }
                    placeholder={`Opção ${idx + 1}`}
                    maxLength={100}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: `1px solid ${tokens.outlineVariant}`,
                      background: tokens.surface,
                      color: tokens.onSurface,
                      fontSize: '0.84rem',
                    }}
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setPollOptions((prev) => prev.filter((_, i) => i !== idx))}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: tokens.onSurfaceVariant,
                        cursor: 'pointer',
                        padding: 4,
                      }}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 6 && (
                <button
                  type="button"
                  onClick={() => setPollOptions((prev) => [...prev, ''])}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '5px 10px',
                    borderRadius: 999,
                    border: `1px solid ${tokens.outlineVariant}`,
                    background: 'transparent',
                    color: tokens.primary,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  + Adicionar opção
                </button>
              )}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              alignItems: 'center',
              fontSize: '0.82rem',
              color: tokens.onSurfaceVariant,
            }}
          >
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              Fixar no topo
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={sendPush} onChange={(e) => setSendPush(e.target.checked)} />
              Enviar notificação push
            </label>
            <button
              type="button"
              onClick={() => setPollEnabled((v) => !v)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 999,
                border: `1px solid ${pollEnabled ? tokens.primary : tokens.outlineVariant}`,
                background: pollEnabled ? tokens.primaryContainer : 'transparent',
                color: pollEnabled ? tokens.onPrimaryContainer : tokens.onSurfaceVariant,
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <BarChart3 size={14} />
              {pollEnabled ? 'Remover enquete' : 'Adicionar enquete'}
            </button>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 999,
                border: `1px solid ${imageDataUrl ? tokens.primary : tokens.outlineVariant}`,
                background: imageDataUrl ? tokens.primaryContainer : 'transparent',
                color: imageDataUrl ? tokens.onPrimaryContainer : tokens.onSurfaceVariant,
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <ImagePlus size={14} />
              {imageDataUrl ? 'Trocar imagem' : 'Anexar imagem'}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void compressHighQualityImage(file)
                    .then(setImageDataUrl)
                    .catch((err) =>
                      setError(err instanceof Error ? err.message : 'Erro ao processar imagem.')
                    );
                }}
              />
            </label>
          </div>

          {imageDataUrl && (
            <div style={{ position: 'relative', alignSelf: 'flex-start' }}>
              <img
                src={imageDataUrl}
                alt="Prévia do anexo"
                style={{
                  maxWidth: '100%',
                  maxHeight: 220,
                  borderRadius: 14,
                  border: `1px solid ${tokens.outlineVariant}`,
                  objectFit: 'contain',
                }}
              />
              <button
                type="button"
                onClick={() => setImageDataUrl(null)}
                title="Remover imagem"
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  border: 'none',
                  background: 'rgba(0,0,0,0.65)',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !body.trim()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 16px',
                borderRadius: 999,
                border: 'none',
                cursor: submitting ? 'wait' : 'pointer',
                fontWeight: 700,
                fontSize: '0.84rem',
                background: tokens.primary,
                color: tokens.onPrimary,
                opacity: submitting ? 0.7 : 1,
              }}
            >
              <Send size={15} />
              {submitting ? 'Publicando...' : 'Publicar anúncio'}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 14,
            background: tokens.errorContainer,
            color: tokens.onErrorContainer,
            fontSize: '0.84rem',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: tokens.onSurfaceVariant, fontSize: '0.88rem' }}>
          Carregando anúncios de desenvolvimento...
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            padding: 28,
            borderRadius: 20,
            background: tokens.surfaceContainerLow,
            textAlign: 'center',
            color: tokens.onSurfaceVariant,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Megaphone size={26} style={{ opacity: 0.6 }} />
          <div style={{ fontWeight: 600, color: tokens.onSurface }}>Nenhum anúncio de desenvolvimento ainda</div>
          <div style={{ fontSize: '0.82rem' }}>
            Quando houver novidades ou atualizações do n²sac, elas aparecerão aqui.
          </div>
        </div>
      ) : (
        items.map((item) => {
          const totalVotes = item.poll_options.reduce((sum, o) => sum + o.votes, 0);
          const commentsOpen = Boolean(openCommentsFor[item.id]);
          const comments = commentsByPost[item.id] ?? [];
          const reactionMap = new Map(item.reactions.map((r) => [r.emoji, r]));

          return (
            <article
              key={item.id}
              style={{
                padding: 16,
                borderRadius: 20,
                background: tokens.surfaceContainerLow,
                border: `1px solid ${item.pinned ? `${tokens.primary}55` : `${tokens.outlineVariant}55`}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      padding: '3px 9px',
                      borderRadius: 999,
                      background: tokens.primaryContainer,
                      color: tokens.onPrimaryContainer,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                    }}
                  >
                    {item.tag}
                  </span>
                  {item.pinned && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: tokens.primary,
                      }}
                    >
                      <Pin size={12} /> Fixado
                    </span>
                  )}
                  <span style={{ fontSize: '0.74rem', color: tokens.onSurfaceVariant }}>
                    {new Date(item.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                {canPublish && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(item.id)}
                    title="Remover anúncio"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: tokens.error,
                      cursor: 'pointer',
                      padding: 4,
                      display: 'inline-flex',
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: tokens.onSurface }}>
                {item.title}
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.88rem',
                  lineHeight: 1.5,
                  color: tokens.onSurfaceVariant,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {item.body}
              </p>

              {item.image_data_url && (
                <img
                  src={item.image_data_url}
                  alt={item.title}
                  loading="lazy"
                  style={{
                    width: '100%',
                    maxHeight: 420,
                    objectFit: 'contain',
                    borderRadius: 14,
                    background: tokens.surface,
                    border: `1px solid ${tokens.outlineVariant}44`,
                  }}
                />
              )}

              {/* Poll */}
              {item.poll_options.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                  {item.poll_options.map((opt) => {
                    const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => void handleVotePoll(item.id, opt.id)}
                        style={{
                          position: 'relative',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          padding: '9px 12px',
                          borderRadius: 12,
                          border: `1px solid ${opt.voted_by_me ? tokens.primary : tokens.outlineVariant}`,
                          background: tokens.surface,
                          color: tokens.onSurface,
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontSize: '0.84rem',
                          fontWeight: opt.voted_by_me ? 700 : 500,
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            width: `${pct}%`,
                            background: opt.voted_by_me
                              ? `${tokens.primary}26`
                              : `${tokens.surfaceContainerHighest}88`,
                            transition: 'width 200ms ease',
                            pointerEvents: 'none',
                          }}
                        />
                        <span style={{ position: 'relative', zIndex: 1 }}>{opt.label}</span>
                        <span
                          style={{
                            position: 'relative',
                            zIndex: 1,
                            fontSize: '0.76rem',
                            color: opt.voted_by_me ? tokens.primary : tokens.onSurfaceVariant,
                            fontWeight: 700,
                          }}
                        >
                          {pct}% ({opt.votes})
                        </span>
                      </button>
                    );
                  })}
                  <div style={{ fontSize: '0.74rem', color: tokens.onSurfaceVariant }}>
                    {totalVotes} {totalVotes === 1 ? 'voto' : 'votos'}
                  </div>
                </div>
              )}

              {/* Reactions & Comments toggle */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  paddingTop: 4,
                  borderTop: `1px solid ${tokens.outlineVariant}33`,
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {QUICK_EMOJIS.map((emoji) => {
                    const r = reactionMap.get(emoji);
                    const active = r?.reacted_by_me ?? false;
                    const count = r?.count ?? 0;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => void handleToggleReaction(item.id, emoji)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 9px',
                          borderRadius: 999,
                          border: `1px solid ${active ? tokens.primary : `${tokens.outlineVariant}66`}`,
                          background: active ? tokens.primaryContainer : 'transparent',
                          color: active ? tokens.onPrimaryContainer : tokens.onSurfaceVariant,
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <span>{emoji}</span>
                        {count > 0 && <span>{count}</span>}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => void handleToggleComments(item.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 10px',
                    borderRadius: 999,
                    border: `1px solid ${tokens.outlineVariant}66`,
                    background: commentsOpen ? tokens.surfaceContainerHighest : 'transparent',
                    color: tokens.onSurfaceVariant,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <MessageSquare size={14} />
                  <span>{item.comment_count}</span>
                </button>
              </div>

              {/* Comments section */}
              {commentsOpen && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    paddingTop: 8,
                    borderTop: `1px solid ${tokens.outlineVariant}33`,
                  }}
                >
                  {loadingComments[item.id] ? (
                    <div style={{ fontSize: '0.8rem', color: tokens.onSurfaceVariant }}>
                      Carregando comentários...
                    </div>
                  ) : comments.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: tokens.onSurfaceVariant }}>
                      Nenhum comentário ainda. Seja o primeiro!
                    </div>
                  ) : (
                    comments.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 12,
                          background: tokens.surface,
                          border: `1px solid ${tokens.outlineVariant}44`,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <span style={{ fontSize: '0.76rem', fontWeight: 700, color: tokens.onSurface }}>
                            {c.author_name}
                          </span>
                          {(c.is_mine || canPublish) && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteComment(item.id, c.id)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: tokens.error,
                                cursor: 'pointer',
                                padding: 2,
                                display: 'inline-flex',
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: tokens.onSurfaceVariant, whiteSpace: 'pre-wrap' }}>
                          {c.body}
                        </div>
                      </div>
                    ))
                  )}

                  <form
                    onSubmit={(e) => void handleCreateComment(e, item.id)}
                    style={{ display: 'flex', gap: 6, marginTop: 2 }}
                  >
                    <input
                      type="text"
                      value={commentDrafts[item.id] ?? ''}
                      onChange={(e) =>
                        setCommentDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      placeholder="Escreva um comentário..."
                      maxLength={1000}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 999,
                        border: `1px solid ${tokens.outlineVariant}`,
                        background: tokens.surface,
                        color: tokens.onSurface,
                        fontSize: '0.82rem',
                      }}
                    />
                    <button
                      type="submit"
                      style={{
                        padding: '8px 14px',
                        borderRadius: 999,
                        border: 'none',
                        background: tokens.primary,
                        color: tokens.onPrimary,
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Send size={13} />
                    </button>
                  </form>
                </div>
              )}
            </article>
          );
        })
      )}
    </div>
  );
};
