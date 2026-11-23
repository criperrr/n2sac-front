import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  ImagePlus,
  Lightbulb,
  MessageSquareHeart,
  Paperclip,
  RefreshCw,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { fetchMyFeedback, NsacApiClientError, submitFeedback } from '../../api/nsacClient';
import type {
  AccountProfileResponse,
  BugFrequency,
  BugSeverity,
  CreateFeedbackPayload,
  CreatedFeedbackResponse,
  FeedbackArea,
  FeedbackKind,
  FeedbackMineItem,
  FeedbackStatus,
} from '../../api/types';
import { useM3Theme } from '../../theme/ThemeContext';
import {
  EnhancedConnectedButtonGroup,
  EnhancedMorphButton,
  ExpressiveSegmentedCard,
  ExpressiveSwitch,
  IconShapeContainer,
} from '../expressive/ExpressivePrimitives';
import { Expandable } from '../expressive/Expandable';
import { ExpressiveModal, ModalHeader } from '../expressive/ExpressiveModal';
import { PushedPage } from '../expressive/PushedPage';
import { MorphingShapeIndicator } from '../expressive/ShapeMorph';
import { useMinimumBusy } from '../../theme/motion';
import { collectFeedbackDiagnostics } from '../../telemetry/diagnostics';
import { compressImageToDataUrl } from '../../utils/imageCompress';

function firstNameFromEmail(email?: string | null): string {
  if (!email) return 'Aluno';
  const local = email.split('@')[0]?.trim() ?? '';
  const first = local.split(/[._-]/)[0]?.trim() ?? '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : 'Aluno';
}

const MAX_SCREENSHOTS = 3;
const MAX_RAW_IMAGE_BYTES = 15 * 1024 * 1024;

const AREA_OPTIONS: Array<{ id: FeedbackArea; label: string; suggestionOnly?: boolean }> = [
  { id: 'boletim', label: 'Boletim & Notas' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'frequencia', label: 'Fichas & Frequência' },
  { id: 'sentinela', label: 'Alertas' },
  { id: 'social', label: 'Perfil, Amigos & Chat' },
  { id: 'configuracoes', label: 'Configurações & Tema' },
  { id: 'login_update', label: 'Login / Atualização' },
  { id: 'geral', label: 'App no geral' },
  { id: 'nova_funcao', label: 'Nova função', suggestionOnly: true },
];

const AREA_LABELS: Record<string, string> = Object.fromEntries(
  AREA_OPTIONS.map((a) => [a.id, a.label])
);

const SEVERITY_OPTIONS: Array<{ id: BugSeverity; label: string; hint: string }> = [
  { id: 'blocker', label: 'Impede de usar', hint: 'Trava ou bloqueia a tela' },
  { id: 'major', label: 'Atrapalha muito', hint: 'Funciona mal ou quebra fluxo' },
  { id: 'minor', label: 'Detalhe menor', hint: 'Visual, alinhamento ou texto' },
];

const FREQUENCY_OPTIONS: Array<{ id: BugFrequency; label: string }> = [
  { id: 'always', label: 'Sempre' },
  { id: 'sometimes', label: 'Às vezes' },
  { id: 'once', label: '1 vez' },
];

const KIND_META: Record<
  FeedbackKind,
  { label: string; shortLabel: string; pageTitle: string; subtitle: string }
> = {
  bug: {
    label: 'Reportar bug / erro',
    shortLabel: 'Bug',
    pageTitle: 'Reportar bug',
    subtitle: 'Algo quebrou, travou ou exibiu errado (aceita prints)',
  },
  suggestion: {
    label: 'Enviar sugestão',
    shortLabel: 'Sugestão',
    pageTitle: 'Enviar sugestão',
    subtitle: 'Ideias de novos recursos ou melhorias no app',
  },
  feedback: {
    label: 'Enviar feedback',
    shortLabel: 'Feedback',
    pageTitle: 'Enviar feedback',
    subtitle: 'Conte sua experiência geral usando o n²sac',
  },
};

function statusLabel(status: FeedbackStatus): string {
  switch (status) {
    case 'open':
      return 'Recebido';
    case 'triaged':
      return 'Em análise';
    case 'resolved':
      return 'Resolvido';
    case 'dismissed':
      return 'Arquivado';
  }
}

function formatShortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

interface TextQualityCheck {
  ok: boolean;
  chars: number;
  hint: string | null;
}

/** Mirrors backend anti-garbage validation in `nsac-server/src/db/feedback.rs`. */
function evaluateTextQuality(
  raw: string,
  minChars: number,
  maxChars: number,
  minWords: number,
  minDistinctAlnum: number
): TextQualityCheck {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  const chars = [...collapsed].length;
  if (chars === 0) return { ok: false, chars: 0, hint: `Mín. ${minChars} caracteres` };
  if (chars < minChars) {
    return {
      ok: false,
      chars,
      hint: `Faltam ${minChars - chars} caracteres`,
    };
  }
  if (chars > maxChars) {
    return {
      ok: false,
      chars,
      hint: `Passou ${chars - maxChars} do limite de ${maxChars}`,
    };
  }

  const words = collapsed
    .split(' ')
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  if (words < minWords) {
    return {
      ok: false,
      chars,
      hint: `Escreva pelo menos ${minWords} palavras`,
    };
  }

  const distinct = new Set<string>();
  const freq = new Map<string, number>();
  let nonWs = 0;
  for (const ch of collapsed) {
    if (/\s/.test(ch)) continue;
    nonWs += 1;
    const lower = ch.toLowerCase();
    if (/[\p{L}\p{N}]/u.test(lower)) distinct.add(lower);
    freq.set(lower, (freq.get(lower) ?? 0) + 1);
  }
  if (distinct.size < minDistinctAlnum) {
    return {
      ok: false,
      chars,
      hint: 'Texto muito repetitivo — descreva com mais clareza',
    };
  }
  if (nonWs >= 12) {
    let maxCount = 0;
    for (const c of freq.values()) if (c > maxCount) maxCount = c;
    if (maxCount * 100 > nonWs * 60) {
      return {
        ok: false,
        chars,
        hint: 'Evite repetir o mesmo caractere',
      };
    }
  }
  return { ok: true, chars, hint: null };
}

