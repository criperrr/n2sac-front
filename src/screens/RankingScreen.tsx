import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PeerComparisonContent, type ComparisonSide } from '../components/PeerComparisonPanel';
import { ClassroomRankingView } from '../components/ClassroomRankingView';
import { ProfileAvatar } from '../components/profile/ProfileAvatar';
import { PrivacyToggle } from '../components/PrivacyToggle';
import { StudentSearch } from '../components/social/StudentSearch';
import { shapePaths } from '../components/expressive/ShapeMorph';
import { ExpressiveModal, ModalHeader, ModalIconButton, useTransformOrigin } from '../components/expressive/ExpressiveModal';
import { OverlayPage } from '../components/expressive/OverlayPage';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Camera,
  ChevronDown,
  ChevronUp,
  Contact,
  Crown,
  EyeOff,
  Flame,
  FlaskConical,
  GraduationCap,
  HeartHandshake,
  HelpCircle,
  Info,
  Layers,
  Lock,
  Maximize2,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import {
  fetchCompareLeaderboard,
  fetchPeerComparison,
  getCachedCompareLeaderboard,
  getCachedPeerComparison,
  invalidateCompareCache,
  loadCachedUserProfile,
  updateRankingPreferences,
  type CompareLeaderboardParams,
} from '../api/nsacClient';
import type {
  CohortHighlightItem,
  ComparisonSummaryResponse,
  LeaderboardEntry,
  PeerComparisonDetail,
  RankingPreferences,
  RankingScope,
  RankingSortBy,
} from '../api/types';
import { useM3Theme } from '../theme/ThemeContext';
import { harmonizeRoleBadgeColors } from '../theme/materialYou';
import {
  EnhancedConnectedButtonGroup,
  EnhancedMorphButton,
  ExpressiveSegmentedCard,
  IconShapeContainer,
  RevealNumber,
} from '../components/expressive/ExpressivePrimitives';
import { MorphingLoadingState } from '../components/expressive/ShapeMorph';
import { RankingTransparencyModal } from '../components/TransparencyModal';

const INITIAL_ROWS = 12;
const ROWS_PER_IDLE = 24;
const SUBJECT_SEARCH_DEBOUNCE_MS = 280;

function prefsEqual(a: RankingPreferences | null, b: RankingPreferences | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.opted_in === b.opted_in &&
    a.hide_name === b.hide_name &&
    a.has_decided === b.has_decided &&
    a.display_name === b.display_name &&
    a.show_avatar === b.show_avatar &&
    a.public_profile === b.public_profile &&
    a.discoverable === b.discoverable &&
    a.invisible === b.invisible
  );
}

function deriveGradeLabel(classCode: string | null): string {
  if (!classCode) return 'Meu Ano';
  const match = classCode.match(/[1-4]/);
  return match ? `${match[0]}º Ano` : 'Meu Ano';
}

function deriveCourseLabel(classCode: string | null): string {
  if (!classCode) return 'Meu Curso';
  const upper = classCode.toUpperCase();
  if (/INI|INF|INO/.test(upper)) return 'Informática';
  if (/ELI|ELE|ELO/.test(upper)) return 'Eletrônica';
  if (/MEI|MEC|MEO/.test(upper)) return 'Mecânica';
  return 'Meu Curso';
}

function crownLabelForSort(sortBy: RankingSortBy, isCalibrated = false): string {
  switch (sortBy) {
    case 'raw_average':
      return 'Maior média bruta';
    case 'delta_vs_class':
      return 'Maior destaque vs. sala';
    case 'momentum':
      return 'Maior evolução';
    case 'consistency':
      return 'Mais constante';
    case 'personal_average':
    default:
      return isCalibrated ? 'Maior Score CTI' : 'Melhor média';
  }
}

