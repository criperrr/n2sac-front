import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  Crown,
  Flame,
  GraduationCap,
  Info,
  Layers,
  Maximize2,
  Moon,
  Scale,
  Search,
  Sparkles,
  Sun,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react';
import {
  fetchClassroomComparison,
  fetchClassroomRanking,
  getCachedClassroomComparison,
  getCachedClassroomRanking,
  invalidateCompareCache,
  type ClassroomRankingParams,
} from '../api/nsacClient';
import type {
  ClassroomComparisonDetail,
  ClassroomCourseFamily,
  ClassroomLeaderboardEntry,
  ClassroomModality,
  ClassroomRankingResponse,
  ClassroomRankingScope,
  ClassroomRankingSortBy,
  CohortHighlightItem,
} from '../api/types';
import { useM3Theme } from '../theme/ThemeContext';
import {
  EnhancedConnectedButtonGroup,
  EnhancedMorphButton,
  ExpressiveSegmentedCard,
  RevealNumber,
} from './expressive/ExpressivePrimitives';
import { ExpressiveModal, ModalHeader, ModalIconButton, useTransformOrigin } from './expressive/ExpressiveModal';
import { OverlayPage } from './expressive/OverlayPage';
import { MorphingLoadingState, shapePaths } from './expressive/ShapeMorph';
import { ClassroomComparisonPanel } from './ClassroomComparisonPanel';

const SUBJECT_SEARCH_DEBOUNCE_MS = 280;
const CROWN_HALO_PATH = shapePaths(49)[0]!;

function courseLabel(family: ClassroomCourseFamily): string {
  switch (family) {
    case 'informatica':
      return 'Informática';
    case 'eletronica':
      return 'Eletrônica';
    case 'mecanica':
      return 'Mecânica';
    default:
      return 'CTI';
  }
}

function modalityLabel(mod: ClassroomModality): string {
  switch (mod) {
    case 'integrado':
      return 'Integrado';
    case 'noturno':
      return 'Noturno';
    default:
      return 'Regular';
  }
}

function crownLabelForSort(sortBy: ClassroomRankingSortBy): string {
  switch (sortBy) {
    case 'raw_average':
      return 'Maior média bruta (M.T.)';
    case 'momentum':
      return 'Maior evolução das salas';
    case 'consistency':
      return 'Sala mais constante';
    case 'official_average':
    default:
      return 'Maior Score CTI das salas';
  }
}

function highlightIconForKind(kind: CohortHighlightItem['kind']): React.ReactNode {
  switch (kind) {
    case 'leader':
      return <Crown size={14} strokeWidth={2.4} />;
    case 'top_riser':
      return <TrendingUp size={14} />;
    case 'most_consistent':
      return <Target size={14} />;
    case 'hardest_subject':
      return <Flame size={14} />;
    default:
      return <Trophy size={14} />;
  }
}

