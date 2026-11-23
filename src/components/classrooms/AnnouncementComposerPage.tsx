import React, { useMemo, useRef, useState } from 'react';
import { Bell, Calendar, ImagePlus, Pin, Plus, Search, Send, Tag, Trash2, X } from 'lucide-react';
import { createClassroomAnnouncement, NsacApiClientError } from '../../api/nsacClient';
import type { AnnouncementItem } from '../../api/types';
import { useM3Theme } from '../../theme/ThemeContext';
import { compressImageToDataUrl } from '../../utils/imageCompress';
import {
  DEFAULT_ANNOUNCEMENT_TAGS,
  displayAnnouncementTag,
  formatAnnouncementTag,
  MAX_TAG_CHARS,
  MAX_TAG_WORDS,
  MAX_VISIBLE_TAGS,
  tagSearchKey,
  validateAnnouncementTag,
} from '../../utils/announcementTags';
import { PushedPage } from '../expressive/PushedPage';
import { EnhancedMorphButton, ExpressiveSegmentedCard } from '../expressive/ExpressivePrimitives';
import { ExpressiveModal, ModalHeader } from '../expressive/ExpressiveModal';
import { MorphingShapeIndicator } from '../expressive/ShapeMorph';

export const AnnouncementComposerPage: React.FC<{
  token: string;
  classCode: string;
  existingTags?: string[];
  onClose: () => void;
  onPublished: (item: AnnouncementItem) => void;
}> = ({ token, classCode, existingTags = [], onClose, onPublished }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [selectedTag, setSelectedTag] = useState<string>('Geral');
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [newTagDraft, setNewTagDraft] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);
  const [allTagsOpen, setAllTagsOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState('');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [pinned, setPinned] = useState(false);
  const [notifyPush, setNotifyPush] = useState(true);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const radius = isMaterialYou ? 18 : 12;

  const allTags = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    const push = (raw: string) => {
      const label = displayAnnouncementTag(raw);
      const key = tagSearchKey(label);
      if (!key || seen.has(key)) return;
      seen.add(key);
      list.push(label);
    };
    // Newly created tags first, then room's existing tags, then defaults
    for (const t of customTags) push(t);
    for (const t of existingTags) push(t);
    for (const t of DEFAULT_ANNOUNCEMENT_TAGS) push(t);
    return list;
  }, [customTags, existingTags]);

  const visibleTags = useMemo(() => {
    const base = allTags.slice(0, MAX_VISIBLE_TAGS);
    const selKey = tagSearchKey(selectedTag);
    if (!base.some((t) => tagSearchKey(t) === selKey)) {
      const found = allTags.find((t) => tagSearchKey(t) === selKey);
      if (found) return [found, ...base.slice(0, MAX_VISIBLE_TAGS - 1)];
    }
    return base;
  }, [allTags, selectedTag]);

  const hiddenCount = Math.max(0, allTags.length - visibleTags.length);

  const filteredModalTags = useMemo(() => {
    const q = tagSearchKey(tagSearch);
    if (!q) return allTags;
    return allTags.filter((t) => tagSearchKey(t).includes(q));
  }, [allTags, tagSearch]);

  const draftPreview = useMemo(() => formatAnnouncementTag(newTagDraft), [newTagDraft]);

  const handleAddCustomTag = () => {
    const res = validateAnnouncementTag(newTagDraft);
    if (!res.ok) {
      setTagError(res.error);
      return;
    }
    setTagError(null);
    setCustomTags((prev) => {
      const key = tagSearchKey(res.value);
      if (prev.some((t) => tagSearchKey(t) === key)) return prev;
      return [res.value, ...prev];
    });
    setSelectedTag(res.value);
    setNewTagDraft('');
  };

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.max(120, el.scrollHeight)}px`;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const compressed = await compressImageToDataUrl(file, 1280, 1280, 0.82);
      setImageDataUrl(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a imagem.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() && !imageDataUrl) {
      setError('Escreva o conteúdo do anúncio ou adicione uma imagem.');
      return;
    }
    const validatedTag = validateAnnouncementTag(selectedTag);
    if (!validatedTag.ok) {
      setError(validatedTag.error);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createClassroomAnnouncement(token, {
        category: validatedTag.value,
        title: title.trim(),
        body: body.trim(),
        event_date: eventDate.trim() || null,
        pinned,
        notify_push: notifyPush,
        image_data_url: imageDataUrl,
      });
      onPublished(created);
      onClose();
    } catch (err) {
      setError(err instanceof NsacApiClientError ? err.message : 'Não foi possível publicar o anúncio.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PushedPage title={`Novo Anúncio • ${classCode}`} onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        data-no-size-morph
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          paddingBottom: 32,
          touchAction: 'pan-y',
        }}
      >
        <ExpressiveSegmentedCard
          index={0}
          total={1}
          style={{
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            touchAction: 'pan-y',
          }}
        >
          {/* Tags picker + custom tag creator */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 700, color: tokens.onSurfaceVariant, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Tag size={13} /> Tag
              </span>
              <span style={{ fontSize: '0.7rem', color: tokens.onSurfaceVariant }}>
                máx. {MAX_TAG_WORDS} palavras · {MAX_TAG_CHARS} caracteres
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {visibleTags.map((tagLabel) => {
                const selected = tagSearchKey(selectedTag) === tagSearchKey(tagLabel);
                return (
                  <button
                    key={tagLabel}
                    type="button"
                    onClick={() => setSelectedTag(tagLabel)}
                    style={{
                      padding: '6px 13px',
                      borderRadius: 999,
                      border: `1px solid ${selected ? tokens.primary : tokens.outlineVariant}`,
                      backgroundColor: selected ? tokens.primaryContainer : tokens.surfaceContainerHigh,
                      color: selected ? tokens.onPrimaryContainer : tokens.onSurface,
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      touchAction: 'pan-y',
                    }}
                  >
                    {tagLabel}
                  </button>
                );
              })}

              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setTagSearch('');
                    setAllTagsOpen(true);
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 999,
                    border: `1px dashed ${tokens.outline}`,
                    backgroundColor: 'transparent',
                    color: tokens.primary,
                    fontWeight: 800,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    touchAction: 'pan-y',
                  }}
                >
                  <Search size={13} /> +{hiddenCount} tags
                </button>
              )}
            </div>

            {/* Inline custom tag creator */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <input
                type="text"
                maxLength={MAX_TAG_CHARS}
                placeholder="Criar nova tag (ex.: Feira CTI)"
                value={newTagDraft}
                onChange={(e) => {
                  setNewTagDraft(e.target.value);
                  if (tagError) setTagError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomTag();
                  }
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  boxSizing: 'border-box',
                  height: 40,
                  padding: '0 12px',
                  borderRadius: 14,
                  border: `1.5px solid ${tagError ? tokens.error : tokens.outlineVariant}`,
                  backgroundColor: tokens.surfaceContainerLowest,
                  color: tokens.onSurface,
                  fontSize: '0.84rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                  touchAction: 'pan-y',
                }}
              />
              <button
                type="button"
                onClick={handleAddCustomTag}
                disabled={!newTagDraft.trim()}
                style={{
                  height: 40,
                  padding: '0 14px',
                  borderRadius: 14,
                  border: 'none',
                  backgroundColor: newTagDraft.trim() ? tokens.primary : tokens.surfaceContainerHighest,
                  color: newTagDraft.trim() ? tokens.onPrimary : tokens.onSurfaceVariant,
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  cursor: newTagDraft.trim() ? 'pointer' : 'default',
                  flexShrink: 0,
                  touchAction: 'pan-y',
                }}
              >
                <Plus size={15} /> Usar
              </button>
            </div>
            {(tagError || draftPreview) && (
              <div
                style={{
                  marginTop: 5,
                  fontSize: '0.72rem',
                  color: tagError ? tokens.error : tokens.onSurfaceVariant,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span>{tagError ? tagError : `Formato: ${draftPreview}`}</span>
                <span>{draftPreview.length}/{MAX_TAG_CHARS}</span>
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: tokens.onSurfaceVariant, marginBottom: 6 }}>
              Título (opcional)
            </label>
            <input
              type="text"
              maxLength={120}
              placeholder="Ex.: Prova de Física — Capítulo 4"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                height: 46,
                padding: '0 14px',
                borderRadius: radius,
                border: `1.5px solid ${tokens.outlineVariant}`,
                backgroundColor: tokens.surfaceContainerLowest,
                color: tokens.onSurface,
                fontSize: '0.94rem',
                fontFamily: 'inherit',
                outline: 'none',
                touchAction: 'pan-y',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: tokens.onSurfaceVariant, marginBottom: 6 }}>
              Mensagem do anúncio
            </label>
            <textarea
              ref={textareaRef}
              rows={5}
              maxLength={2000}
              placeholder="Escreva todos os detalhes importantes para a turma..."
              value={body}
              onChange={handleBodyChange}
              style={{
                width: '100%',
                minHeight: 120,
                boxSizing: 'border-box',
                padding: '12px 14px',
                borderRadius: radius,
                border: `1.5px solid ${tokens.outlineVariant}`,
                backgroundColor: tokens.surfaceContainerLowest,
                color: tokens.onSurface,
                fontSize: '0.92rem',
                fontFamily: 'inherit',
                lineHeight: 1.5,
                resize: 'none',
                overflowY: 'hidden',
                touchAction: 'pan-y',
                outline: 'none',
              }}
            />
            <div style={{ textAlign: 'right', fontSize: '0.72rem', color: tokens.onSurfaceVariant, marginTop: 4 }}>
              {body.length} / 2000
            </div>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', fontWeight: 700, color: tokens.onSurfaceVariant, marginBottom: 6 }}>
              <Calendar size={14} /> Data de referência (opcional)
            </label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                height: 44,
                padding: '0 14px',
                borderRadius: radius,
                border: `1.5px solid ${tokens.outlineVariant}`,
                backgroundColor: tokens.surfaceContainerLowest,
                color: tokens.onSurface,
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                touchAction: 'pan-y',
              }}
            />
          </div>

          {/* Image attachment (touchAction: pan-y so starting a scroll here always scrolls the page) */}
          <div style={{ touchAction: 'pan-y' }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            {imageDataUrl ? (
              <div
                style={{
                  position: 'relative',
                  borderRadius: radius,
                  overflow: 'hidden',
                  border: `1px solid ${tokens.outlineVariant}`,
                  touchAction: 'pan-y',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                }}
              >
                <img
                  src={imageDataUrl}
                  alt="Prévia do anexo"
                  draggable={false}
                  style={{
                    width: '100%',
                    maxHeight: 260,
                    objectFit: 'cover',
                    display: 'block',
                    pointerEvents: 'none',
                    touchAction: 'pan-y',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setImageDataUrl(null)}
                  aria-label="Remover imagem"
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    border: 'none',
                    backgroundColor: 'rgba(0,0,0,0.65)',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{
                  width: '100%',
                  minHeight: 46,
                  padding: '10px 16px',
                  borderRadius: radius,
                  border: `1.5px dashed ${tokens.outline}`,
                  backgroundColor: tokens.surfaceContainerLowest,
                  color: tokens.primary,
                  fontFamily: 'inherit',
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  touchAction: 'pan-y',
                }}
              >
                <ImagePlus size={17} /> Anexar imagem (foto do quadro, cronograma…)
              </button>
            )}
          </div>

          {/* Toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4, touchAction: 'pan-y' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer', touchAction: 'pan-y' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', fontWeight: 700 }}>
                <Bell size={16} color={tokens.primary} /> Notificar turma em alta prioridade
              </span>
              <input
                type="checkbox"
                checked={notifyPush}
                onChange={(e) => setNotifyPush(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: tokens.primary }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer', touchAction: 'pan-y' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', fontWeight: 700 }}>
                <Pin size={16} color={tokens.primary} /> Fixar anúncio no topo
              </span>
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: tokens.primary }}
              />
            </label>
          </div>
        </ExpressiveSegmentedCard>

        {error && (
          <div
            role="alert"
            style={{
              padding: '12px 16px',
              borderRadius: 16,
              backgroundColor: tokens.errorContainer,
              color: tokens.onErrorContainer,
              fontSize: '0.84rem',
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        <EnhancedMorphButton
          type="submit"
          size="lg"
          variant="filled"
          fullWidth
          disabled={submitting}
          icon={submitting ? <MorphingShapeIndicator size={18} label="Publicando" /> : <Send size={17} />}
        >
          {submitting ? 'Publicando anúncio…' : 'Publicar anúncio para a turma'}
        </EnhancedMorphButton>
      </form>

      {allTagsOpen && (
        <ExpressiveModal
          ariaLabel="Todas as tags"
          onClose={() => setAllTagsOpen(false)}
          maxWidth={440}
        >
          {(close) => (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ModalHeader
                icon={<Tag size={18} />}
                eyebrow={`Turma ${classCode}`}
                title="Escolher tag"
                onClose={() => close(() => setAllTagsOpen(false))}
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

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                {filteredModalTags.length === 0 ? (
                  <div style={{ fontSize: '0.84rem', color: tokens.onSurfaceVariant, padding: '8px 0' }}>
                    Nenhuma tag encontrada para “{tagSearch}”.
                  </div>
                ) : (
                  filteredModalTags.map((tagLabel) => {
                    const selected = tagSearchKey(selectedTag) === tagSearchKey(tagLabel);
                    return (
                      <button
                        key={tagLabel}
                        type="button"
                        onClick={() => {
                          setSelectedTag(tagLabel);
                          close(() => setAllTagsOpen(false));
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
                        }}
                      >
                        {tagLabel}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </ExpressiveModal>
      )}
    </PushedPage>
  );
};