function highlightIconForKind(kind: CohortHighlightItem['kind']): React.ReactNode {
  switch (kind) {
    case 'leader':
      return <Crown size={14} strokeWidth={2.4} />;
    case 'top_delta':
      return <Sparkles size={14} />;
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

/** Soft-burst M3 shape behind the 1st place photo (slowly turning halo). */
const CROWN_HALO_PATH = shapePaths(49)[0]!;

const sideFromEntry = (entry: LeaderboardEntry): ComparisonSide => ({
  accountId: entry.account_id,
  label: entry.display_label,
  avatarUrl: entry.avatar_url,
  rank: entry.rank,
  average: entry.personal_average,
  classCode: entry.class_code,
  canOpenProfile: entry.has_public_profile,
});

export const RankingScreen: React.FC<{
  token: string;
  accountId: number;
  classCode: string | null;
  preferences: RankingPreferences | null;
  onPreferencesUpdated: (prefs: RankingPreferences) => void;
  refreshSignal?: number;
  onRefreshingChange?: (busy: boolean) => void;
}> = ({
  token,
  accountId,
  classCode,
  preferences,
  onPreferencesUpdated,
  refreshSignal = 0,
  onRefreshingChange,
}) => {
  const { tokens, isMaterialYou, effectiveSeedHex, effectiveIsDark } = useM3Theme();
  const [rankingMode, setRankingMode] = useState<'students' | 'classrooms'>('students');
  const [scope, setScope] = useState<RankingScope>('class');
  const [sortBy, setSortBy] = useState<RankingSortBy>('personal_average');
  const [commonOnly, setCommonOnly] = useState<boolean | null>(null);
  const [showCommonSubjectsList, setShowCommonSubjectsList] = useState(false);
  const [showPrivacyControls, setShowPrivacyControls] = useState(false);
  const [showScoreLegend, setShowScoreLegend] = useState(false);
  const [showNerdStats, setShowNerdStats] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [bimester, setBimester] = useState<number>(0); // 0 = all
  const [subjectSearch, setSubjectSearch] = useState('');
  const [debouncedSubject, setDebouncedSubject] = useState('');
  const [selectedPeerId, setSelectedPeerId] = useState<number | null>(null);
  const { originRef: peerOriginRef, onClickCapture: capturePeerOrigin } = useTransformOrigin();
  const [data, setData] = useState<ComparisonSummaryResponse | null>(() =>
    getCachedCompareLeaderboard({ scope: 'class', sortBy: 'personal_average', commonOnly: null, bimester: null })
  );
  const [peerComparison, setPeerComparison] = useState<PeerComparisonDetail | null>(null);
  const [comparisonExpanded, setComparisonExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [peerLoading, setPeerLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const forceRefreshNextRef = useRef(false);
  const onPreferencesUpdatedRef = useRef(onPreferencesUpdated);
  onPreferencesUpdatedRef.current = onPreferencesUpdated;
  const onRefreshingChangeRef = useRef(onRefreshingChange);
  onRefreshingChangeRef.current = onRefreshingChange;
  const lastReportedPrefsRef = useRef<RankingPreferences | null>(preferences);
  lastReportedPrefsRef.current = preferences;

  const effectiveClassCode = data?.my_class_code ?? classCode;
  const gradeLabel = useMemo(() => deriveGradeLabel(effectiveClassCode), [effectiveClassCode]);
  const courseLabel = useMemo(() => deriveCourseLabel(effectiveClassCode), [effectiveClassCode]);
  const availableYears = useMemo(() => {
    const yrs = data?.available_years ?? [];
    if (yrs.length > 0) return yrs;
    return data?.school_year ? [data.school_year] : [];
  }, [data?.available_years, data?.school_year]);
  const activeYear = selectedYear ?? data?.school_year ?? availableYears[0] ?? null;

  // Report busy state up to App shell so the top-bar / pull-to-refresh indicator reflects Ranking reloads.
  useEffect(() => {
    onRefreshingChangeRef.current?.(loading || peerLoading);
    return () => {
      onRefreshingChangeRef.current?.(false);
    };
  }, [loading, peerLoading]);

  // Trigger a full Ranking + active peer comparison reload when the user hits Refresh on the Ranking tab.
  useEffect(() => {
    if (!refreshSignal) return;
    invalidateCompareCache();
    forceRefreshNextRef.current = true;
    setRefreshNonce((n) => n + 1);
  }, [refreshSignal]);

  // Debounce subject search keystrokes so typing a subject name sends 1 request instead of N.
  useEffect(() => {
    const trimmed = subjectSearch.trim();
    if (trimmed === debouncedSubject) return;
    const timer = window.setTimeout(() => {
      setDebouncedSubject(trimmed);
    }, SUBJECT_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [subjectSearch, debouncedSubject]);

  // 1. Leaderboard fetch: strictly scoped to leaderboard filter params (NEVER `selectedPeerId`).
  // Hydrates from module-level SWR cache in 0ms before revalidating via ETag/304.
  useEffect(() => {
    const queryParams: CompareLeaderboardParams = {
      scope,
      sortBy,
      commonOnly,
      year: selectedYear ?? undefined,
      bimester: bimester === 0 ? null : bimester,
      subject: debouncedSubject || undefined,
      forceRefresh: forceRefreshNextRef.current,
    };
    forceRefreshNextRef.current = false;

    const cached = !queryParams.forceRefresh ? getCachedCompareLeaderboard(queryParams) : null;
    if (cached) {
      setData(cached);
    }

    const controller = new AbortController();
    setLoading(true);

    fetchCompareLeaderboard(token, queryParams, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        // Interruptible render: when data lands mid page-transition (fast responses on later
        // visits), React slices the list render instead of freezing the animation.
        startTransition(() => setData(res));
        if (!prefsEqual(lastReportedPrefsRef.current, res.my_preferences)) {
          lastReportedPrefsRef.current = res.my_preferences;
          onPreferencesUpdatedRef.current(res.my_preferences);
        }
      })
      .catch(() => {
        // Ignore aborted or failed leaderboard refreshes; stale list stays visible
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [token, scope, sortBy, commonOnly, selectedYear, bimester, debouncedSubject, refreshNonce]);

  // 2. Peer comparison fetch: uses lightweight `/api/v1/compare/peer/:id` with module-level SWR cache.
  // Closing the modal (`selectedPeerId === null`) triggers ZERO network requests.
  useEffect(() => {
    if (selectedPeerId === null) {
      setPeerComparison(null);
      setPeerLoading(false);
      setComparisonError(false);
      return;
    }

    const peerParams = {
      scope,
      year: selectedYear ?? undefined,
      bimester: bimester === 0 ? null : bimester,
      commonOnly,
      subject: debouncedSubject || undefined,
    };
    const cached = getCachedPeerComparison(selectedPeerId, peerParams);
    if (cached) {
      setPeerComparison(cached);
      setPeerLoading(false);
      setComparisonError(false);
      return;
    }

    const controller = new AbortController();
    setPeerComparison(null);
    setPeerLoading(true);
    setComparisonError(false);

    fetchPeerComparison(token, selectedPeerId, peerParams, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return;
        setPeerComparison(detail);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setComparisonError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPeerLoading(false);
      });

    return () => controller.abort();
  }, [token, scope, commonOnly, selectedYear, bimester, debouncedSubject, selectedPeerId, refreshNonce]);

  // Progressive list: the first rows render with the screen, the rest in idle time.
  // Keyed by filter params (not `data`) so opening a peer comparison never tears down and
  // remounts the entire leaderboard behind the modal.
  const [renderCount, setRenderCount] = useState(INITIAL_ROWS);
  const total = data?.leaderboard.length ?? 0;
  const leaderboardKey = `${scope}:${sortBy}:${String(commonOnly)}:${String(selectedYear)}:${bimester}:${debouncedSubject}`;
  useEffect(() => {
    setRenderCount(INITIAL_ROWS);
    if (total <= INITIAL_ROWS) return;
    let handle = 0;
    const idle = (cb: () => void) =>
      'requestIdleCallback' in window
        ? window.requestIdleCallback(cb, { timeout: 300 })
        : (window as Window).setTimeout(cb, 60);
    const cancel = (h: number) =>
      'cancelIdleCallback' in window ? window.cancelIdleCallback(h) : (window as Window).clearTimeout(h);
    const grow = () => {
      setRenderCount((n) => {
        const next = Math.min(total, n + ROWS_PER_IDLE);
        if (next < total) handle = idle(grow);
        return next;
      });
    };
    handle = idle(grow);
    return () => cancel(handle);
  }, [leaderboardKey, total]);

  const effectivePrefs = data?.my_preferences ?? preferences;
  const optedIn = effectivePrefs?.opted_in ?? false;
  const hideName = effectivePrefs?.hide_name ?? false;
  const invisible = effectivePrefs?.invisible ?? false;
  const showAvatar = effectivePrefs?.show_avatar ?? false;

  const savePrefs = async (
    patch: Partial<Pick<RankingPreferences, 'opted_in' | 'hide_name' | 'show_avatar' | 'public_profile'>>
  ) => {
    setSavingPrefs(true);
    try {
      const updated = await updateRankingPreferences(token, {
        opted_in: optedIn,
        hide_name: hideName,
        ...patch,
      });
      onPreferencesUpdatedRef.current(updated);
      forceRefreshNextRef.current = true;
      setRefreshNonce((n) => n + 1);
    } finally {
      setSavingPrefs(false);
    }
  };
  const handleToggleOptIn = (next: boolean) => savePrefs({ opted_in: next });
  const handleToggleHideName = (next: boolean) => savePrefs({ hide_name: next });

  const comparison =
    peerComparison && peerComparison.peer_entry.account_id === selectedPeerId
      ? peerComparison
      : null;
  const selectedEntry =
    comparison?.peer_entry ?? data?.leaderboard.find((e) => e.account_id === selectedPeerId) ?? null;
  const comparisonEyebrow = data
    ? `${data.bimester ? `${data.bimester}º Bimestre` : 'Ano todo'} • ${data.school_year}${
        selectedEntry ? ` • ${selectedEntry.class_code}` : ''
      }`
    : 'Comparação';
  const comparisonTitle = `Você vs ${selectedEntry?.display_label ?? 'colega'}`;

  const closeComparison = useCallback(() => {
    setComparisonExpanded(false);
    setSelectedPeerId(null);
  }, []);

  /** Profile opened from an avatar: shows rank/average at once and offers "Comparar". */
  const profilePreview = (entry: LeaderboardEntry) => ({
    accountId: entry.account_id,
    label: entry.display_label,
    avatarUrl: entry.avatar_url,
    classCode: entry.class_code,
    rank: entry.rank,
    average: entry.personal_average,
    onCompare: entry.is_me ? undefined : () => setSelectedPeerId(entry.account_id),
  });

  const ownProfile = loadCachedUserProfile(accountId);
  const meSide: ComparisonSide = data?.my_entry
    ? sideFromEntry(data.my_entry)
    : {
        accountId,
        label: ownProfile?.display_name || ownProfile?.first_name || 'Você',
        avatarUrl: ownProfile?.avatar_data_url ?? null,
        rank: null,
        average: data?.my_benchmark?.personal_average ?? null,
        classCode: effectiveClassCode,
        canOpenProfile: true,
      };

  const comparisonLoading = selectedPeerId !== null && (peerLoading || (!comparison && !comparisonError));

  const comparisonBody = comparisonLoading ? (
    <ComparisonSkeleton />
  ) : comparison ? (
    <PeerComparisonContent
      comparison={comparison}
      me={meSide}
      peer={sideFromEntry(comparison.peer_entry)}
      wide={comparisonExpanded}
    />
  ) : (
    <div style={{ marginTop: 18, color: tokens.onSurfaceVariant, fontSize: '0.86rem' }}>
      Não foi possível carregar a comparação agora. Tente novamente em instantes.
    </div>
  );

  // Fixed Top-X% formula: rank 1 of N is never "Top 0%"!
  const myRank = data?.my_rank ?? null;
  const totalParticipants = data?.total_participants ?? 0;
  const topPct =
    myRank !== null && totalParticipants > 0
      ? Math.max(1, Math.ceil((myRank / Math.max(1, totalParticipants)) * 100))
      : null;

  const activeSortBy: RankingSortBy = data?.sort_by ?? sortBy;
  const effectiveCommonOnly = data?.common_only ?? (commonOnly ?? false);
  const commonSubjects = data?.common_subjects ?? [];
  const showCommonTransparencyBar =
    scope !== 'class' &&
    !debouncedSubject &&
    sortBy !== 'delta_vs_class' &&
    (data?.common_only !== undefined || commonSubjects.length > 0 || Boolean(data?.common_subjects_note));
  const availableSubjects = data?.available_subjects ?? [];
  const highlights = data?.highlights ?? [];
  const rawBenchmark = data?.my_benchmark ?? null;
  const myBenchmark = !optedIn ? rawBenchmark : null;
  const leaderTargetAverage =
    activeSortBy === 'personal_average' || activeSortBy === 'raw_average'
      ? (rawBenchmark?.leader_target_average ?? null)
      : null;
  const nerdStats = rawBenchmark?.nerd_stats ?? null;

  const renderPrimaryMetric = (entry: LeaderboardEntry) => {
    switch (activeSortBy) {
      case 'delta_vs_class': {
        const deltaColor =
          entry.delta_vs_class > 0.05
            ? tokens.gradeSuccess
            : entry.delta_vs_class < -0.05
              ? tokens.error
              : tokens.primary;
        return (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, textTransform: 'uppercase' }}>
              vs. Sala
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', color: deltaColor }}>
              <RevealNumber value={entry.delta_vs_class} decimals={2} showPlusSign />
            </div>
            <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>
              Média {entry.personal_average.toFixed(2)}
            </div>
          </div>
        );
      }
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
              Média {entry.personal_average.toFixed(2)}
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
                title="Índice de constância CARA de 0,00 a 10,00 (sempre decrescente; subir qualquer nota melhora o índice)"
                style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, textTransform: 'uppercase' }}
              >
                Índice
              </div>
              <div style={{ fontWeight: 800, fontSize: '1.15rem', color: tokens.primary, fontVariantNumeric: 'tabular-nums' }}>
                <RevealNumber value={clamped} decimals={2} />
              </div>
              <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>
                {std !== null ? `±${std.toFixed(2)} • ` : ''}Média {entry.personal_average.toFixed(2)}
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
              Média {entry.personal_average.toFixed(2)}
            </div>
          </div>
        );
      }
      case 'raw_average':
        return (
          <div style={{ textAlign: 'right' }}>
            <div
              title="Média aritmética bruta das notas do aluno no recorte selecionado (sem calibração entre turmas)"
              style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, textTransform: 'uppercase' }}
            >
              Média Bruta
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', color: tokens.primary, fontVariantNumeric: 'tabular-nums' }}>
              <RevealNumber value={entry.personal_average} decimals={2} />
            </div>
            {entry.calibrated_score != null && (
              <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>
                Score CTI {Math.max(0, Math.min(10, entry.calibrated_score)).toFixed(2)}
              </div>
            )}
          </div>
        );
      case 'personal_average':
      default:
        if (entry.calibrated_score != null) {
          const clamped = Math.max(0, Math.min(10, entry.calibrated_score));
          return (
            <div style={{ textAlign: 'right' }}>
              <div
                title="Score CTI de 0,00 a 10,00: sua média ajustada pela dificuldade oficial (M.T.) da sua turma para comparar cursos diferentes com justiça"
                style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, textTransform: 'uppercase' }}
              >
                Score CTI
              </div>
              <div style={{ fontWeight: 800, fontSize: '1.15rem', color: tokens.primary, fontVariantNumeric: 'tabular-nums' }}>
                <RevealNumber value={clamped} decimals={2} />
              </div>
              <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>
                Média {entry.personal_average.toFixed(2)}
              </div>
            </div>
          );
        }
        return (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, textTransform: 'uppercase' }}>
              Média
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', color: tokens.primary }}>
              <RevealNumber value={entry.personal_average} decimals={2} />
            </div>
          </div>
        );
    }
  };

  return (
    <div
      onClickCapture={capturePeerOrigin}
      style={{ display: 'flex', flexDirection: 'column', gap: isMaterialYou ? 18 : 16 }}
    >
      {/* 1. HERO HEADER & PRIVACY CONTROLS */}
      <section
        data-no-size-morph
        style={{
          borderRadius: isMaterialYou ? 32 : 16,
          padding: isMaterialYou ? '24px 22px' : '24px 26px',
          backgroundColor: isMaterialYou ? tokens.surfaceContainerLow : tokens.background,
          border: `1px solid ${tokens.outlineVariant}`,
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: rankingMode === 'students' ? 18 : 0,
            minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <IconShapeContainer size={isMaterialYou ? 52 : 42} active>
              <Trophy size={isMaterialYou ? 24 : 20} />
            </IconShapeContainer>
            <div>
              <div
                style={{
                  fontSize: '0.73rem',
                  fontWeight: 600,
                  color: tokens.onSurfaceVariant,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Comparação entre Alunos • {data?.scope_label ?? effectiveClassCode ?? 'CTI'}
                {data?.school_year ? ` • ${data.school_year}` : ''}
              </div>
              <h1
                className={!isMaterialYou ? 'openai-serif-display' : undefined}
                style={{
                  margin: 0,
                  fontSize: isMaterialYou ? '1.65rem' : '2.15rem',
                  fontWeight: isMaterialYou ? 800 : 400,
                }}
              >
                Ranking & Comparação
              </h1>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <EnhancedConnectedButtonGroup<'students' | 'classrooms'>
              value={rankingMode}
              onChange={setRankingMode}
              options={[
                { value: 'students', label: 'Alunos', icon: <Users size={14} /> },
                { value: 'classrooms', label: 'Salas', icon: <Building2 size={14} /> },
              ]}
            />

            {rankingMode === 'students' && myRank !== null && (
            <div
              style={{
                padding: '8px 14px',
                borderRadius: isMaterialYou ? 999 : 10,
                backgroundColor: tokens.primaryContainer,
                color: tokens.onPrimaryContainer,
                fontWeight: 700,
                fontSize: '0.86rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>
                Sua posição: #{myRank}
                {totalParticipants > 0 ? ` de ${totalParticipants}` : ''}
              </span>
              {myRank === 1 && totalParticipants > 1 ? (
                <span style={{ opacity: 0.9 }}>(Líder)</span>
              ) : (
                topPct !== null && <span style={{ opacity: 0.85 }}>(Top {topPct}%)</span>
              )}
            </div>
            )}
          </div>
        </div>

        {rankingMode === 'students' && (
          <>
        {/* Compact Collapsible Privacy Summary Bar (Collapsed by default for instant focus) */}
        <div style={{ marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setShowPrivacyControls((prev) => !prev)}
            style={{
              width: '100%',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '9px 13px',
              borderRadius: isMaterialYou ? 18 : 10,
              border: `1px solid ${tokens.outlineVariant}`,
              backgroundColor: tokens.surfaceContainer,
              color: tokens.onSurface,
              cursor: 'pointer',
              font: 'inherit',
              textAlign: 'left',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', minWidth: 0 }}>
              <ShieldCheck size={16} color={optedIn && !invisible ? tokens.gradeSuccess : tokens.onSurfaceVariant} style={{ flexShrink: 0 }} />
              <span>
                <strong>Privacidade:</strong>{' '}
                <span style={{ color: tokens.onSurfaceVariant }}>
                  {invisible
                    ? 'Modo invisível ativo'
                    : !optedIn
                      ? 'Fora do ranking (resumo privado)'
                      : hideName
                        ? 'Anônimo (Aluno #XXX)'
                        : showAvatar
                          ? 'Visível com nome e foto'
                          : 'Visível com nome (sem foto)'}
                </span>
              </span>
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.74rem',
                fontWeight: 700,
                color: tokens.primary,
                flexShrink: 0,
              }}
            >
              {showPrivacyControls ? 'Ocultar opções' : 'Alterar'}
              {showPrivacyControls ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>

          {showPrivacyControls && (
            <div
              data-no-size-morph
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
                gap: 10,
                marginTop: 10,
                minWidth: 0,
              }}
            >
              <PrivacyToggle
                icon={<ShieldCheck size={18} />}
                title="Participar do Ranking"
                caption={
                  invisible
                    ? 'Modo invisível ativo — desative no seu Perfil'
                    : optedIn
                      ? 'Você está visível no ranking'
                      : 'Você está oculto (fora do ranking)'
                }
                checked={optedIn}
                disabled={savingPrefs || invisible}
                onChange={handleToggleOptIn}
                activeColor={tokens.gradeSuccess}
              />
              <PrivacyToggle
                icon={<EyeOff size={18} />}
                title="Ocultar Meu Nome"
                caption={hideName ? 'Exibido como Aluno #XXX (sem foto nem perfil)' : 'Exibindo seu nome'}
                checked={hideName}
                disabled={!optedIn || savingPrefs}
                onChange={handleToggleHideName}
              />
              <PrivacyToggle
                icon={<Camera size={18} />}
                title="Mostrar Minha Foto"
                caption={showAvatar && !hideName ? 'Sua foto aparece no ranking' : 'Iniciais no lugar da foto'}
                checked={showAvatar && !hideName}
                disabled={!optedIn || hideName || savingPrefs}
                onChange={(next) => savePrefs({ show_avatar: next })}
              />
              <PrivacyToggle
                icon={<Contact size={18} />}
                title="Perfil Público"
                caption={
                  optedIn && !hideName
                    ? 'Sempre acessível enquanto seu nome estiver visível no ranking'
                    : 'Oculto enquanto você estiver anônimo ou fora do ranking'
                }
                checked={optedIn && !hideName}
                disabled={true}
                onChange={() => {}}
              />
            </div>
          )}
        </div>

        {/* Find students by name / e-mail */}
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              fontSize: '0.74rem',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: tokens.primary,
              margin: '0 0 8px',
            }}
          >
            Encontrar alunos
          </div>
          <StudentSearch token={token} />
        </div>

        {/* Scope & Bimester Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <EnhancedConnectedButtonGroup<RankingScope>
            wrap={true}
            value={scope}
            onChange={(s) => {
              setScope(s);
              if (s === 'class' && sortBy === 'raw_average') {
                setSortBy('personal_average');
              }
              setCommonOnly(null);
              setShowCommonSubjectsList(false);
              setSelectedPeerId(null);
            }}
            options={[
              { value: 'class', label: `Minha Turma (${effectiveClassCode ?? 'CTI'})`, icon: <Users size={14} /> },
              { value: 'grade_level', label: `${gradeLabel} (Todos cursos)`, icon: <GraduationCap size={14} /> },
              { value: 'course', label: courseLabel, icon: <Layers size={14} /> },
              { value: 'school', label: 'Todo o CTI', icon: <Trophy size={14} /> },
              { value: 'friends', label: 'Amigos', icon: <HeartHandshake size={14} /> },
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
                  setSelectedPeerId(null);
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

        {/* Ranking Modes (Sort By) */}
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <EnhancedConnectedButtonGroup<RankingSortBy>
            wrap={true}
            value={scope === 'class' && sortBy === 'raw_average' ? 'personal_average' : sortBy}
            onChange={setSortBy}
            options={
              scope === 'class'
                ? [
                    { value: 'personal_average', label: 'Média', icon: <Trophy size={14} /> },
                    { value: 'delta_vs_class', label: 'Destaque vs. Sala', icon: <Sparkles size={14} /> },
                    { value: 'momentum', label: 'Maior Evolução', icon: <TrendingUp size={14} /> },
                    { value: 'consistency', label: 'Constância', icon: <Target size={14} /> },
                  ]
                : [
                    { value: 'personal_average', label: 'Score CTI', icon: <Trophy size={14} /> },
                    { value: 'raw_average', label: 'Média Bruta', icon: <Scale size={14} /> },
                    { value: 'delta_vs_class', label: 'Destaque vs. Sala', icon: <Sparkles size={14} /> },
                    { value: 'momentum', label: 'Maior Evolução', icon: <TrendingUp size={14} /> },
                    { value: 'consistency', label: 'Constância', icon: <Target size={14} /> },
                  ]
            }
          />
        </div>

        {/* Common-Subjects Fairness Strip (multi-class scopes without a single subject filter) */}
        {showCommonTransparencyBar && (
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
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
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
                aria-label="Modo de comparação de matérias"
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
                    transition: 'all 140ms ease',
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
                    transition: 'all 140ms ease',
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
                {(scope === 'school' || scope === 'course') && (
                  <button
                    type="button"
                    onClick={() => {
                      setScope('grade_level');
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
                    Comparar {gradeLabel} em comum
                  </button>
                )}
                  <button
                    type="button"
                    onClick={() => setSortBy('delta_vs_class')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: isMaterialYou ? 999 : 8,
                      border: `1px solid ${tokens.outlineVariant}`,
                      backgroundColor: tokens.secondaryContainer,
                      color: tokens.onSecondaryContainer,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    Ver Destaque vs. Sala
                  </button>
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
            placeholder="Filtrar ranking por disciplina específica (ex: Matematica, Fisica, Java...)"
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

        {/* Quick Subject Chips (1-tap subject filtering) */}
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
          </>
        )}
      </section>

      {rankingMode === 'classrooms' ? (
        <ClassroomRankingView
          token={token}
          classCode={effectiveClassCode}
          refreshSignal={refreshSignal}
          onRefreshingChange={onRefreshingChange}
        />
      ) : (
        <>

      {/* Private Personal Summary for Opted-Out Students */}
      {myBenchmark && (
        <section
          style={{
            borderRadius: isMaterialYou ? 26 : 14,
            padding: '16px 18px',
            backgroundColor: isMaterialYou ? tokens.surfaceContainerLow : tokens.background,
            border: `1px solid ${tokens.outlineVariant}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lock size={15} color={tokens.primary} />
              <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>
                Seu resumo privado (só você vê)
              </span>
            </div>
            {myBenchmark.hypothetical_rank !== null && myBenchmark.hypothetical_total > 0 && (
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: isMaterialYou ? 999 : 8,
                  backgroundColor: tokens.primaryContainer,
                  color: tokens.onPrimaryContainer,
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                Onde você estaria: #{myBenchmark.hypothetical_rank} de {myBenchmark.hypothetical_total}
              </span>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 8,
            }}
          >
            <div
              style={{
                padding: '10px 12px',
                borderRadius: isMaterialYou ? 18 : 10,
                backgroundColor: tokens.surfaceContainer,
              }}
            >
              <div style={{ fontSize: '0.7rem', color: tokens.onSurfaceVariant, fontWeight: 600 }}>
                Sua média neste filtro
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: tokens.primary, fontVariantNumeric: 'tabular-nums' }}>
                {myBenchmark.personal_average.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.72rem', color: tokens.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>
                {myBenchmark.delta_vs_class >= 0 ? '+' : ''}
                {myBenchmark.delta_vs_class.toFixed(2)} vs M.T. ({myBenchmark.class_average.toFixed(2)})
              </div>
            </div>

            <div
              style={{
                padding: '10px 12px',
                borderRadius: isMaterialYou ? 18 : 10,
                backgroundColor: tokens.surfaceContainer,
              }}
            >
              <div style={{ fontSize: '0.7rem', color: tokens.onSurfaceVariant, fontWeight: 600 }}>
                Desempenho vs. sala
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, marginTop: 2 }}>
                {myBenchmark.subjects_above_class} acima · {myBenchmark.subjects_below_class} abaixo
              </div>
              <div style={{ fontSize: '0.72rem', color: tokens.onSurfaceVariant }}>
                {myBenchmark.subjects_count}{' '}
                {myBenchmark.subjects_count === 1 ? 'matéria avaliada' : 'matérias avaliadas'}
              </div>
            </div>

            {myBenchmark.standout_subject && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: isMaterialYou ? 18 : 10,
                  backgroundColor: tokens.surfaceContainer,
                }}
              >
                <div style={{ fontSize: '0.7rem', color: tokens.gradeSuccess, fontWeight: 700 }}>
                  Destaque
                </div>
                <div
                  style={{
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {myBenchmark.standout_subject.name}
                </div>
                <div style={{ fontSize: '0.72rem', color: tokens.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>
                  {myBenchmark.standout_subject.grade.toFixed(1)} ({myBenchmark.standout_subject.delta >= 0 ? '+' : ''}
                  {myBenchmark.standout_subject.delta.toFixed(2)} vs M.T.)
                </div>
              </div>
            )}

            {myBenchmark.focus_subject && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: isMaterialYou ? 18 : 10,
                  backgroundColor: tokens.surfaceContainer,
                }}
              >
                <div style={{ fontSize: '0.7rem', color: tokens.error, fontWeight: 700 }}>
                  Ponto de atenção
                </div>
                <div
                  style={{
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {myBenchmark.focus_subject.name}
                </div>
                <div style={{ fontSize: '0.72rem', color: tokens.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>
                  {myBenchmark.focus_subject.grade.toFixed(1)} ({myBenchmark.focus_subject.delta >= 0 ? '+' : ''}
                  {myBenchmark.focus_subject.delta.toFixed(2)} vs M.T.)
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Scope Highlights Strip */}
      {highlights.length > 0 && (
        <section
          aria-label="Destaques do escopo"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
            gap: 10,
          }}
        >
          {highlights.slice(0, 4).map((item, idx) => {
            const canCompare = item.account_id != null && item.account_id !== accountId;
            const accent =
              item.kind === 'leader'
                ? tokens.gradeWarning
                : item.kind === 'hardest_subject'
                  ? tokens.error
                  : item.kind === 'top_riser'
                    ? tokens.gradeSuccess
                    : tokens.primary;

            const cardStyle: React.CSSProperties = {
              textAlign: 'left',
              padding: '14px 15px',
              borderRadius: isMaterialYou ? 24 : 14,
              backgroundColor: isMaterialYou ? tokens.surfaceContainerLow : tokens.background,
              border: `1px solid ${tokens.outlineVariant}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              minWidth: 0,
              cursor: canCompare ? 'pointer' : 'default',
              color: tokens.onSurface,
              font: 'inherit',
            };

            const inner = (
              <>
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
                <div
                  style={{
                    fontSize: '1.12rem',
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    color: tokens.onSurface,
                    marginTop: 2,
                  }}
                >
                  {item.value_text}
                </div>
                <div
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.subject_or_label}
                </div>
                <div
                  style={{
                    fontSize: '0.72rem',
                    color: tokens.onSurfaceVariant,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.subtext}
                </div>
              </>
            );

            if (canCompare) {
              return (
                <button
                  key={`${item.kind}-${idx}`}
                  type="button"
                  onClick={() => setSelectedPeerId(item.account_id!)}
                  style={cardStyle}
                >
                  {inner}
                </button>
              );
            }
            return (
              <div key={`${item.kind}-${idx}`} style={cardStyle}>
                {inner}
              </div>
            );
          })}
        </section>
      )}

      {/* Highlighted, concise Score CTI (0–10) explainer in multi-class mode */}
      {activeSortBy === 'personal_average' &&
        (data?.leaderboard?.some((e) => e.calibrated_score != null) ?? false) && (
          <section
            data-no-size-morph
            style={{
              borderRadius: isMaterialYou ? 20 : 12,
              padding: '11px 14px',
              backgroundColor: `${tokens.primaryContainer}55`,
              border: `1px solid ${tokens.primary}44`,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 260px', fontSize: '0.8rem', lineHeight: 1.4 }}>
                <Scale size={15} color={tokens.primary} style={{ flexShrink: 0 }} />
                <span style={{ color: tokens.onSurface }}>
                  <strong>Score CTI (0 a 10):</strong> ajusta sua nota pela dificuldade da turma (M.T.) pra comparar cursos diferentes —{' '}
                  <span style={{ color: tokens.onSurfaceVariant }}>sua média real do boletim não muda.</span>
                </span>
              </div>

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setShowScoreLegend((v) => !v)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 999,
                    border: `1px solid ${tokens.primary}55`,
                    backgroundColor: showScoreLegend ? tokens.primary : tokens.surfaceContainerLow,
                    color: showScoreLegend ? tokens.onPrimary : tokens.primary,
                    fontSize: '0.73rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  <span>Faixas 0–10</span>
                  {showScoreLegend ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowHowItWorks(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 9px',
                    borderRadius: 999,
                    border: `1px solid ${tokens.outlineVariant}`,
                    backgroundColor: tokens.surfaceContainerLow,
                    color: tokens.onSurfaceVariant,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <HelpCircle size={12} />
                  <span>Detalhes</span>
                </button>
              </div>
            </div>

            {showScoreLegend && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 155px), 1fr))',
                  gap: 6,
                  paddingTop: 2,
                }}
              >
                {[
                  {
                    range: '9,0 – 10,0',
                    label: 'Topo do CTI',
                    desc: 'Muito acima da sala (10,0 = gabarito)',
                    bg: tokens.gradeSuccessContainer,
                    fg: tokens.onGradeSuccessContainer,
                  },
                  {
                    range: '7,8 – 8,9',
                    label: 'Acima do padrão',
                    desc: 'Destaque acima da média da turma',
                    bg: tokens.primaryContainer,
                    fg: tokens.onPrimaryContainer,
                  },
                  {
                    range: '6,8 – 7,7',
                    label: 'Na média do CTI',
                    desc: 'Ritmo esperado da própria turma',
                    bg: tokens.surfaceContainerHigh,
                    fg: tokens.onSurface,
                  },
                  {
                    range: '5,5 – 6,7',
                    label: 'Abaixo da sala',
                    desc: 'Abaixo da M.T. (pode estar aprovado)',
                    bg: tokens.gradeWarningContainer,
                    fg: tokens.onGradeWarningContainer,
                  },
                  {
                    range: '0,0 – 5,4',
                    label: 'Atenção',
                    desc: 'Bem abaixo da sala ou poucas notas',
                    bg: tokens.errorContainer,
                    fg: tokens.onErrorContainer,
                  },
                ].map((band) => (
                  <div
                    key={band.range}
                    style={{
                      padding: '8px 10px',
                      borderRadius: isMaterialYou ? 14 : 8,
                      backgroundColor: tokens.surfaceContainerLow,
                      border: `1px solid ${tokens.outlineVariant}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      <span
                        style={{
                          padding: '1px 7px',
                          borderRadius: 999,
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          backgroundColor: band.bg,
                          color: band.fg,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {band.range}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.76rem', fontWeight: 800, color: tokens.onSurface }}>
                      {band.label}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, lineHeight: 1.3 }}>
                      {band.desc}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

      {/* Compact Goal + Transparency & Nerd Stats Bar (Zero clutter by default) */}
      {(leaderTargetAverage != null || nerdStats != null) && (
        <section
          data-no-size-morph
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            {leaderTargetAverage != null ? (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '7px 13px',
                  borderRadius: isMaterialYou ? 999 : 10,
                  backgroundColor: tokens.primaryContainer,
                  color: tokens.onPrimaryContainer,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <Target size={14} />
                <span>
                  Meta pro 1º lugar: média {leaderTargetAverage.toFixed(2).replace('.', ',')} na sua turma
                </span>
              </div>
            ) : (
              <div />
            )}

            <div style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={() => setShowHowItWorks(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 11px',
                  borderRadius: isMaterialYou ? 999 : 10,
                  border: `1px solid ${tokens.outlineVariant}`,
                  backgroundColor: isMaterialYou ? tokens.surfaceContainerLow : tokens.background,
                  color: tokens.onSurfaceVariant,
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <HelpCircle size={13} />
                <span>Como calculamos?</span>
              </button>

              {nerdStats && (
                <button
                  type="button"
                  onClick={() => setShowNerdStats((prev) => !prev)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 11px',
                    borderRadius: isMaterialYou ? 999 : 10,
                    border: `1px solid ${showNerdStats ? tokens.primary : tokens.outlineVariant}`,
                    backgroundColor: showNerdStats
                      ? tokens.secondaryContainer
                      : isMaterialYou
                        ? tokens.surfaceContainerLow
                        : tokens.background,
                    color: showNerdStats ? tokens.onSecondaryContainer : tokens.onSurfaceVariant,
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <FlaskConical size={13} />
                  <span>Estatísticas para nerds</span>
                  {showNerdStats ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              )}
            </div>
          </div>

          {showNerdStats && nerdStats && (
            <div
              data-no-size-morph
              style={{
                borderRadius: isMaterialYou ? 24 : 14,
                padding: '14px 16px',
                backgroundColor: isMaterialYou ? tokens.surfaceContainerLow : tokens.background,
                border: `1px solid ${tokens.outlineVariant}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 800, color: tokens.primary }}>
                  <FlaskConical size={14} />
                  <span>Motor Estatístico v7 • Seus parâmetros neste recorte</span>
                </div>
                <span style={{ fontSize: '0.7rem', color: tokens.onSurfaceVariant }}>
                  {nerdStats.multi_class_calibrated
                    ? 'Calibração multi-turma ativa (Ridge + Headroom)'
                    : 'Modo turma única (nota direta + shrinkage)'}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
                  gap: 8,
                }}
              >
                {rawBenchmark?.calibrated_score != null && (
                  <div
                    style={{
                      padding: '9px 11px',
                      borderRadius: isMaterialYou ? 16 : 10,
                      backgroundColor: tokens.surfaceContainer,
                    }}
                  >
                    <div style={{ fontSize: '0.67rem', fontWeight: 700, color: tokens.onSurfaceVariant }}>
                      Nota calibrada (score)
                    </div>
                    <div style={{ fontSize: '1.02rem', fontWeight: 800, color: tokens.primary, fontVariantNumeric: 'tabular-nums' }}>
                      {rawBenchmark.calibrated_score.toFixed(2)}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant }}>
                      Média bruta: {rawBenchmark.personal_average.toFixed(2)}
                    </div>
                  </div>
                )}

                <div
                  style={{
                    padding: '9px 11px',
                    borderRadius: isMaterialYou ? 16 : 10,
                    backgroundColor: tokens.surfaceContainer,
                  }}
                >
                  <div style={{ fontSize: '0.67rem', fontWeight: 700, color: tokens.onSurfaceVariant }}>
                    Seu Z-score na turma
                  </div>
                  <div style={{ fontSize: '1.02rem', fontWeight: 800, color: tokens.onSurface, fontVariantNumeric: 'tabular-nums' }}>
                    {nerdStats.z_score >= 0 ? '+' : ''}
                    {nerdStats.z_score.toFixed(2)}σ
                  </div>
                  <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant }}>
                    Dispersão σ_c: {nerdStats.class_sigma.toFixed(2)}
                  </div>
                </div>

                {rawBenchmark?.headroom_pct != null && (
                  <div
                    style={{
                      padding: '9px 11px',
                      borderRadius: isMaterialYou ? 16 : 10,
                      backgroundColor: tokens.surfaceContainer,
                    }}
                  >
                    <div style={{ fontSize: '0.67rem', fontWeight: 700, color: tokens.onSurfaceVariant }}>
                      Margem até o 10 (Headroom)
                    </div>
                    <div style={{ fontSize: '1.02rem', fontWeight: 800, color: tokens.onSurface, fontVariantNumeric: 'tabular-nums' }}>
                      {rawBenchmark.headroom_pct.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant }}>
                      10,00 perfeito sempre = 100%
                    </div>
                  </div>
                )}

                <div
                  style={{
                    padding: '9px 11px',
                    borderRadius: isMaterialYou ? 16 : 10,
                    backgroundColor: tokens.surfaceContainer,
                  }}
                >
                  <div style={{ fontSize: '0.67rem', fontWeight: 700, color: tokens.onSurfaceVariant }}>
                    Nível da turma (θ)
                  </div>
                  <div style={{ fontSize: '1.02rem', fontWeight: 800, color: tokens.onSurface, fontVariantNumeric: 'tabular-nums' }}>
                    {nerdStats.class_theta >= 0 ? '+' : ''}
                    {nerdStats.class_theta.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant }}>
                    M.T. do recorte: {nerdStats.class_mean_mt.toFixed(2)}
                  </div>
                </div>

                <div
                  style={{
                    padding: '9px 11px',
                    borderRadius: isMaterialYou ? 16 : 10,
                    backgroundColor: tokens.surfaceContainer,
                  }}
                >
                  <div style={{ fontSize: '0.67rem', fontWeight: 700, color: tokens.onSurfaceVariant }}>
                    Referência CTI (μ₀ / σ)
                  </div>
                  <div style={{ fontSize: '1.02rem', fontWeight: 800, color: tokens.onSurface, fontVariantNumeric: 'tabular-nums' }}>
                    {nerdStats.school_mu_0.toFixed(2)} ± {nerdStats.school_sigma.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant }}>
                    Ridge 3 efeitos: {nerdStats.ridge_active ? 'ativo' : 'fallback'}
                  </div>
                </div>

                <div
                  style={{
                    padding: '9px 11px',
                    borderRadius: isMaterialYou ? 16 : 10,
                    backgroundColor: tokens.surfaceContainer,
                  }}
                >
                  <div style={{ fontSize: '0.67rem', fontWeight: 700, color: tokens.onSurfaceVariant }}>
                    Cobertura 2D • CARA
                  </div>
                  <div style={{ fontSize: '1.02rem', fontWeight: 800, color: tokens.onSurface, fontVariantNumeric: 'tabular-nums' }}>
                    {nerdStats.coverage_2d_pct.toFixed(0)}% • β={nerdStats.consistency_cara_beta.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant }}>
                    {nerdStats.active_bimesters}{' '}
                    {nerdStats.active_bimesters === 1 ? 'bimestre ativo' : 'bimestres ativos'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Deep Ranking Transparency Modal (strictly about Ranking — zero INI A/B) */}
      {showHowItWorks && (
        <RankingTransparencyModal onClose={() => setShowHowItWorks(false)} />
      )}

      {/* Full-screen comparison: pushed above the ranking, which stays rendered underneath so the
          predictive back gesture reveals it. Rail / bottom navigation remain visible. */}
      {comparisonExpanded && selectedPeerId !== null && (
        <OverlayPage ariaLabel="Comparação entre alunos" onClose={closeComparison}>
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

      {selectedPeerId !== null && !comparisonExpanded && (
        <ExpressiveModal
          ariaLabel="Comparação entre alunos"
          onClose={closeComparison}
          originEl={peerOriginRef.current}
          loadingVeil={comparisonLoading}
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

      {/* 3. LEADERBOARD LIST */}
      <section data-no-size-morph style={{ display: 'flex', flexDirection: 'column', gap: isMaterialYou ? 4 : 8 }}>
        {loading && !data ? (
          <MorphingLoadingState label="Carregando ranking..." />
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
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>
              {scope === 'friends'
                ? 'Nenhum amigo participando do ranking ainda'
                : 'Nenhum participante encontrado neste filtro ainda'}
            </div>
            <div style={{ fontSize: '0.84rem', color: tokens.onSurfaceVariant, marginTop: 4 }}>
              {scope === 'friends'
                ? 'Adicione amigos na busca acima ou alterne para outro escopo.'
                : 'Ative "Participar do Ranking" acima ou alterne para "Todo o CTI".'}
            </div>
          </div>
        ) : (
          data.leaderboard.slice(0, renderCount).map((entry, idx) => (
            <ExpressiveSegmentedCard
              key={entry.account_id}
              index={idx}
              total={data.leaderboard.length}
              selected={entry.is_me || selectedPeerId === entry.account_id}
              onClick={
                !entry.is_me
                  ? () => setSelectedPeerId((prev) => (prev === entry.account_id ? null : entry.account_id))
                  : undefined
              }
              style={
                entry.rank === 1
                  ? {
                      padding: '14px 18px',
                      backgroundImage: `linear-gradient(120deg, ${tokens.gradeWarningContainer}, ${tokens.surfaceContainerLow} 62%)`,
                      border: `1px solid ${tokens.gradeWarning}`,
                      boxShadow: `0 8px 22px -14px ${tokens.gradeWarning}`,
                    }
                  : {
                      padding: '14px 18px',
                    }
              }
            >
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
                  {entry.rank === 1 ? (
                    <span style={{ position: 'relative', display: 'inline-flex', padding: 4, flexShrink: 0 }}>
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 100 100"
                        className="n2sac-crown-halo"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                      >
                        <path d={CROWN_HALO_PATH} fill={tokens.gradeWarning} opacity={0.38} />
                      </svg>
                      <ProfileAvatar
                        name={entry.display_label}
                        image={entry.avatar_url}
                        size={42}
                        rank={1}
                        highlight={entry.is_me}
                        profile={{ ...profilePreview(entry), canOpen: entry.has_public_profile }}
                      />
                    </span>
                  ) : (
                    <ProfileAvatar
                      name={entry.display_label}
                      image={entry.avatar_url}
                      size={42}
                      rank={entry.rank}
                      highlight={entry.is_me}
                      profile={{ ...profilePreview(entry), canOpen: entry.has_public_profile }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    {entry.rank === 1 && (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          marginBottom: 2,
                          fontSize: '0.66rem',
                          fontWeight: 800,
                          letterSpacing: '0.07em',
                          textTransform: 'uppercase',
                          color: tokens.gradeWarning,
                        }}
                      >
                        <Crown size={12} strokeWidth={2.6} />{' '}
                        {crownLabelForSort(activeSortBy, entry.calibrated_score != null)}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.96rem' }}>
                        {entry.display_label}
                      </span>
                      <span
                        style={{
                          padding: '2px 7px',
                          borderRadius: isMaterialYou ? 999 : 6,
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          backgroundColor: tokens.surfaceContainerHighest,
                          color: tokens.onSurfaceVariant,
                        }}
                      >
                        {entry.class_code}
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
                          title="Participante ainda com poucas disciplinas lançadas neste escopo"
                          style={{
                            padding: '2px 7px',
                            borderRadius: isMaterialYou ? 999 : 6,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            backgroundColor: tokens.gradeWarningContainer,
                            color: tokens.onGradeWarningContainer,
                          }}
                        >
                          Parcial ({entry.subjects_count}
                          {data.expected_subjects_count ? `/${data.expected_subjects_count}` : ''} mat.)
                        </span>
                      )}
                      {entry.is_friend && scope !== 'friends' && (
                        <span
                          style={{
                            padding: '2px 7px',
                            borderRadius: isMaterialYou ? 999 : 6,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            backgroundColor: tokens.tertiaryContainer,
                            color: tokens.onTertiaryContainer,
                          }}
                        >
                          Amigo
                        </span>
                      )}
                      {entry.tags &&
                        entry.tags.slice(0, 2).map((tag) => {
                          const badgeColors = harmonizeRoleBadgeColors(
                            tag.color_hex,
                            effectiveSeedHex,
                            effectiveIsDark,
                            isMaterialYou
                          );
                          return (
                            <span
                              key={tag.slug}
                              title={tag.description}
                              style={{
                                padding: '2px 8px',
                                borderRadius: isMaterialYou ? 999 : 6,
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                letterSpacing: '0.01em',
                                backgroundColor: badgeColors.bg,
                                color: badgeColors.fg,
                                border: `1px solid ${badgeColors.border}`,
                              }}
                            >
                              {tag.label}
                            </span>
                          );
                        })}
                      {entry.is_me && (
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
                          Você
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: tokens.onSurfaceVariant, marginTop: 2 }}>
                      {entry.subjects_count} matérias • {entry.total_absences} faltas •{' '}
                      {entry.delta_vs_class >= 0 ? '+' : ''}
                      {entry.delta_vs_class.toFixed(2)} vs sala
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {renderPrimaryMetric(entry)}
                  {!entry.is_me && (
                    <div onClick={(event) => event.stopPropagation()}>
                      <EnhancedMorphButton
                        size="sm"
                        variant={selectedPeerId === entry.account_id ? 'filled' : 'tonal'}
                        icon={<Swords size={13} />}
                        onClick={() => setSelectedPeerId(entry.account_id)}
                      >
                        Comparar
                      </EnhancedMorphButton>
                    </div>
                  )}
                </div>
              </div>
            </ExpressiveSegmentedCard>
          ))
        )}
      </section>
        </>
      )}
    </div>
  );
};

/** Static footprint matching the comparison body while the full-surface ShimmerVeil runs. */
const ComparisonSkeleton: React.FC = () => {
  const { tokens, isMaterialYou } = useM3Theme();
  const block = (height: number, radius: number): React.CSSProperties => ({
    height,
    borderRadius: radius,
    backgroundColor: tokens.surfaceContainerHigh,
    opacity: 0.65,
  });
  return (
    <div role="status" aria-label="Carregando comparação" style={{ marginTop: 18 }}>
      <div style={block(146, isMaterialYou ? 28 : 14)} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <div style={block(88, 22)} />
        <div style={block(88, 22)} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 28 }}>
        <div style={block(118, isMaterialYou ? 22 : 12)} />
        <div style={block(118, isMaterialYou ? 22 : 12)} />
      </div>
    </div>
  );
};