export const ClassroomRankingView: React.FC<{
  token: string;
  classCode: string | null;
  refreshSignal?: number;
  onRefreshingChange?: (busy: boolean) => void;
}> = ({ token, classCode, refreshSignal = 0, onRefreshingChange }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [scope, setScope] = useState<ClassroomRankingScope>('all');
  const [sortBy, setSortBy] = useState<ClassroomRankingSortBy>('official_average');
  const [commonOnly, setCommonOnly] = useState<boolean | null>(null);
  const [showCommonSubjectsList, setShowCommonSubjectsList] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [bimester, setBimester] = useState<number>(0);
  const [subjectSearch, setSubjectSearch] = useState('');
  const [debouncedSubject, setDebouncedSubject] = useState('');
  const [selectedPeerClass, setSelectedPeerClass] = useState<string | null>(null);
  const { originRef: peerOriginRef, onClickCapture: capturePeerOrigin } = useTransformOrigin();

  const [data, setData] = useState<ClassroomRankingResponse | null>(() =>
    getCachedClassroomRanking({ scope: 'all', sortBy: 'official_average', commonOnly: null, bimester: null })
  );
  const [comparison, setComparison] = useState<ClassroomComparisonDetail | null>(null);
  const [comparisonExpanded, setComparisonExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [peerLoading, setPeerLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const forceRefreshNextRef = useRef(false);
  const onRefreshingChangeRef = useRef(onRefreshingChange);
  onRefreshingChangeRef.current = onRefreshingChange;

  useEffect(() => {
    onRefreshingChangeRef.current?.(loading || peerLoading);
    return () => {
      onRefreshingChangeRef.current?.(false);
    };
  }, [loading, peerLoading]);

  useEffect(() => {
    if (!refreshSignal) return;
    invalidateCompareCache();
    forceRefreshNextRef.current = true;
    setRefreshNonce((n) => n + 1);
  }, [refreshSignal]);

  useEffect(() => {
    const trimmed = subjectSearch.trim();
    if (trimmed === debouncedSubject) return;
    const timer = window.setTimeout(() => setDebouncedSubject(trimmed), SUBJECT_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [subjectSearch, debouncedSubject]);

  useEffect(() => {
    const queryParams: ClassroomRankingParams = {
      scope,
      sortBy,
      commonOnly,
      year: selectedYear ?? undefined,
      bimester: bimester === 0 ? null : bimester,
      subject: debouncedSubject || undefined,
      forceRefresh: forceRefreshNextRef.current,
    };
    forceRefreshNextRef.current = false;

    const cached = !queryParams.forceRefresh ? getCachedClassroomRanking(queryParams) : null;
    if (cached) {
      setData(cached);
    }

    const controller = new AbortController();
    setLoading(true);

    fetchClassroomRanking(token, queryParams, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        startTransition(() => setData(res));
      })
      .catch(() => {
        // Keep stale data visible on transient errors.
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [token, scope, sortBy, commonOnly, selectedYear, bimester, debouncedSubject, refreshNonce]);

  useEffect(() => {
    if (!selectedPeerClass) {
      setComparison(null);
      setPeerLoading(false);
      setComparisonError(false);
      return;
    }

    const params = {
      year: selectedYear ?? undefined,
      bimester: bimester === 0 ? null : bimester,
      subject: debouncedSubject || undefined,
    };
    const cached = getCachedClassroomComparison(selectedPeerClass, params);
    if (cached) {
      setComparison(cached);
      setPeerLoading(false);
      setComparisonError(false);
      return;
    }

    const controller = new AbortController();
    setComparison(null);
    setPeerLoading(true);
    setComparisonError(false);

    fetchClassroomComparison(token, selectedPeerClass, params, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return;
        setComparison(detail);
      })
      .catch(() => {
        if (!controller.signal.aborted) setComparisonError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPeerLoading(false);
      });

    return () => controller.abort();
  }, [token, selectedPeerClass, selectedYear, bimester, debouncedSubject, refreshNonce]);

  const effectiveClassCode = data?.my_class_code ?? classCode;
  const availableYears = useMemo(() => {
    const yrs = data?.available_years ?? [];
    if (yrs.length > 0) return yrs;
    return data?.school_year ? [data.school_year] : [];
  }, [data?.available_years, data?.school_year]);
  const activeYear = selectedYear ?? data?.school_year ?? availableYears[0] ?? null;
  const activeSortBy: ClassroomRankingSortBy = data?.sort_by ?? sortBy;
  const effectiveCommonOnly = data?.common_only ?? false;
  const commonSubjects = data?.common_subjects ?? [];
  const availableSubjects = data?.available_subjects ?? [];
  const highlights = data?.highlights ?? [];
  const showCommonBar =
    !debouncedSubject &&
    (commonSubjects.length > 0 ||
      Boolean(data?.common_subjects_note) ||
      scope === 'all' ||
      scope === 'grade_level' ||
      scope === 'course' ||
      scope === 'integrado' ||
      scope === 'noturno');

  const closeComparison = useCallback(() => {
    setComparisonExpanded(false);
    setSelectedPeerClass(null);
  }, []);

  const comparisonLoading = selectedPeerClass !== null && (peerLoading || (!comparison && !comparisonError));
  const comparisonEyebrow = data
    ? `${data.bimester ? `${data.bimester}º Bimestre` : 'Ano todo'} • ${data.school_year}`
    : 'Comparação de Salas';
  const comparisonTitle = `${effectiveClassCode ?? 'Sua Sala'} vs ${selectedPeerClass ?? 'Sala'}`;

  const comparisonBody = comparisonLoading ? (
    <MorphingLoadingState label="Comparando salas..." />
  ) : comparison ? (
    <ClassroomComparisonPanel comparison={comparison} wide={comparisonExpanded} />
  ) : (
    <div style={{ marginTop: 18, color: tokens.onSurfaceVariant, fontSize: '0.86rem' }}>
      Não foi possível carregar a comparação entre salas agora.
    </div>
  );

  const renderPrimaryMetric = (entry: ClassroomLeaderboardEntry) => {
    switch (activeSortBy) {
      case 'momentum': {
        const mom = entry.momentum_delta ?? null;
        const momColor =
          mom === null
            ? tokens.onSurfaceVariant
            : mom > 0.05
              ? tokens.gradeSuccess
              : mom < -0.05
                ? tokens.error
                : tokens.primary;
        return (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, textTransform: 'uppercase' }}>
              Evolução
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', color: momColor }}>
              {mom !== null ? <RevealNumber value={mom} decimals={2} showPlusSign /> : '—'}
            </div>
            <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>
              M.T. {entry.official_average.toFixed(2)}
            </div>
          </div>
        );
      }
      case 'consistency': {
        const std = entry.consistency_stddev ?? null;
        const cScore = entry.consistency_score ?? null;
        if (cScore !== null) {
          const clamped = Math.max(0, Math.min(10, cScore));
          return (
            <div style={{ textAlign: 'right' }}>
              <div
                title="Índice de constância CARA de 0,00 a 10,00 entre as matérias da sala"
                style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, textTransform: 'uppercase' }}
              >
                Índice
              </div>
              <div style={{ fontWeight: 800, fontSize: '1.15rem', color: tokens.primary, fontVariantNumeric: 'tabular-nums' }}>
                <RevealNumber value={clamped} decimals={2} />
              </div>
              <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>
                {std !== null ? `±${std.toFixed(2)} • ` : ''}M.T. {entry.official_average.toFixed(2)}
              </div>
            </div>
          );
        }
        return (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, textTransform: 'uppercase' }}>
              Desvio
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', color: tokens.primary }}>
              {std !== null ? <RevealNumber value={std} decimals={2} prefix="±" /> : '—'}
            </div>
            <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>
              M.T. {entry.official_average.toFixed(2)}
            </div>
          </div>
        );
      }
      case 'raw_average':
        return (
          <div style={{ textAlign: 'right' }}>
            <div
              title="Média aritmética bruta das Médias da Turma (M.T.) oficiais no recorte selecionado"
              style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, textTransform: 'uppercase' }}
            >
              Média Bruta
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', color: tokens.primary, fontVariantNumeric: 'tabular-nums' }}>
              <RevealNumber value={entry.official_average} decimals={2} />
            </div>
            {entry.calibrated_score != null && (
              <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>
                Score CTI {Math.max(0, Math.min(10, entry.calibrated_score)).toFixed(2)}
              </div>
            )}
          </div>
        );
      case 'official_average':
      default:
        if (entry.calibrated_score != null) {
          const clamped = Math.max(0, Math.min(10, entry.calibrated_score));
          return (
            <div style={{ textAlign: 'right' }}>
              <div
                title="Score CTI de 0,00 a 10,00: média oficial (M.T.) calibrada pela dificuldade das matérias compartilhadas entre cursos"
                style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, textTransform: 'uppercase' }}
              >
                Score CTI
              </div>
              <div style={{ fontWeight: 800, fontSize: '1.15rem', color: tokens.primary, fontVariantNumeric: 'tabular-nums' }}>
                <RevealNumber value={clamped} decimals={2} />
              </div>
              <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>
                M.T. {entry.official_average.toFixed(2)}
              </div>
            </div>
          );
        }
        return (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, textTransform: 'uppercase' }}>
              Média M.T.
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', color: tokens.primary }}>
              <RevealNumber value={entry.official_average} decimals={2} />
            </div>
          </div>
        );
    }
  };

  return (
    <div onClickCapture={capturePeerOrigin} style={{ display: 'flex', flexDirection: 'column', gap: isMaterialYou ? 16 : 14 }}>
      {/* Info banner + filters */}
      <section
        style={{
          borderRadius: isMaterialYou ? 28 : 16,
          padding: isMaterialYou ? '18px 20px' : '20px 22px',
          backgroundColor: isMaterialYou ? tokens.surfaceContainerLow : tokens.background,
          border: `1px solid ${tokens.outlineVariant}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: '0.8rem', color: tokens.onSurfaceVariant, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={16} color={tokens.primary} />
            <span>
              Baseado na <strong>Média da Turma (M.T.)</strong> oficial do NSAC — nenhuma nota individual é exposta.
            </span>
          </div>

          {data?.my_class_rank != null && (
            <div
              style={{
                padding: '6px 12px',
                borderRadius: isMaterialYou ? 999 : 10,
                backgroundColor: tokens.primaryContainer,
                color: tokens.onPrimaryContainer,
                fontWeight: 700,
                fontSize: '0.82rem',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {effectiveClassCode}: #{data.my_class_rank} de {data.total_classes}
            </div>
          )}
        </div>

        {/* Scope & Year / Bimester Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <EnhancedConnectedButtonGroup<ClassroomRankingScope>
            wrap={true}
            value={scope}
            onChange={(s) => {
              setScope(s);
              setCommonOnly(null);
              setShowCommonSubjectsList(false);
            }}
            options={[
              { value: 'all', label: 'Todo o CTI', icon: <Trophy size={14} /> },
              { value: 'grade_level', label: 'Mesmo Ano', icon: <GraduationCap size={14} /> },
              { value: 'course', label: 'Mesmo Curso', icon: <Layers size={14} /> },
              { value: 'integrado', label: 'Integrado', icon: <Sun size={14} /> },
              { value: 'noturno', label: 'Noturno', icon: <Moon size={14} /> },
            ]}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {availableYears.length > 1 && activeYear !== null && (
              <EnhancedConnectedButtonGroup<number>
                wrap={true}
                value={activeYear}
                onChange={(yr) => {
                  setSelectedYear(yr);
                  setCommonOnly(null);
                  setShowCommonSubjectsList(false);
                  setSubjectSearch('');
                  setDebouncedSubject('');
                }}
                options={availableYears.map((yr, idx) => ({
                  value: yr,
                  label: String(yr),
                  icon: idx === 0 ? <Calendar size={13} /> : undefined,
                }))}
              />
            )}

            <EnhancedConnectedButtonGroup<number>
              wrap={true}
              value={bimester}
              onChange={setBimester}
              options={[
                { value: 0, label: 'Ano Todo' },
                { value: 1, label: '1ºB' },
                { value: 2, label: '2ºB' },
                { value: 3, label: '3ºB' },
                { value: 4, label: '4ºB' },
              ]}
            />
          </div>
        </div>

        {/* Sort By */}
        <div style={{ marginTop: 10 }}>
          <EnhancedConnectedButtonGroup<ClassroomRankingSortBy>
            wrap={true}
            value={sortBy}
            onChange={setSortBy}
            options={[
              { value: 'official_average', label: 'Score CTI', icon: <Trophy size={14} /> },
              { value: 'raw_average', label: 'Média Bruta', icon: <Scale size={14} /> },
              { value: 'momentum', label: 'Maior Evolução', icon: <TrendingUp size={14} /> },
              { value: 'consistency', label: 'Constância', icon: <Target size={14} /> },
            ]}
          />
        </div>

        {/* Common-Subjects Fairness Strip */}
        {showCommonBar && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 14px',
              borderRadius: isMaterialYou ? 20 : 12,
              backgroundColor: tokens.surfaceContainer,
              border: `1px solid ${tokens.outlineVariant}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '0.8rem' }}>
                <Scale size={15} color={tokens.primary} />
                <span style={{ fontWeight: 700, color: tokens.onSurface }}>
                  {effectiveCommonOnly
                    ? `Matérias em comum${commonSubjects.length > 0 ? ` (${commonSubjects.length})` : ''}`
                    : 'Todas as matérias'}
                </span>
                {commonSubjects.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowCommonSubjectsList((prev) => !prev)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      borderRadius: 999,
                      border: `1px solid ${tokens.outlineVariant}`,
                      backgroundColor: tokens.surfaceContainerLow,
                      color: tokens.primary,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <span>{showCommonSubjectsList ? 'Ocultar lista' : 'Ver matérias'}</span>
                    {showCommonSubjectsList ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                )}
              </div>

              <div
                role="group"
                aria-label="Modo de comparação de matérias entre salas"
                style={{
                  display: 'inline-flex',
                  padding: 2,
                  borderRadius: isMaterialYou ? 999 : 10,
                  backgroundColor: tokens.surfaceContainerHighest,
                  gap: 2,
                }}
              >
                <button
                  type="button"
                  onClick={() => setCommonOnly(true)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: isMaterialYou ? 999 : 8,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.73rem',
                    fontWeight: effectiveCommonOnly ? 700 : 500,
                    backgroundColor: effectiveCommonOnly ? tokens.primary : 'transparent',
                    color: effectiveCommonOnly ? tokens.onPrimary : tokens.onSurfaceVariant,
                  }}
                >
                  Só em comum
                </button>
                <button
                  type="button"
                  onClick={() => setCommonOnly(false)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: isMaterialYou ? 999 : 8,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.73rem',
                    fontWeight: !effectiveCommonOnly ? 700 : 500,
                    backgroundColor: !effectiveCommonOnly ? tokens.primary : 'transparent',
                    color: !effectiveCommonOnly ? tokens.onPrimary : tokens.onSurfaceVariant,
                  }}
                >
                  Todas
                </button>
              </div>
            </div>

            {showCommonSubjectsList && commonSubjects.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 2 }}>
                {commonSubjects.map((subj) => (
                  <button
                    key={subj}
                    type="button"
                    onClick={() => {
                      setSubjectSearch(subj);
                      setDebouncedSubject(subj);
                    }}
                    style={{
                      padding: '3px 10px',
                      borderRadius: isMaterialYou ? 999 : 8,
                      border: `1px solid ${tokens.outlineVariant}`,
                      backgroundColor: tokens.surfaceContainerLow,
                      color: tokens.onSurface,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {subj}
                  </button>
                ))}
              </div>
            )}

            {data?.common_subjects_note && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: isMaterialYou ? 14 : 8,
                  backgroundColor: tokens.surfaceContainerLow,
                  fontSize: '0.75rem',
                  color: tokens.onSurfaceVariant,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '1 1 220px' }}>
                  <Info size={14} color={tokens.primary} style={{ flexShrink: 0 }} />
                  <span>{data.common_subjects_note}</span>
                </span>
                {(scope === 'all' || scope === 'course') && (
                  <button
                    type="button"
                    onClick={() => {
                      setScope('integrado');
                      setCommonOnly(true);
                    }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: isMaterialYou ? 999 : 8,
                      border: `1px solid ${tokens.outlineVariant}`,
                      backgroundColor: tokens.primaryContainer,
                      color: tokens.onPrimaryContainer,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    Mudar para Integrado (BNCC em comum)
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Subject filter input */}
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            height: 38,
            padding: '0 14px',
            borderRadius: isMaterialYou ? 999 : 12,
            backgroundColor: tokens.surfaceContainer,
            border: `1px solid ${tokens.outlineVariant}`,
          }}
        >
          <Search size={15} color={tokens.onSurfaceVariant} />
          <input
            type="text"
            placeholder="Filtrar ranking das salas por disciplina (ex: Matematica, Fisica...)"
            value={subjectSearch}
            onChange={(e) => setSubjectSearch(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: tokens.onSurface,
              fontSize: '0.84rem',
            }}
          />
          {subjectSearch && (
            <button
              type="button"
              onClick={() => {
                setSubjectSearch('');
                setDebouncedSubject('');
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: tokens.onSurfaceVariant,
                cursor: 'pointer',
                display: 'flex',
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Quick Subject Chips */}
        {availableSubjects.length > 0 && (
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              overflowX: 'auto',
              paddingBottom: 2,
              scrollbarWidth: 'none',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setSubjectSearch('');
                setDebouncedSubject('');
              }}
              style={{
                flex: '0 0 auto',
                padding: '5px 11px',
                borderRadius: isMaterialYou ? 999 : 8,
                border: `1px solid ${!debouncedSubject ? tokens.primary : tokens.outlineVariant}`,
                backgroundColor: !debouncedSubject ? tokens.primaryContainer : tokens.surfaceContainer,
                color: !debouncedSubject ? tokens.onPrimaryContainer : tokens.onSurfaceVariant,
                fontSize: '0.74rem',
                fontWeight: !debouncedSubject ? 700 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Todas
            </button>
            {availableSubjects.map((subj) => {
              const active = debouncedSubject.toLowerCase() === subj.toLowerCase();
              return (
                <button
                  key={subj}
                  type="button"
                  onClick={() => {
                    if (active) {
                      setSubjectSearch('');
                      setDebouncedSubject('');
                    } else {
                      setSubjectSearch(subj);
                      setDebouncedSubject(subj);
                    }
                  }}
                  style={{
                    flex: '0 0 auto',
                    padding: '5px 11px',
                    borderRadius: isMaterialYou ? 999 : 8,
                    border: `1px solid ${active ? tokens.primary : tokens.outlineVariant}`,
                    backgroundColor: active ? tokens.primaryContainer : tokens.surfaceContainer,
                    color: active ? tokens.onPrimaryContainer : tokens.onSurface,
                    fontSize: '0.74rem',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {subj}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Highlights */}
      {highlights.length > 0 && (
        <section
          aria-label="Destaques das salas"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
            gap: 10,
          }}
        >
          {highlights.slice(0, 4).map((item, idx) => {
            const accent =
              item.kind === 'leader'
                ? tokens.gradeWarning
                : item.kind === 'hardest_subject'
                  ? tokens.error
                  : item.kind === 'top_riser'
                    ? tokens.gradeSuccess
                    : tokens.primary;
            return (
              <div
                key={`${item.kind}-${idx}`}
                style={{
                  padding: '14px 15px',
                  borderRadius: isMaterialYou ? 24 : 14,
                  backgroundColor: isMaterialYou ? tokens.surfaceContainerLow : tokens.background,
                  border: `1px solid ${tokens.outlineVariant}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.69rem',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: accent,
                  }}
                >
                  {highlightIconForKind(item.kind)}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                  </span>
                </div>
                <div style={{ fontSize: '1.12rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                  {item.value_text}
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.subject_or_label}
                </div>
                <div style={{ fontSize: '0.72rem', color: tokens.onSurfaceVariant, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.subtext}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Classroom Comparison Modal / Overlay */}
      {comparisonExpanded && selectedPeerClass !== null && (
        <OverlayPage ariaLabel="Comparação entre salas" onClose={closeComparison}>
          {(close) => (
            <section
              style={{
                borderRadius: isMaterialYou ? 32 : 16,
                padding: isMaterialYou ? '22px 22px 26px' : '24px 26px',
                backgroundColor: isMaterialYou ? tokens.surfaceContainerLow : tokens.background,
                border: `1px solid ${tokens.outlineVariant}`,
              }}
            >
              <ModalHeader
                icon={<Swords size={21} />}
                eyebrow={comparisonEyebrow}
                title={comparisonTitle}
                actions={
                  <ModalIconButton label="Voltar ao ranking" onClick={close}>
                    <ArrowLeft size={18} />
                  </ModalIconButton>
                }
              />
              {comparisonBody}
            </section>
          )}
        </OverlayPage>
      )}

      {selectedPeerClass !== null && !comparisonExpanded && (
        <ExpressiveModal
          ariaLabel="Comparação entre salas"
          onClose={closeComparison}
          originEl={peerOriginRef.current}
        >
          {(close) => (
            <>
              <ModalHeader
                icon={<Swords size={21} />}
                eyebrow={comparisonEyebrow}
                title={comparisonTitle}
                onClose={() => close()}
                actions={
                  comparison && (
                    <ModalIconButton label="Tela cheia" onClick={() => close(() => setComparisonExpanded(true))}>
                      <Maximize2 size={17} />
                    </ModalIconButton>
                  )
                }
              />
              {comparisonBody}
            </>
          )}
        </ExpressiveModal>
      )}

      {/* Classroom Leaderboard */}
      <section data-no-size-morph style={{ display: 'flex', flexDirection: 'column', gap: isMaterialYou ? 4 : 8 }}>
        {loading && !data ? (
          <MorphingLoadingState label="Carregando ranking das salas..." />
        ) : !data || data.leaderboard.length === 0 ? (
          <div
            style={{
              padding: 36,
              textAlign: 'center',
              borderRadius: isMaterialYou ? 28 : 14,
              backgroundColor: tokens.surfaceContainerLow,
              border: `1px solid ${tokens.outlineVariant}`,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Nenhuma sala encontrada neste filtro</div>
            <div style={{ fontSize: '0.84rem', color: tokens.onSurfaceVariant, marginTop: 4 }}>
              Altere o escopo para &ldquo;Todo o CTI&rdquo; ou limpe o filtro de disciplina.
            </div>
          </div>
        ) : (
          (() => {
            const qualifiedEntries = data.leaderboard.filter((e) => !e.is_provisional);
            const provisionalEntries = data.leaderboard.filter((e) => Boolean(e.is_provisional));

            const renderClassroomCard = (entry: ClassroomLeaderboardEntry, idx: number, total: number) => {
              const canCompare = Boolean(effectiveClassCode && !entry.is_my_class);
              const minQuorum = entry.modality === 'integrado' ? 3 : 2;
              const missingQuorum = entry.active_students_count < minQuorum;
              return (
                <ExpressiveSegmentedCard
                  key={entry.class_code}
                  index={idx}
                  total={total}
                  selected={entry.is_my_class || selectedPeerClass === entry.class_code}
                  onClick={
                    canCompare
                      ? () => setSelectedPeerClass((prev) => (prev === entry.class_code ? null : entry.class_code))
                      : undefined
                  }
                  style={
                    entry.rank === 1 && !entry.is_provisional
                      ? {
                          padding: '18px 18px',
                          backgroundImage: `linear-gradient(120deg, ${tokens.gradeWarningContainer}, ${tokens.surfaceContainerLow} 62%)`,
                          border: `1.5px solid ${tokens.gradeWarning}`,
                          boxShadow: `0 10px 28px -14px ${tokens.gradeWarning}`,
                        }
                      : {
                          padding: '14px 18px',
                          contentVisibility: 'auto',
                          containIntrinsicSize: 'auto 88px',
                        }
                  }
                >
                  {entry.rank === 1 && !entry.is_provisional && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 10,
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: tokens.gradeWarning,
                      }}
                    >
                      <Crown size={14} strokeWidth={2.6} /> {crownLabelForSort(activeSortBy)}
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 200px' }}>
                      <span
                        style={{
                          position: 'relative',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: entry.rank === 1 && !entry.is_provisional ? 52 : 42,
                          height: entry.rank === 1 && !entry.is_provisional ? 52 : 42,
                          borderRadius: isMaterialYou ? 16 : 10,
                          backgroundColor: entry.is_my_class
                            ? tokens.primaryContainer
                            : entry.rank === 1 && !entry.is_provisional
                              ? tokens.gradeWarningContainer
                              : tokens.surfaceContainerHighest,
                          color: entry.is_my_class
                            ? tokens.onPrimaryContainer
                            : entry.rank === 1 && !entry.is_provisional
                              ? tokens.gradeWarning
                              : tokens.onSurface,
                          fontWeight: 900,
                          fontSize: entry.rank === 1 && !entry.is_provisional ? '1.15rem' : '0.96rem',
                          flexShrink: 0,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {entry.rank === 1 && !entry.is_provisional && (
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 100 100"
                            className="n2sac-crown-halo"
                            style={{ position: 'absolute', inset: -4, width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', pointerEvents: 'none' }}
                          >
                            <path d={CROWN_HALO_PATH} fill={tokens.gradeWarning} opacity={0.28} />
                          </svg>
                        )}
                        <span style={{ position: 'relative' }}>#{entry.rank}</span>
                      </span>

                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: '1.02rem' }}>{entry.class_code}</span>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: isMaterialYou ? 999 : 6,
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              backgroundColor: tokens.surfaceContainerHighest,
                              color: tokens.onSurfaceVariant,
                            }}
                          >
                            {courseLabel(entry.course_family)} • {modalityLabel(entry.modality)}
                          </span>
                          {entry.is_tied && (
                            <span
                              style={{
                                padding: '2px 7px',
                                borderRadius: isMaterialYou ? 999 : 6,
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                backgroundColor: tokens.surfaceContainerHighest,
                                color: tokens.onSurfaceVariant,
                              }}
                            >
                              Empate
                            </span>
                          )}
                          {entry.is_provisional && (
                            <span
                              style={{
                                padding: '2px 7px',
                                borderRadius: isMaterialYou ? 999 : 6,
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                backgroundColor: tokens.gradeWarningContainer,
                                color: tokens.onGradeWarningContainer,
                              }}
                            >
                              {missingQuorum
                                ? `Quórum (${entry.active_students_count}/${minQuorum} alunos)`
                                : `Parcial (${entry.subjects_count}/${data.expected_subjects_count} mat.)`}
                            </span>
                          )}
                          {entry.is_my_class && (
                            <span
                              style={{
                                padding: '2px 7px',
                                borderRadius: isMaterialYou ? 999 : 6,
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                backgroundColor: tokens.primaryContainer,
                                color: tokens.onPrimaryContainer,
                              }}
                            >
                              Sua Sala
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '0.76rem', color: tokens.onSurfaceVariant, marginTop: 3 }}>
                          {entry.subjects_count} matérias • {entry.active_students_count}{' '}
                          {entry.active_students_count === 1 ? 'aluno no app' : 'alunos no app'}
                          {entry.best_subject && (
                            <>
                              {' • '}
                              <span style={{ color: tokens.gradeSuccess, fontWeight: 600 }}>
                                <Sparkles size={11} style={{ verticalAlign: '-1px', marginRight: 2 }} />
                                {entry.best_subject.name} ({entry.best_subject.average.toFixed(1)})
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {renderPrimaryMetric(entry)}
                      {canCompare && (
                        <div onClick={(event) => event.stopPropagation()}>
                          <EnhancedMorphButton
                            size="sm"
                            variant={selectedPeerClass === entry.class_code ? 'filled' : 'tonal'}
                            icon={<Swords size={13} />}
                            onClick={() => setSelectedPeerClass(entry.class_code)}
                          >
                            Comparar
                          </EnhancedMorphButton>
                        </div>
                      )}
                    </div>
                  </div>
                </ExpressiveSegmentedCard>
              );
            };

            return (
              <>
                {qualifiedEntries.map((entry, idx) =>
                  renderClassroomCard(entry, idx, qualifiedEntries.length)
                )}

                {provisionalEntries.length > 0 && (
                  <>
                    <div
                      role="separator"
                      aria-label="Turmas provisórias"
                      style={{
                        marginTop: qualifiedEntries.length > 0 ? 14 : 0,
                        marginBottom: 4,
                        padding: '12px 16px',
                        borderRadius: isMaterialYou ? 20 : 12,
                        backgroundColor: tokens.surfaceContainer,
                        border: `1px dashed ${tokens.outlineVariant}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 5,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Info size={15} color={tokens.gradeWarning} style={{ flexShrink: 0 }} />
                        <span style={{ fontWeight: 800, fontSize: '0.82rem', color: tokens.onSurface }}>
                          Turmas provisórias (aguardando quórum)
                        </span>
                        <span
                          style={{
                            padding: '1px 8px',
                            borderRadius: 999,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            backgroundColor: tokens.gradeWarningContainer,
                            color: tokens.onGradeWarningContainer,
                          }}
                        >
                          {provisionalEntries.length}{' '}
                          {provisionalEntries.length === 1 ? 'turma' : 'turmas'}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.75rem', lineHeight: 1.45, color: tokens.onSurfaceVariant }}>
                        Estas turmas ficam listadas abaixo do ranking oficial — mesmo quando têm Score CTI ou M.T.
                        maior — porque ainda não atingiram o quórum mínimo de alunos ativos no app (
                        <strong>≥ 3 no Integrado</strong> ou <strong>≥ 2 no Noturno</strong>) ou cobertura mínima de
                        matérias lançadas. Assim que mais colegas entrarem ou as notas forem publicadas, a turma sobe
                        automaticamente para o bloco oficial.
                      </p>
                    </div>

                    {provisionalEntries.map((entry, idx) =>
                      renderClassroomCard(entry, idx, provisionalEntries.length)
                    )}
                  </>
                )}
              </>
            );
          })()
        )}
      </section>
    </div>
  );
};