/**
 * Configurações -> "Ajuda & Melhorias":
 * 3 structured entry rows (Bug, Sugestão, Feedback) + "Meus envios" status history.
 */
export const FeedbackSettingsSection: React.FC<{
  token: string;
  accountProfile: AccountProfileResponse | null;
  detectedClassCode: string | null;
}> = ({ token, accountProfile, detectedClassCode }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [composerKind, setComposerKind] = useState<FeedbackKind | null>(null);
  const [history, setHistory] = useState<FeedbackMineItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const showRefreshingHistory = useMinimumBusy(loadingHistory);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const items = await fetchMyFeedback(token);
      setHistory(items);
    } catch (err) {
      setHistoryError(
        err instanceof NsacApiClientError
          ? err.message
          : 'Não foi possível carregar seus envios agora.'
      );
    } finally {
      setLoadingHistory(false);
    }
  }, [token]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const titleStyle: React.CSSProperties = { fontWeight: 800, fontSize: '0.98rem' };
  const subStyle: React.CSSProperties = {
    fontSize: '0.78rem',
    color: tokens.onSurfaceVariant,
    marginTop: 2,
    lineHeight: 1.38,
  };

  const rows: Array<{
    kind: FeedbackKind;
    icon: React.ReactNode;
    containerColor: string;
    contentColor: string;
  }> = [
    {
      kind: 'bug',
      icon: <Bug size={19} />,
      containerColor: tokens.errorContainer,
      contentColor: tokens.onErrorContainer,
    },
    {
      kind: 'suggestion',
      icon: <Lightbulb size={19} />,
      containerColor: tokens.primaryContainer,
      contentColor: tokens.onPrimaryContainer,
    },
    {
      kind: 'feedback',
      icon: <MessageSquareHeart size={19} />,
      containerColor: tokens.tertiaryContainer,
      contentColor: tokens.onTertiaryContainer,
    },
  ];

  const statusColors = (status: FeedbackStatus): { bg: string; fg: string } => {
    switch (status) {
      case 'resolved':
        return { bg: tokens.gradeSuccessContainer, fg: tokens.onGradeSuccessContainer };
      case 'triaged':
        return { bg: tokens.primaryContainer, fg: tokens.onPrimaryContainer };
      case 'dismissed':
        return { bg: tokens.surfaceContainerHighest, fg: tokens.onSurfaceVariant };
      case 'open':
      default:
        return { bg: tokens.secondaryContainer, fg: tokens.onSecondaryContainer };
    }
  };

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        marginTop: isMaterialYou ? 20 : 16,
      }}
    >
      <div
        style={{
          fontSize: '0.74rem',
          fontWeight: 700,
          color: tokens.onSurfaceVariant,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          margin: '0 4px 8px',
        }}
      >
        Ajuda &amp; Melhorias
      </div>

      {rows.map((row, index) => (
        <ExpressiveSegmentedCard
          key={row.kind}
          index={index}
          total={rows.length}
          onClick={() => setComposerKind(row.kind)}
          style={{ padding: '16px 18px', cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <IconShapeContainer
              size={42}
              containerColor={row.containerColor}
              contentColor={row.contentColor}
            >
              {row.icon}
            </IconShapeContainer>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={titleStyle}>{KIND_META[row.kind].label}</div>
              <div style={subStyle}>{KIND_META[row.kind].subtitle}</div>
            </div>
            <ChevronRight size={18} style={{ color: tokens.onSurfaceVariant, flexShrink: 0 }} />
          </div>
        </ExpressiveSegmentedCard>
      ))}

      {/* Meus envios (status history) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '16px 4px 6px',
        }}
      >
        <span
          style={{
            fontSize: '0.74rem',
            fontWeight: 700,
            color: tokens.onSurfaceVariant,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Meus envios {history.length > 0 ? `(${history.length})` : ''}
        </span>
        <EnhancedMorphButton
          type="button"
          size="sm"
          variant="tonal"
          disabled={showRefreshingHistory}
          icon={
            showRefreshingHistory ? (
              <MorphingShapeIndicator size={15} label="Atualizando envios" />
            ) : (
              <RefreshCw size={14} />
            )
          }
          onClick={() => void loadHistory()}
        >
          {showRefreshingHistory ? 'Atualizando…' : 'Atualizar'}
        </EnhancedMorphButton>
      </div>

      {loadingHistory && history.length === 0 ? (
        <ExpressiveSegmentedCard index={0} total={1} style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: tokens.onSurfaceVariant, fontSize: '0.82rem' }}>
            <MorphingShapeIndicator size={20} label="Carregando envios" />
            Carregando seus relatos…
          </div>
        </ExpressiveSegmentedCard>
      ) : historyError ? (
        <ExpressiveSegmentedCard index={0} total={1} style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: tokens.error, fontSize: '0.8rem', fontWeight: 600 }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{historyError}</span>
          </div>
        </ExpressiveSegmentedCard>
      ) : history.length === 0 ? (
        <ExpressiveSegmentedCard index={0} total={1} style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: '0.82rem', color: tokens.onSurfaceVariant, lineHeight: 1.45 }}>
            Você ainda não enviou nenhum bug, sugestão ou feedback. Seus relatos aparecerão aqui com o status atualizado.
          </div>
        </ExpressiveSegmentedCard>
      ) : (
        history.map((item, idx) => {
          const pill = statusColors(item.status);
          return (
            <ExpressiveSegmentedCard
              key={item.id}
              index={idx}
              total={history.length}
              style={{ padding: '14px 18px' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        letterSpacing: '0.03em',
                        color: tokens.onSurfaceVariant,
                      }}
                    >
                      #{item.id} · {KIND_META[item.kind].shortLabel.toUpperCase()}
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        color: tokens.onSurfaceVariant,
                      }}
                    >
                      · {AREA_LABELS[item.area] ?? item.area}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.3 }}>
                    {item.title}
                  </div>
                </div>
                <span
                  style={{
                    flexShrink: 0,
                    padding: '3px 10px',
                    borderRadius: 999,
                    fontSize: '0.71rem',
                    fontWeight: 800,
                    backgroundColor: pill.bg,
                    color: pill.fg,
                  }}
                >
                  {statusLabel(item.status)}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginTop: 6,
                  fontSize: '0.72rem',
                  color: tokens.onSurfaceVariant,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={12} />
                  {formatShortDate(item.created_at)}
                </span>
                {item.attachment_count > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Paperclip size={12} />
                    {item.attachment_count} {item.attachment_count === 1 ? 'print' : 'prints'}
                  </span>
                )}
                {item.rating !== null && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Star size={12} />
                    {item.rating}/5
                  </span>
                )}
              </div>

              {item.dev_note && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '10px 12px',
                    borderRadius: isMaterialYou ? 14 : 8,
                    backgroundColor: tokens.surfaceContainerHigh,
                    borderLeft: `3px solid ${tokens.primary}`,
                    fontSize: '0.8rem',
                    lineHeight: 1.45,
                  }}
                >
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: tokens.primary, marginBottom: 2 }}>
                    Resposta da equipe
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{item.dev_note}</div>
                </div>
              )}
            </ExpressiveSegmentedCard>
          );
        })
      )}

      {composerKind && (
        <FeedbackComposerPage
          token={token}
          initialKind={composerKind}
          accountProfile={accountProfile}
          detectedClassCode={detectedClassCode}
          onClose={() => setComposerKind(null)}
          onSubmitted={() => {
            void loadHistory();
          }}
        />
      )}
    </section>
  );
};

interface ScreenshotDraft {
  id: string;
  dataUrl: string;
  approxKb: number;
}

const FeedbackComposerPage: React.FC<{
  token: string;
  initialKind: FeedbackKind;
  accountProfile: AccountProfileResponse | null;
  detectedClassCode: string | null;
  onClose: () => void;
  onSubmitted: (created: CreatedFeedbackResponse) => void;
}> = ({ token, initialKind, accountProfile, detectedClassCode, onClose, onSubmitted }) => {
  const { tokens, isMaterialYou, settings, effectiveIsDark } = useM3Theme();
  const pageCloseRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [area, setArea] = useState<FeedbackArea | null>(null);
  const [severity, setSeverity] = useState<BugSeverity | null>(null);
  const [frequency, setFrequency] = useState<BugFrequency | null>(null);
  const [rating, setRating] = useState<number | null>(null);

  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState('');
  const [actual, setActual] = useState('');
  const [expected, setExpected] = useState('');
  const [problem, setProblem] = useState('');
  const [proposal, setProposal] = useState('');
  const [message, setMessage] = useState('');

  const [screenshots, setScreenshots] = useState<ScreenshotDraft[]>([]);
  const [uploadingShot, setUploadingShot] = useState(false);
  const [shotError, setShotError] = useState<string | null>(null);

  const [includeContext, setIncludeContext] = useState(true);
  const [contextExpanded, setContextExpanded] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedFeedbackResponse | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const handleSwitchKind = (next: FeedbackKind) => {
    setKind(next);
    setSubmitError(null);
    setShotError(null);
    if (next !== 'bug') setScreenshots([]);
    if (next !== 'suggestion' && area === 'nova_funcao') setArea(null);
    if (next === 'bug') setIncludeContext(true);
  };

  const themeSnapshot = useMemo(
    () => ({
      design_system: settings.designSystem,
      mode: settings.mode,
      dark: effectiveIsDark,
      preset: settings.presetId,
      dynamic_color: settings.useSystemDynamicColor,
    }),
    [settings, effectiveIsDark]
  );

  const technicalContext = useMemo(
    () => collectFeedbackDiagnostics(themeSnapshot),
    // Refresh snapshot when toggling preview or switching category so recent logs stay fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [themeSnapshot, contextExpanded, kind]
  );

  // Live structured validation matching backend rules.
  const titleMin = kind === 'feedback' ? 8 : 10;
  const titleCheck = useMemo(() => evaluateTextQuality(title, titleMin, 100, 2, 5), [title, titleMin]);
  const stepsCheck = useMemo(() => evaluateTextQuality(steps, 20, 1200, 4, 8), [steps]);
  const actualCheck = useMemo(() => evaluateTextQuality(actual, 15, 800, 4, 8), [actual]);
  const expectedTooLong = [...expected.trim()].length > 500;
  const problemCheck = useMemo(() => evaluateTextQuality(problem, 20, 800, 4, 8), [problem]);
  const proposalCheck = useMemo(() => evaluateTextQuality(proposal, 20, 1200, 4, 8), [proposal]);
  const messageCheck = useMemo(() => evaluateTextQuality(message, 25, 1500, 4, 8), [message]);

  const missingItems = useMemo(() => {
    const missing: string[] = [];
    if (!area) missing.push('Área do app');
    if (!titleCheck.ok) missing.push('Título detalhado');
    if (kind === 'bug') {
      if (!severity) missing.push('Gravidade');
      if (!frequency) missing.push('Frequência');
      if (!stepsCheck.ok) missing.push('Passo a passo');
      if (!actualCheck.ok) missing.push('O que aconteceu de errado');
      if (expectedTooLong) missing.push('Resultado esperado dentro do limite');
    } else if (kind === 'suggestion') {
      if (!problemCheck.ok) missing.push('O que falta / incomoda hoje');
      if (!proposalCheck.ok) missing.push('Como você imagina funcionando');
    } else {
      if (!rating) missing.push('Nota de 1 a 5');
      if (!messageCheck.ok) missing.push('Comentário detalhado');
    }
    return missing;
  }, [
    area,
    titleCheck.ok,
    kind,
    severity,
    frequency,
    stepsCheck.ok,
    actualCheck.ok,
    expectedTooLong,
    problemCheck.ok,
    proposalCheck.ok,
    rating,
    messageCheck.ok,
  ]);

  const isValid = missingItems.length === 0;

  const isDirty = Boolean(
    !created &&
      (title.trim() ||
        steps.trim() ||
        actual.trim() ||
        expected.trim() ||
        problem.trim() ||
        proposal.trim() ||
        message.trim() ||
        screenshots.length > 0)
  );

  const handleBeforeClose = useCallback(() => {
    if (!isDirty || submitting) return true;
    setConfirmDiscard(true);
    return false;
  }, [isDirty, submitting]);

  const handlePickScreenshots = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    setShotError(null);
    const slots = MAX_SCREENSHOTS - screenshots.length;
    if (slots <= 0) {
      setShotError(`Limite de ${MAX_SCREENSHOTS} prints por bug.`);
      return;
    }

    const picked = files.slice(0, slots);
    if (files.length > slots) {
      setShotError(`Apenas os primeiros ${slots} print(s) foram adicionados (máx. ${MAX_SCREENSHOTS}).`);
    }

    setUploadingShot(true);
    try {
      const next: ScreenshotDraft[] = [];
      for (const file of picked) {
        if (file.size > MAX_RAW_IMAGE_BYTES) {
          setShotError('Uma das imagens ultrapassa 15 MB e foi ignorada.');
          continue;
        }
        try {
          const dataUrl = await compressImageToDataUrl(file, 1280, 1280, 0.78);
          const approxKb = Math.max(1, Math.round((dataUrl.length * 0.75) / 1024));
          next.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            dataUrl,
            approxKb,
          });
        } catch {
          setShotError('Não foi possível ler uma das imagens selecionadas. Use PNG, JPEG ou WebP.');
        }
      }
      if (next.length > 0) {
        setScreenshots((prev) => [...prev, ...next].slice(0, MAX_SCREENSHOTS));
      }
    } finally {
      setUploadingShot(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !area || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const freshContext = includeContext
      ? (collectFeedbackDiagnostics(themeSnapshot) as unknown as Record<string, unknown>)
      : undefined;

    const payload: CreateFeedbackPayload = {
      kind,
      area,
      title: title.trim(),
      ...(freshContext ? { context: freshContext } : {}),
    };

    if (kind === 'bug') {
      payload.severity = severity ?? undefined;
      payload.frequency = frequency ?? undefined;
      payload.steps_to_reproduce = steps.trim();
      payload.actual_behavior = actual.trim();
      if (expected.trim()) payload.expected_behavior = expected.trim();
      if (screenshots.length > 0) payload.attachments = screenshots.map((s) => s.dataUrl);
    } else if (kind === 'suggestion') {
      payload.problem = problem.trim();
      payload.proposal = proposal.trim();
    } else {
      payload.rating = rating ?? undefined;
      payload.message = message.trim();
    }

    try {
      const res = await submitFeedback(token, payload);
      setCreated(res);
      onSubmitted(res);
    } catch (err) {
      setSubmitError(
        err instanceof NsacApiClientError
          ? err.message
          : 'Não foi possível enviar seu relato agora. Tente novamente.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const authorName = firstNameFromEmail(accountProfile?.nsac_email);
  const authorClass = accountProfile?.class_code ?? detectedClassCode ?? 'CTI';
  const radius = isMaterialYou ? 18 : 10;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    borderRadius: isMaterialYou ? 16 : 10,
    border: `1.5px solid ${tokens.outlineVariant}`,
    backgroundColor: tokens.surfaceContainerLow,
    color: tokens.onSurface,
    fontFamily: 'inherit',
    fontSize: '0.92rem',
    lineHeight: 1.45,
    outline: 'none',
    resize: 'none',
    overflow: 'clip',
    touchAction: 'pan-y',
  };

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: '0.78rem',
    fontWeight: 800,
    color: tokens.onSurface,
    marginBottom: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  };

  const chipStyle = (selected: boolean, accent?: { bg: string; fg: string }): React.CSSProperties => ({
    padding: '8px 13px',
    borderRadius: 999,
    border: `1.5px solid ${selected ? 'transparent' : tokens.outlineVariant}`,
    backgroundColor: selected
      ? (accent?.bg ?? tokens.secondaryContainer)
      : tokens.surfaceContainerLow,
    color: selected ? (accent?.fg ?? tokens.onSecondaryContainer) : tokens.onSurfaceVariant,
    fontFamily: 'inherit',
    fontSize: '0.8rem',
    fontWeight: selected ? 800 : 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    transition: 'background-color 160ms, color 160ms, border-color 160ms',
  });

  const areaChoices = AREA_OPTIONS.filter((a) => !a.suggestionOnly || kind === 'suggestion');

  return (
    <PushedPage
      title={created ? 'Envio confirmado' : KIND_META[kind].pageTitle}
      onClose={onClose}
      beforeClose={handleBeforeClose}
      zIndex={61}
      closeRef={pageCloseRef}
    >
      {created ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '28px 14px 16px',
            gap: 14,
          }}
        >
          <IconShapeContainer
            size={64}
            containerColor={tokens.gradeSuccessContainer}
            contentColor={tokens.onGradeSuccessContainer}
          >
            <CheckCircle2 size={32} />
          </IconShapeContainer>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900 }}>Relato recebido!</div>
            <div style={{ fontSize: '0.86rem', color: tokens.onSurfaceVariant, marginTop: 6, lineHeight: 1.45 }}>
              Protocolo <strong>#{created.id}</strong> · {KIND_META[created.kind].shortLabel} em{' '}
              <strong>{AREA_LABELS[created.area] ?? created.area}</strong>.
              {created.attachment_count > 0 &&
                ` ${created.attachment_count} ${created.attachment_count === 1 ? 'print anexado' : 'prints anexados'}.`}
            </div>
          </div>

          <ExpressiveSegmentedCard
            index={0}
            total={1}
            style={{ width: '100%', maxWidth: 460, padding: '14px 16px', textAlign: 'left' }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: tokens.onSurfaceVariant, textTransform: 'uppercase' }}>
              Título enviado
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.92rem', marginTop: 4 }}>{created.title}</div>
            <div style={{ fontSize: '0.78rem', color: tokens.onSurfaceVariant, marginTop: 8 }}>
              Você pode acompanhar o andamento em <strong>Configurações → Meus envios</strong>.
            </div>
          </ExpressiveSegmentedCard>

          <div style={{ width: '100%', maxWidth: 320, marginTop: 8 }}>
            <EnhancedMorphButton
              size="lg"
              variant="filled"
              fullWidth
              onClick={() => pageCloseRef.current?.()}
            >
              Voltar às Configurações
            </EnhancedMorphButton>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 16, touchAction: 'pan-y' }}
        >
          {/* Category switcher */}
          <EnhancedConnectedButtonGroup<FeedbackKind>
            value={kind}
            onChange={handleSwitchKind}
            options={[
              { value: 'bug', label: 'Bug / Erro', icon: <Bug size={15} /> },
              { value: 'suggestion', label: 'Sugestão', icon: <Lightbulb size={15} /> },
              { value: 'feedback', label: 'Feedback', icon: <MessageSquareHeart size={15} /> },
            ]}
          />

          {/* Identified account notice (no anonymous submissions) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: radius,
              backgroundColor: tokens.surfaceContainerLow,
              color: tokens.onSurfaceVariant,
              fontSize: '0.78rem',
              lineHeight: 1.4,
            }}
          >
            <UserCheck size={16} style={{ color: tokens.primary, flexShrink: 0 }} />
            <span>
              Enviado com sua conta (<strong>{authorName}</strong> · <strong>{authorClass}</strong>). Relatos não são anônimos para evitar spam e permitir retorno.
            </span>
          </div>

          {/* 1. Area selector */}
          <ExpressiveSegmentedCard index={0} total={1} style={{ padding: '16px 18px' }}>
            <div style={sectionLabelStyle}>
              <span>Onde no app? *</span>
              {!area && <span style={{ fontSize: '0.7rem', color: tokens.onSurfaceVariant }}>Obrigatório</span>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {areaChoices.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={area === opt.id}
                  onClick={() => setArea(opt.id)}
                  style={chipStyle(area === opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </ExpressiveSegmentedCard>

          {/* 2. Category-specific selectors */}
          {kind === 'bug' && (
            <ExpressiveSegmentedCard index={0} total={1} style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={sectionLabelStyle}>
                  <span>Gravidade do erro *</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {SEVERITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={severity === opt.id}
                      onClick={() => setSeverity(opt.id)}
                      style={chipStyle(
                        severity === opt.id,
                        opt.id === 'blocker'
                          ? { bg: tokens.errorContainer, fg: tokens.onErrorContainer }
                          : undefined
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {severity && (
                  <div style={{ fontSize: '0.74rem', color: tokens.onSurfaceVariant, marginTop: 6 }}>
                    {SEVERITY_OPTIONS.find((s) => s.id === severity)?.hint}
                  </div>
                )}
              </div>

              <div>
                <div style={sectionLabelStyle}>
                  <span>Com que frequência acontece? *</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={frequency === opt.id}
                      onClick={() => setFrequency(opt.id)}
                      style={chipStyle(frequency === opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </ExpressiveSegmentedCard>
          )}

          {kind === 'feedback' && (
            <ExpressiveSegmentedCard index={0} total={1} style={{ padding: '16px 18px' }}>
              <div style={sectionLabelStyle}>
                <span>Sua nota para o n²sac *</span>
                {rating && <span style={{ fontSize: '0.74rem', color: tokens.primary }}>{rating}/5</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = rating !== null && n <= rating;
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-label={`Nota ${n} de 5`}
                      aria-pressed={rating === n}
                      onClick={() => setRating(n)}
                      style={{
                        flex: 1,
                        height: 44,
                        borderRadius: 14,
                        border: `1.5px solid ${active ? 'transparent' : tokens.outlineVariant}`,
                        backgroundColor: active ? tokens.primaryContainer : tokens.surfaceContainerLow,
                        color: active ? tokens.onPrimaryContainer : tokens.onSurfaceVariant,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        fontFamily: 'inherit',
                        fontWeight: 800,
                        fontSize: '0.86rem',
                        cursor: 'pointer',
                      }}
                    >
                      <Star size={15} fill={active ? 'currentColor' : 'none'} />
                      {n}
                    </button>
                  );
                })}
              </div>
            </ExpressiveSegmentedCard>
          )}

          {/* 3. Structured text fields */}
          <ExpressiveSegmentedCard index={0} total={1} style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label htmlFor="fb-title" style={sectionLabelStyle}>
                <span>Título resumido *</span>
                <FieldCounter check={titleCheck} max={100} tokens={tokens} />
              </label>
              <input
                id="fb-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={110}
                placeholder={
                  kind === 'bug'
                    ? 'Ex: Teclado fecha ao enviar mensagem no chat'
                    : kind === 'suggestion'
                      ? 'Ex: Filtro por bimestre no Ranking da turma'
                      : 'Ex: Novo visual do chat ficou muito fluido'
                }
                style={inputStyle}
              />
              <FieldHint check={titleCheck} tokens={tokens} />
            </div>

            {kind === 'bug' && (
              <>
                <div>
                  <label htmlFor="fb-steps" style={sectionLabelStyle}>
                    <span>Passo a passo para reproduzir *</span>
                    <FieldCounter check={stepsCheck} max={1200} tokens={tokens} />
                  </label>
                  <AutoGrowTextarea
                    id="fb-steps"
                    minRows={3}
                    value={steps}
                    onChange={setSteps}
                    maxLength={1250}
                    placeholder={'1. Abri a tela de...\n2. Cliquei em...\n3. Aconteceu o erro'}
                    style={inputStyle}
                  />
                  <FieldHint check={stepsCheck} tokens={tokens} />
                </div>

                <div>
                  <label htmlFor="fb-actual" style={sectionLabelStyle}>
                    <span>O que aconteceu de errado? *</span>
                    <FieldCounter check={actualCheck} max={800} tokens={tokens} />
                  </label>
                  <AutoGrowTextarea
                    id="fb-actual"
                    minRows={3}
                    value={actual}
                    onChange={setActual}
                    maxLength={850}
                    placeholder="Descreva o erro visual, travamento ou mensagem que apareceu"
                    style={inputStyle}
                  />
                  <FieldHint check={actualCheck} tokens={tokens} />
                </div>

                <div>
                  <label htmlFor="fb-expected" style={sectionLabelStyle}>
                    <span>O que você esperava que acontecesse? (opcional)</span>
                    <span style={{ fontSize: '0.7rem', color: expectedTooLong ? tokens.error : tokens.onSurfaceVariant }}>
                      {[...expected.trim()].length}/500
                    </span>
                  </label>
                  <AutoGrowTextarea
                    id="fb-expected"
                    minRows={2}
                    value={expected}
                    onChange={setExpected}
                    maxLength={520}
                    placeholder="Ex: Deveria manter o teclado aberto após enviar"
                    style={inputStyle}
                  />
                </div>
              </>
            )}

            {kind === 'suggestion' && (
              <>
                <div>
                  <label htmlFor="fb-problem" style={sectionLabelStyle}>
                    <span>O que falta ou incomoda hoje? *</span>
                    <FieldCounter check={problemCheck} max={800} tokens={tokens} />
                  </label>
                  <AutoGrowTextarea
                    id="fb-problem"
                    minRows={3}
                    value={problem}
                    onChange={setProblem}
                    maxLength={850}
                    placeholder="Explique a dificuldade ou o que poderia ser melhor"
                    style={inputStyle}
                  />
                  <FieldHint check={problemCheck} tokens={tokens} />
                </div>

                <div>
                  <label htmlFor="fb-proposal" style={sectionLabelStyle}>
                    <span>Como você imagina isso funcionando? *</span>
                    <FieldCounter check={proposalCheck} max={1200} tokens={tokens} />
                  </label>
                  <AutoGrowTextarea
                    id="fb-proposal"
                    minRows={3}
                    value={proposal}
                    onChange={setProposal}
                    maxLength={1250}
                    placeholder="Descreva sua ideia de forma concreta"
                    style={inputStyle}
                  />
                  <FieldHint check={proposalCheck} tokens={tokens} />
                </div>
              </>
            )}

            {kind === 'feedback' && (
              <div>
                <label htmlFor="fb-message" style={sectionLabelStyle}>
                  <span>Seu comentário *</span>
                  <FieldCounter check={messageCheck} max={1500} tokens={tokens} />
                </label>
                <AutoGrowTextarea
                  id="fb-message"
                  minRows={4}
                  value={message}
                  onChange={setMessage}
                  maxLength={1550}
                  placeholder="Conte o que você mais gostou, o que pode melhorar ou como o app tem te ajudado"
                  style={inputStyle}
                />
                <FieldHint check={messageCheck} tokens={tokens} />
              </div>
            )}
          </ExpressiveSegmentedCard>

          {/* 4. Bug-only screenshots */}
          {kind === 'bug' && (
            <ExpressiveSegmentedCard index={0} total={1} style={{ padding: '16px 18px' }}>
              <div style={sectionLabelStyle}>
                <span>Prints do erro (opcional)</span>
                <span style={{ fontSize: '0.72rem', color: tokens.onSurfaceVariant }}>
                  {screenshots.length}/{MAX_SCREENSHOTS}
                </span>
              </div>
              <div style={{ fontSize: '0.76rem', color: tokens.onSurfaceVariant, marginBottom: 12, lineHeight: 1.4 }}>
                Anexe até {MAX_SCREENSHOTS} imagens (PNG, JPEG ou WebP). Metadados EXIF são removidos automaticamente no servidor.
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(e) => void handlePickScreenshots(e)}
                style={{ display: 'none' }}
              />

              {screenshots.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  {screenshots.map((shot, idx) => (
                    <div
                      key={shot.id}
                      style={{
                        position: 'relative',
                        borderRadius: 14,
                        overflow: 'hidden',
                        aspectRatio: '3 / 4',
                        backgroundColor: tokens.surfaceContainerHighest,
                        border: `1px solid ${tokens.outlineVariant}`,
                      }}
                    >
                      <img
                        src={shot.dataUrl}
                        alt={`Print ${idx + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      <button
                        type="button"
                        aria-label={`Remover print ${idx + 1}`}
                        onClick={() => setScreenshots((prev) => prev.filter((s) => s.id !== shot.id))}
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          border: 'none',
                          backgroundColor: 'rgba(0,0,0,0.68)',
                          color: '#fff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                      <span
                        style={{
                          position: 'absolute',
                          left: 6,
                          bottom: 6,
                          padding: '2px 6px',
                          borderRadius: 999,
                          backgroundColor: 'rgba(0,0,0,0.62)',
                          color: '#fff',
                          fontSize: '0.64rem',
                          fontWeight: 700,
                        }}
                      >
                        ~{shot.approxKb} KB
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {screenshots.length < MAX_SCREENSHOTS && (
                <EnhancedMorphButton
                  type="button"
                  size="md"
                  variant="tonal"
                  fullWidth
                  disabled={uploadingShot}
                  icon={
                    uploadingShot ? (
                      <MorphingShapeIndicator size={16} label="Processando imagem" />
                    ) : (
                      <ImagePlus size={16} />
                    )
                  }
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingShot ? 'Comprimindo print…' : 'Adicionar print'}
                </EnhancedMorphButton>
              )}

              {shotError && (
                <div style={{ marginTop: 8, fontSize: '0.76rem', fontWeight: 700, color: tokens.error }}>
                  {shotError}
                </div>
              )}
            </ExpressiveSegmentedCard>
          )}

          {/* 5. Transparent technical context accordion */}
          <ExpressiveSegmentedCard index={0} total={1} style={{ padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <button
                type="button"
                onClick={() => setContextExpanded((v) => !v)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  color: tokens.onSurface,
                  fontFamily: 'inherit',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                  flex: 1,
                }}
              >
                <ShieldCheck size={16} style={{ color: tokens.primary, flexShrink: 0 }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                  Dados técnicos e logs incluídos ({technicalContext.logs.length} logs · {technicalContext.recent_api.length} reqs)
                </span>
                {contextExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
              {kind !== 'bug' && (
                <ExpressiveSwitch
                  checked={includeContext}
                  onChange={setIncludeContext}
                />
              )}
            </div>

            <Expandable open={contextExpanded}>
              <div
                style={{
                  marginTop: 10,
                  padding: '10px 12px',
                  borderRadius: 12,
                  backgroundColor: tokens.surfaceContainerLow,
                  fontSize: '0.72rem',
                  color: tokens.onSurfaceVariant,
                  lineHeight: 1.5,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  overflowWrap: 'anywhere',
                }}
              >
                <div>
                  App: v{technicalContext.app_version}
                  {technicalContext.native_apk_version ? ` (APK v${technicalContext.native_apk_version})` : ''} · {technicalContext.platform}
                </div>
                <div>
                  Sessão: {technicalContext.uptime_secs}s online={String(technicalContext.online)} · {technicalContext.timezone}
                </div>
                {technicalContext.viewport && (
                  <div>
                    Tela: {technicalContext.viewport.width}×{technicalContext.viewport.height} @{technicalContext.viewport.dpr}x · DOM {technicalContext.runtime.dom_nodes}
                    {technicalContext.runtime.js_heap_used_mb !== null
                      ? ` · Heap ${technicalContext.runtime.js_heap_used_mb} MB`
                      : ''}
                  </div>
                )}
                <div>
                  HW: {String(technicalContext.hardware.cpu_cores ?? '?')} cores ·{' '}
                  {String(technicalContext.hardware.device_memory_gb ?? '?')} GB RAM ·{' '}
                  {String(technicalContext.hardware.network_type ?? 'net?')}
                </div>
                {Boolean(technicalContext.hardware.gpu_renderer) && (
                  <div>GPU: {String(technicalContext.hardware.gpu_renderer)}</div>
                )}
                <div>
                  Tema: {technicalContext.theme.design_system} · {technicalContext.theme.dark ? 'escuro' : 'claro'} ({technicalContext.theme.preset})
                </div>
                {technicalContext.last_ui_error && (
                  <div style={{ color: tokens.error }}>
                    Último erro UI: {technicalContext.last_ui_error.name}: {technicalContext.last_ui_error.message}
                  </div>
                )}
                {technicalContext.recent_api.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontWeight: 700, color: tokens.onSurface }}>
                      API recente ({technicalContext.recent_api.length}):
                    </div>
                    {technicalContext.recent_api.slice(-4).map((r, i) => (
                      <div key={i}>
                        [{r.t}] {r.method} {r.path} → {r.status} ({r.ms}ms)
                      </div>
                    ))}
                  </div>
                )}
                {technicalContext.logs.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontWeight: 700, color: tokens.onSurface }}>
                      Logs recentes ({technicalContext.logs.length}):
                    </div>
                    {technicalContext.logs.slice(-5).map((l, i) => (
                      <div key={i}>
                        [{l.t}] {l.level.toUpperCase()}: {l.msg}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 6, fontFamily: 'inherit', fontStyle: 'italic' }}>
                  Tokens, cookies, senhas e corpos de mensagens nunca são incluídos.
                </div>
              </div>
            </Expandable>
          </ExpressiveSegmentedCard>

          {/* Checklist hint + submit error + CTA */}
          {!isValid && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: radius,
                backgroundColor: tokens.surfaceContainerLow,
                fontSize: '0.76rem',
                color: tokens.onSurfaceVariant,
                lineHeight: 1.45,
              }}
            >
              <strong>Falta preencher:</strong> {missingItems.join(' · ')}
            </div>
          )}

          {submitError && (
            <div
              role="alert"
              style={{
                padding: '12px 14px',
                borderRadius: radius,
                backgroundColor: tokens.errorContainer,
                color: tokens.onErrorContainer,
                fontSize: '0.82rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{submitError}</span>
            </div>
          )}

          <EnhancedMorphButton
            type="submit"
            size="lg"
            variant="filled"
            fullWidth
            disabled={!isValid || submitting || uploadingShot}
            icon={
              submitting ? (
                <MorphingShapeIndicator size={18} label="Enviando relato" />
              ) : (
                <Send size={17} />
              )
            }
          >
            {submitting ? 'Enviando…' : `Enviar ${KIND_META[kind].shortLabel.toLowerCase()}`}
          </EnhancedMorphButton>
        </form>
      )}

      {confirmDiscard && (
        <ExpressiveModal
          onClose={() => setConfirmDiscard(false)}
          maxWidth={380}
          zIndex={70}
          ariaLabel="Descartar rascunho"
        >
          {(closeModal) => (
            <>
              <ModalHeader
                icon={<Trash2 size={18} />}
                eyebrow="Rascunho não enviado"
                title="Descartar relato?"
                onClose={() => closeModal()}
              />
              <div style={{ fontSize: '0.84rem', color: tokens.onSurfaceVariant, lineHeight: 1.45, marginTop: 8 }}>
                O texto e os prints preenchidos serão perdidos.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <EnhancedMorphButton
                  type="button"
                  size="md"
                  variant="tonal"
                  fullWidth
                  onClick={() => closeModal()}
                >
                  Continuar editando
                </EnhancedMorphButton>
                <EnhancedMorphButton
                  type="button"
                  size="md"
                  variant="error"
                  fullWidth
                  onClick={() => closeModal(() => pageCloseRef.current?.())}
                >
                  Descartar
                </EnhancedMorphButton>
              </div>
            </>
          )}
        </ExpressiveModal>
      )}
    </PushedPage>
  );
};

const FieldCounter: React.FC<{
  check: TextQualityCheck;
  max: number;
  tokens: ReturnType<typeof useM3Theme>['tokens'];
}> = ({ check, max, tokens }) => (
  <span
    style={{
      fontSize: '0.7rem',
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      color:
        check.chars > max
          ? tokens.error
          : check.ok
            ? tokens.primary
            : tokens.onSurfaceVariant,
    }}
  >
    {check.chars}/{max}
  </span>
);

const FieldHint: React.FC<{
  check: TextQualityCheck;
  tokens: ReturnType<typeof useM3Theme>['tokens'];
}> = ({ check, tokens }) => {
  if (check.chars === 0 || check.ok || !check.hint) return null;
  return (
    <div style={{ marginTop: 4, fontSize: '0.72rem', fontWeight: 600, color: tokens.onSurfaceVariant }}>
      {check.hint}
    </div>
  );
};

/**
 * Non-scrolling auto-growing textarea so Android Chromium WebView never creates a nested
 * scroll container that traps vertical touch drags starting on text fields.
 */
const AutoGrowTextarea: React.FC<{
  id: string;
  minRows: number;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder: string;
  style: React.CSSProperties;
}> = ({ id, minRows, value, onChange, maxLength, placeholder, style }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const minHeight = Math.round(minRows * 21.5 + 24);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [value, minHeight]);

  return (
    <textarea
      ref={ref}
      id={id}
      rows={minRows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={maxLength}
      placeholder={placeholder}
      style={{
        ...style,
        minHeight,
        resize: 'none',
        overflow: 'clip',
        touchAction: 'pan-y',
      }}
    />
  );
};
