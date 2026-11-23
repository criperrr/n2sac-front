import React, { useEffect, useMemo, useState } from 'react';
import { ExpressiveModal, MetricTile, ModalHeader, useTransformOrigin } from '../components/expressive/ExpressiveModal';
import {
  Search,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Award,
  X,
  SlidersHorizontal,
  Users,
  Calendar,
  ChevronRight,
  Table2,
  Rows3,
  LayoutGrid,
  BarChart3,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  RotateCcw,
  ArrowUpDown,
} from 'lucide-react';
import { renderSubjectIcon, stripAccents } from '../utils/subjectIcons';
import type { AllYearsResponse, FullGrades, UnifiedBimesterData, YearInfo } from '../api/types';
import { useM3Theme } from '../theme/ThemeContext';
import {
  AnimatedNumber,
  EnhancedConnectedButtonGroup,
  EnhancedMorphButton,
  ExpressiveGradeCompareBar,
  ExpressiveSegmentedCard,
  IconShapeContainer,
} from '../components/expressive/ExpressivePrimitives';
import { useBackLayer } from '../navigation/backStack';
import { MorphingLoadingState } from '../components/expressive/ShapeMorph';
import { Expandable } from '../components/expressive/Expandable';
import { GradeRevealScore } from '../components/GradeRevealScore';

type BimesterViewMode = 'overview' | '1' | '2' | '3' | '4' | 'compare' | 'recovery';
type BoletimLayoutMode = 'table' | 'cards' | 'grid' | 'comparative';

type GoalCategoryFilter = 'all' | 'passed_24' | 'comfortable' | 'attention' | 'critical';
type ClassComparisonFilter = 'all' | 'above_class' | 'below_class' | 'standout_plus_1' | 'deficit_minus_1';
type TrendCategoryFilter = 'all' | 'rising' | 'falling' | 'stable';
type RecoveryCategoryFilter = 'all' | 'any_rec_or_low' | 'sat_only' | 'ins_nc_only' | 'clean_only';
type GradeRangePreset = 'all' | 'gte_8' | 'gte_6' | 'lt_6';
type AbsenceRangePreset = 'all' | 'zero' | 'has_absences' | 'high_absences';
type SubjectSortMode =
  | 'alpha_asc'
  | 'grade_desc'
  | 'grade_asc'
  | 'delta_desc'
  | 'delta_asc'
  | 'absences_desc'
  | 'priority_desc';

interface AdvancedBoletimFilters {
  goalCategory: GoalCategoryFilter;
  classComparison: ClassComparisonFilter;
  trendCategory: TrendCategoryFilter;
  recoveryCategory: RecoveryCategoryFilter;
  gradeRange: GradeRangePreset;
  absenceRange: AbsenceRangePreset;
  subjectAreas: SubjectAreaKey[];
  postedBimesters: number[];
  sortBy: SubjectSortMode;
}

const DEFAULT_ADVANCED_FILTERS: AdvancedBoletimFilters = {
  goalCategory: 'all',
  classComparison: 'all',
  trendCategory: 'all',
  recoveryCategory: 'all',
  gradeRange: 'all',
  absenceRange: 'all',
  subjectAreas: [],
  postedBimesters: [],
  sortBy: 'alpha_asc',
};

const LAYOUT_STORAGE_KEY = 'n2sac_boletim_layout_v1';
const CTI_PASSING_POINTS_TOTAL = 24.0;
const CTI_MAX_POINTS_TOTAL = 40.0;
const CTI_PASSING_AVERAGE = 6.0;

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

/**
 * Typo-tolerant fuzzy matcher for subject search (e.g. "fiscsd" -> "Física").
 * Matches substring directly, abbreviation, or Levenshtein edit distance against words.
 */
function fuzzyMatchSubject(subjectName: string, normQuery: string): boolean {
  if (!normQuery) return true;
  const normName = stripAccents(subjectName);
  if (normName.includes(normQuery)) return true;

  const words = normName.split(/[\s\-/]+/).filter((w) => w.length >= 2);
  const maxDist = normQuery.length <= 4 ? 1 : Math.min(3, Math.ceil(normQuery.length * 0.42));

  for (const word of words) {
    if (word.startsWith(normQuery)) return true;
    // Compare full word or prefix of similar length
    const slice = word.length > normQuery.length + 1 ? word.slice(0, normQuery.length + 1) : word;
    if (levenshteinDistance(normQuery, slice) <= maxDist) return true;
    if (levenshteinDistance(normQuery, word) <= maxDist) return true;
  }

  return levenshteinDistance(normQuery, normName.slice(0, normQuery.length + 2)) <= maxDist;
}

type SubjectAreaKey = 'exatas' | 'humanas' | 'linguagens' | 'tecnicas';

function classifySubjectArea(subjectName: string): SubjectAreaKey {
  const n = stripAccents(subjectName);
  if (
    n.includes('matemat') ||
    n.includes('fisic') ||
    n.includes('quimic') ||
    n.includes('biolog') ||
    n.includes('calculo') ||
    n.includes('estatist')
  ) {
    return 'exatas';
  }
  if (
    n.includes('histor') ||
    n.includes('geograf') ||
    n.includes('filosof') ||
    n.includes('sociolog')
  ) {
    return 'humanas';
  }
  if (
    n.includes('portug') ||
    n.includes('literat') ||
    n.includes('redac') ||
    n.includes('ingles') ||
    n.includes('espanhol') ||
    n.includes('arte') ||
    n.includes('educacao fisica')
  ) {
    return 'linguagens';
  }
  return 'tecnicas';
}

export interface SubjectAcademicAnalysis {
  subject: FullGrades;
  postedCount: number;
  remainingBimesters: number;
  accumulatedPoints: number;
  guaranteedAnnualAvg: number;
  extraAvgPoints: number;
  pointsRemainingTo24: number;
  requiredGradePerRemaining: number;
  personalAvg: number | null;
  classAvg: number | null;
  deltaVsClass: number | null;
  latestBimester: number | null;
  latestGrade: number | null;
  previousBimester: number | null;
  previousGrade: number | null;
  trendDelta: number | null;
  totalAbsences: number;
  absenceSharePercent: number;
  hasSatRecovery: boolean;
  hasFailedRecovery: boolean;
  hasAnyRecovery: boolean;
  goalStatus:
    | 'passed_24'
    | 'comfortable'
    | 'attention'
    | 'needs_recovery'
    | 'completed_pass'
    | 'completed_fail'
    | 'pending';
  goalBadgeText: string;
  goalDetailText: string;
}

/**
 * In NSAC Online, when a bimester has NOT been posted yet by the teacher,
 * NSAC returns `0,0` for the student's grade (`M.B. = 0.0`) AND `0,0` for the
 * class average (`M.T. = 0.0`), with `recovery = false` and `recoveryCode = 'NAC'`.
 * Treating those `0.0` placeholders as posted grades would falsely fail in-progress
 * students, create fake `-10.0` trend drops, and drag down annual averages.
 */
export function isBimesterPosted(bi: UnifiedBimesterData): boolean {
  const pGrade = bi.personal.grade;
  const cGrade = bi.class.averageGrade;
  if (pGrade === null || pGrade === undefined) return false;
  if (
    pGrade === 0 &&
    (cGrade === null || cGrade === undefined || cGrade === 0) &&
    !bi.personal.recovery &&
    (!bi.personal.recoveryCode || bi.personal.recoveryCode === 'NAC')
  ) {
    return false;
  }
  return true;
}

export function normalizeYearInfo(yr: YearInfo): YearInfo {
  return {
    ...yr,
    grades: yr.grades.map((subj) => {
      const normalizedBimesters = subj.bimesters.map((bi) => {
        const posted = isBimesterPosted(bi);
        const classPosted =
          bi.class.averageGrade !== null &&
          bi.class.averageGrade !== undefined &&
          (bi.class.averageGrade > 0 || posted);
        return {
          ...bi,
          personal: {
            ...bi.personal,
            grade: posted ? bi.personal.grade : null,
          },
          class: {
            ...bi.class,
            averageGrade: classPosted ? bi.class.averageGrade : null,
          },
        };
      });
      return {
        ...subj,
        bimesters: normalizedBimesters,
      };
    }),
  };
}

function formatShortYearPill(y: YearInfo): string {
  const seriesMatch = y.title.match(/([1-4])\s*[º°]/i) ?? y.title.match(/\b[A-Z]{2,4}([1-4])\b/i);
  if (seriesMatch?.[1]) {
    return `${y.year} • ${seriesMatch[1]}º Ano`;
  }
  return String(y.year);
}

function formatPtBr(num: number, decimals: number): string {
  return num.toFixed(decimals).replace('.', ',');
}

export function analyzeSubject(
  subject: FullGrades,
  yearTotalAbsences: number,
  yearStatus: string
): SubjectAcademicAnalysis {
  const sortedBimesters = [...subject.bimesters].sort((a, b) => a.bimester - b.bimester);
  const postedBimesters = sortedBimesters.filter((b) => isBimesterPosted(b));
  const postedClassBimesters = sortedBimesters.filter(
    (b) => b.class.averageGrade !== null && b.class.averageGrade > 0
  );

  const postedCount = postedBimesters.length;
  const remainingBimesters = Math.max(0, 4 - postedCount);

  const accumulatedPoints = postedBimesters.reduce(
    (acc, b) => acc + (b.personal.grade ?? 0),
    0
  );
  const guaranteedAnnualAvg = accumulatedPoints / 4;
  const extraAvgPoints = Math.max(0, (accumulatedPoints - CTI_PASSING_POINTS_TOTAL) / 4);
  const pointsRemainingTo24 = Math.max(0, CTI_PASSING_POINTS_TOTAL - accumulatedPoints);
  const requiredGradePerRemaining =
    remainingBimesters > 0 ? pointsRemainingTo24 / remainingBimesters : 0;

  // While bimesters are still remaining (`remainingBimesters > 0`), NSAC's `results.grade`
  // divides accumulated points by 4 prematurely (e.g. 19.5 / 4 = 4.9 after 2 bimesters).
  // Use the true average of posted bimesters while in progress.
  const personalAvg =
    remainingBimesters === 0 && subject.results.grade !== null && subject.results.grade > 0
      ? subject.results.grade
      : postedCount > 0
        ? accumulatedPoints / postedCount
        : null;

  const classAvg =
    postedClassBimesters.length > 0
      ? postedClassBimesters.reduce((acc, b) => acc + (b.class.averageGrade ?? 0), 0) /
        postedClassBimesters.length
      : null;

  const deltaVsClass =
    personalAvg !== null && classAvg !== null ? personalAvg - classAvg : null;

  const latestPosted = postedBimesters[postedBimesters.length - 1] ?? null;
  const prevPosted =
    postedBimesters.length >= 2 ? (postedBimesters[postedBimesters.length - 2] ?? null) : null;

  const latestBimester = latestPosted?.bimester ?? null;
  const latestGrade = latestPosted?.personal.grade ?? null;
  const previousBimester = prevPosted?.bimester ?? null;
  const previousGrade = prevPosted?.personal.grade ?? null;
  const trendDelta =
    latestGrade !== null && previousGrade !== null ? latestGrade - previousGrade : null;

  const totalAbsences = subject.results.totalAbsences;
  const absenceSharePercent =
    yearTotalAbsences > 0 ? (totalAbsences / yearTotalAbsences) * 100 : 0;

  const hasSatRecovery = sortedBimesters.some(
    (b) => b.personal.recoveryCode === 'SAT' || b.personal.recovered === true
  );
  const hasFailedRecovery = sortedBimesters.some(
    (b) => b.personal.recoveryCode === 'INS' || b.personal.recoveryCode === 'NC'
  );
  const hasAnyRecovery = sortedBimesters.some(
    (b) =>
      b.personal.recovery ||
      (b.personal.recoveryCode !== undefined && b.personal.recoveryCode !== 'NAC')
  );

  const isCompletedYear =
    !stripAccents(yearStatus).includes('cursando') && remainingBimesters === 0;

  let goalStatus: SubjectAcademicAnalysis['goalStatus'];
  let goalBadgeText: string;
  let goalDetailText: string;

  if (postedCount === 0) {
    goalStatus = 'pending';
    goalBadgeText = 'Aguardando lançamento';
    goalDetailText = 'Nenhum bimestre lançado até o momento';
  } else if (accumulatedPoints >= CTI_PASSING_POINTS_TOTAL - 0.001) {
    const extraFormatted = formatPtBr(extraAvgPoints, 2);
    const guaranteedFormatted = formatPtBr(guaranteedAnnualAvg, 2);
    const badgeSuffix =
      extraAvgPoints >= 0.01
        ? `+${extraFormatted} na média`
        : 'média 6,00 garantida';

    if (remainingBimesters === 0 || isCompletedYear) {
      goalStatus = 'completed_pass';
      goalBadgeText = `Aprovado (${badgeSuffix})`;
      goalDetailText = `Média final: ${guaranteedFormatted} (+${extraFormatted} acima de 6,0 • ${formatPtBr(accumulatedPoints, 1)}/40 pts)`;
    } else {
      goalStatus = 'passed_24';
      goalBadgeText = `Aprovado (${badgeSuffix})`;
      goalDetailText = `Média anual garantida: ${guaranteedFormatted} (+${extraFormatted} acima de 6,0 com ${postedCount} bim.)`;
    }
  } else if (remainingBimesters === 0) {
    const finalPass = (personalAvg ?? 0) >= CTI_PASSING_AVERAGE && !hasFailedRecovery;
    goalStatus = finalPass ? 'completed_pass' : 'completed_fail';
    goalBadgeText = finalPass ? 'Aprovado' : 'Exame / Retido';
    goalDetailText = `Média anual: ${formatPtBr(guaranteedAnnualAvg, 2)} (${formatPtBr(accumulatedPoints, 1)} / 24,0 pts)`;
  } else if (requiredGradePerRemaining <= 6.0) {
    goalStatus = 'comfortable';
    goalBadgeText = `Precisa de ${formatPtBr(requiredGradePerRemaining, 1)}/bim (${remainingBimesters} restantes)`;
    goalDetailText = `Faltam ${formatPtBr(pointsRemainingTo24, 1)} pts (+${formatPtBr(pointsRemainingTo24 / 4, 2)} na média anual) p/ fechar 24,0`;
  } else if (requiredGradePerRemaining <= 10.0) {
    goalStatus = 'attention';
    goalBadgeText = `Precisa de ${formatPtBr(requiredGradePerRemaining, 1)}/bim p/ média 6,0`;
    goalDetailText = `Faltam ${formatPtBr(pointsRemainingTo24, 1)} pts em ${remainingBimesters} bimestre(s) p/ fechar 24,0`;
  } else {
    goalStatus = 'needs_recovery';
    goalBadgeText = `Exige Recuperação (faltam ${formatPtBr(pointsRemainingTo24, 1)} pts)`;
    goalDetailText = `Meta por bimestre (${formatPtBr(requiredGradePerRemaining, 1)}) supera 10,0`;
  }

  return {
    subject,
    postedCount,
    remainingBimesters,
    accumulatedPoints,
    guaranteedAnnualAvg,
    extraAvgPoints,
    pointsRemainingTo24,
    requiredGradePerRemaining,
    personalAvg,
    classAvg,
    deltaVsClass,
    latestBimester,
    latestGrade,
    previousBimester,
    previousGrade,
    trendDelta,
    totalAbsences,
    absenceSharePercent,
    hasSatRecovery,
    hasFailedRecovery,
    hasAnyRecovery,
    goalStatus,
    goalBadgeText,
    goalDetailText,
  };
}

export const BoletimScreen: React.FC<{
  boletim: AllYearsResponse | null;
  loading: boolean;
}> = ({ boletim, loading }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const years = useMemo(() => {
    if (!boletim?.data?.length) return [];
    return [...boletim.data].map(normalizeYearInfo).sort((a, b) => b.year - a.year);
  }, [boletim]);

  const [selectedYearNum, setSelectedYearNum] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<BimesterViewMode>('overview');
  const [layoutMode, setLayoutMode] = useState<BoletimLayoutMode>(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY) as BoletimLayoutMode | null;
      if (
        saved === 'table' ||
        saved === 'cards' ||
        saved === 'grid' ||
        saved === 'comparative'
      ) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'cards';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [minGradeFilter, setMinGradeFilter] = useState<number>(0);
  const [onlyBelowClassAvg, setOnlyBelowClassAvg] = useState(false);
  const [showAdvancedFilterMenu, setShowAdvancedFilterMenu] = useState(false);
  useBackLayer(showAdvancedFilterMenu, () => setShowAdvancedFilterMenu(false));
  const [collapsedFilterGroups, setCollapsedFilterGroups] = useState<Record<string, boolean>>({});
  const [advFilters, setAdvFilters] = useState<AdvancedBoletimFilters>(DEFAULT_ADVANCED_FILTERS);
  const [selectedSubjectName, setSelectedSubjectName] = useState<string | null>(null);
  const { originRef: subjectOriginRef, onClickCapture: captureSubjectOrigin } = useTransformOrigin();

  const toggleFilterGroup = (groupKey: string) => {
    setCollapsedFilterGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const toggleSubjectArea = (area: SubjectAreaKey) => {
    setAdvFilters((prev) => ({
      ...prev,
      subjectAreas: prev.subjectAreas.includes(area)
        ? prev.subjectAreas.filter((a) => a !== area)
        : [...prev.subjectAreas, area],
    }));
  };

  const togglePostedBimester = (bi: number) => {
    setAdvFilters((prev) => ({
      ...prev,
      postedBimesters: prev.postedBimesters.includes(bi)
        ? prev.postedBimesters.filter((b) => b !== bi)
        : [...prev.postedBimesters, bi],
    }));
  };

  const activeAdvancedFilterCount = useMemo(() => {
    let cnt = 0;
    if (advFilters.goalCategory !== 'all') cnt++;
    if (advFilters.classComparison !== 'all') cnt++;
    if (advFilters.subjectAreas.length > 0) cnt += advFilters.subjectAreas.length;
    if (advFilters.postedBimesters.length > 0) cnt += advFilters.postedBimesters.length;
    if (advFilters.trendCategory !== 'all') cnt++;
    if (advFilters.recoveryCategory !== 'all') cnt++;
    if (advFilters.gradeRange !== 'all') cnt++;
    if (advFilters.absenceRange !== 'all') cnt++;
    if (advFilters.sortBy !== 'alpha_asc') cnt++;
    if (onlyBelowClassAvg) cnt++;
    if (minGradeFilter > 0) cnt++;
    return cnt;
  }, [advFilters, onlyBelowClassAvg, minGradeFilter]);

  const resetAllFilters = () => {
    setSearchQuery('');
    setMinGradeFilter(0);
    setOnlyBelowClassAvg(false);
    setViewMode('overview');
    setAdvFilters(DEFAULT_ADVANCED_FILTERS);
  };

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, layoutMode);
    } catch {
      // ignore
    }
  }, [layoutMode]);

  const activeYear: YearInfo | null = useMemo(() => {
    if (!years.length) return null;
    if (selectedYearNum !== null) {
      return years.find((y) => y.year === selectedYearNum) ?? years[0] ?? null;
    }
    return years[0] ?? null;
  }, [years, selectedYearNum]);

  // Compute global statistics & deep academic insights for the active school year
  const yearAnalytics = useMemo(() => {
    if (!activeYear) {
      return {
        personalAvg: 0,
        classAvg: 0,
        delta: 0,
        totalAbsences: 0,
        bimesterAbsences: [0, 0, 0, 0] as [number, number, number, number],
        recoveryCount: 0,
        recoveryOrBelowSixCount: 0,
        belowSixCount: 0,
        subjectCount: 0,
        aboveClassCount: 0,
        comparedWithClassCount: 0,
        mathPassedCount: 0,
        needsAttentionCount: 0,
        bestVsClass: null as SubjectAcademicAnalysis | null,
        priorityStudy: null as SubjectAcademicAnalysis | null,
        topAbsenceSubject: null as SubjectAcademicAnalysis | null,
        analyses: [] as SubjectAcademicAnalysis[],
        analysesByName: new Map<string, SubjectAcademicAnalysis>(),
      };
    }

    let personalSum = 0;
    let personalCount = 0;
    let classSum = 0;
    let classCount = 0;
    let totalAbsences = 0;
    const bimesterAbsences: [number, number, number, number] = [0, 0, 0, 0];
    let recoveryCount = 0;
    let belowSixCount = 0;

    for (const subj of activeYear.grades) {
      totalAbsences += subj.results.totalAbsences;
      let subjHasRecovery = false;
      let subjHasBelowSix = false;

      for (const bi of subj.bimesters) {
        if (bi.bimester >= 1 && bi.bimester <= 4) {
          bimesterAbsences[bi.bimester - 1] =
            (bimesterAbsences[bi.bimester - 1] ?? 0) + bi.personal.absences;
        }
        if (bi.personal.grade !== null) {
          personalSum += bi.personal.grade;
          personalCount++;
          if (bi.personal.grade < 6.0) subjHasBelowSix = true;
        }
        if (bi.class.averageGrade !== null) {
          classSum += bi.class.averageGrade;
          classCount++;
        }
        if (
          bi.personal.recovery ||
          (bi.personal.recoveryCode && bi.personal.recoveryCode !== 'NAC')
        ) {
          subjHasRecovery = true;
        }
      }

      if (subjHasRecovery) recoveryCount++;
      if (subjHasBelowSix) belowSixCount++;
    }

    const recoveryOrBelowSixCount = activeYear.grades.filter((subj) =>
      subj.bimesters.some(
        (b) =>
          b.personal.recovery ||
          (b.personal.recoveryCode && b.personal.recoveryCode !== 'NAC') ||
          (b.personal.grade !== null && b.personal.grade < 6.0)
      )
    ).length;

    const analyses = activeYear.grades.map((s) =>
      analyzeSubject(s, totalAbsences, activeYear.status)
    );
    const analysesByName = new Map<string, SubjectAcademicAnalysis>();
    analyses.forEach((a) => analysesByName.set(a.subject.subjectName, a));

    const withClassComparison = analyses.filter((a) => a.deltaVsClass !== null);
    const aboveClassCount = withClassComparison.filter(
      (a) => (a.deltaVsClass ?? 0) >= 0
    ).length;

    const mathPassedCount = analyses.filter(
      (a) => a.goalStatus === 'passed_24' || a.goalStatus === 'completed_pass'
    ).length;

    const needsAttentionCount = analyses.filter(
      (a) =>
        a.goalStatus === 'attention' ||
        a.goalStatus === 'needs_recovery' ||
        a.goalStatus === 'completed_fail'
    ).length;

    const sortedByDeltaDesc = [...withClassComparison].sort(
      (a, b) => (b.deltaVsClass ?? 0) - (a.deltaVsClass ?? 0)
    );
    const bestVsClass = sortedByDeltaDesc[0] ?? null;

    // Priority study: highest required grade per remaining bimester, or lowest personal average
    const sortedByDifficulty = [...analyses].sort((a, b) => {
      if (a.remainingBimesters > 0 || b.remainingBimesters > 0) {
        return b.requiredGradePerRemaining - a.requiredGradePerRemaining;
      }
      return (a.personalAvg ?? 10) - (b.personalAvg ?? 10);
    });
    const priorityStudy = sortedByDifficulty[0] ?? null;

    const sortedByAbsences = [...analyses]
      .filter((a) => a.totalAbsences > 0)
      .sort((a, b) => b.totalAbsences - a.totalAbsences);
    const topAbsenceSubject = sortedByAbsences[0] ?? null;

    const personalAvg = personalCount > 0 ? personalSum / personalCount : 0;
    const classAvg = classCount > 0 ? classSum / classCount : 0;

    return {
      personalAvg,
      classAvg,
      delta: personalAvg - classAvg,
      totalAbsences,
      bimesterAbsences,
      recoveryCount,
      recoveryOrBelowSixCount,
      belowSixCount,
      subjectCount: activeYear.grades.length,
      aboveClassCount,
      comparedWithClassCount: withClassComparison.length,
      mathPassedCount,
      needsAttentionCount,
      bestVsClass,
      priorityStudy,
      topAbsenceSubject,
      analyses,
      analysesByName,
    };
  }, [activeYear]);

  // Filter subjects with accent-insensitive NFD matching + deep multi-criteria filters & sorting
  const filteredAnalyses = useMemo(() => {
    if (!activeYear) return [];
    const normQuery = stripAccents(searchQuery.trim());

    const targetBiNum =
      viewMode === '1' || viewMode === '2' || viewMode === '3' || viewMode === '4'
        ? Number(viewMode)
        : null;

    const list = yearAnalytics.analyses.filter((item) => {
      const subj = item.subject;
      if (normQuery && !fuzzyMatchSubject(subj.subjectName, normQuery)) {
        return false;
      }

      if (advFilters.subjectAreas.length > 0) {
        const area = classifySubjectArea(subj.subjectName);
        if (!advFilters.subjectAreas.includes(area)) return false;
      }

      if (advFilters.postedBimesters.length > 0) {
        const hasAllRequested = advFilters.postedBimesters.every((biNum) => {
          const found = subj.bimesters.find((b) => b.bimester === biNum);
          return found !== undefined && found.personal.grade !== null;
        });
        if (!hasAllRequested) return false;
      }

      // 1. Recovery viewMode tab: strictly show ONLY subjects that have a real posted recovery
      // or a real posted bimester grade < 6.0 (unposted 0.0 / M.T. 0.0 bimesters are already normalized to null)
      if (viewMode === 'recovery') {
        const hasRecOrBelowSix = subj.bimesters.some(
          (b) =>
            b.personal.recovery ||
            (b.personal.recoveryCode !== undefined && b.personal.recoveryCode !== 'NAC') ||
            (b.personal.grade !== null && b.personal.grade < 6.0)
        );
        if (!hasRecOrBelowSix) return false;
      }

      // 2. Advanced filter: Situação Acadêmica / Meta 24 pts
      if (advFilters.goalCategory !== 'all') {
        if (
          advFilters.goalCategory === 'passed_24' &&
          item.goalStatus !== 'passed_24' &&
          item.goalStatus !== 'completed_pass'
        ) {
          return false;
        }
        if (advFilters.goalCategory === 'comfortable' && item.goalStatus !== 'comfortable') {
          return false;
        }
        if (advFilters.goalCategory === 'attention' && item.goalStatus !== 'attention') {
          return false;
        }
        if (
          advFilters.goalCategory === 'critical' &&
          item.goalStatus !== 'needs_recovery' &&
          item.goalStatus !== 'completed_fail'
        ) {
          return false;
        }
      }

      // 3. Evaluate scoped grades (either the selected bimester or all posted bimesters)
      const gradesList = targetBiNum
        ? subj.bimesters.filter((b) => b.bimester === targetBiNum)
        : subj.bimesters;

      const validPersonal = gradesList
        .map((b) => b.personal.grade)
        .filter((g): g is number => g !== null);
      const validClass = gradesList
        .map((b) => b.class.averageGrade)
        .filter((g): g is number => g !== null);

      const avgP: number | null =
        validPersonal.length > 0
          ? validPersonal.reduce((a, b) => a + b, 0) / validPersonal.length
          : targetBiNum === null
            ? item.personalAvg
            : null;
      const avgC: number | null =
        validClass.length > 0
          ? validClass.reduce((a, b) => a + b, 0) / validClass.length
          : targetBiNum === null
            ? item.classAvg
            : null;
      const deltaScoped: number | null =
        avgP !== null && avgC !== null ? avgP - avgC : null;

      // Quick filter buttons
      if (minGradeFilter > 0) {
        if (avgP === null || avgP < minGradeFilter) return false;
      }

      if (onlyBelowClassAvg) {
        if (deltaScoped === null || deltaScoped >= 0) return false;
      }

      // 4. Advanced filter: Desempenho vs Média da Sala (M.T.)
      if (advFilters.classComparison !== 'all') {
        if (deltaScoped === null) return false;
        if (advFilters.classComparison === 'above_class' && deltaScoped < 0) return false;
        if (advFilters.classComparison === 'below_class' && deltaScoped >= 0) return false;
        if (advFilters.classComparison === 'standout_plus_1' && deltaScoped < 1.0) return false;
        if (advFilters.classComparison === 'deficit_minus_1' && deltaScoped > -1.0) return false;
      }

      // 5. Advanced filter: Tendência de Evolução (Último Bimestre Lançado vs Anterior)
      if (advFilters.trendCategory !== 'all') {
        if (item.trendDelta === null) return false;
        if (advFilters.trendCategory === 'rising' && item.trendDelta <= 0.05) return false;
        if (advFilters.trendCategory === 'falling' && item.trendDelta >= -0.05) return false;
        if (
          advFilters.trendCategory === 'stable' &&
          (item.trendDelta > 0.05 || item.trendDelta < -0.05)
        ) {
          return false;
        }
      }

      // 6. Advanced filter: Status de Recuperação Específico
      if (advFilters.recoveryCategory !== 'all') {
        const hasAnyRecOrLow = gradesList.some(
          (b) =>
            b.personal.recovery ||
            (b.personal.recoveryCode !== undefined && b.personal.recoveryCode !== 'NAC') ||
            (b.personal.grade !== null && b.personal.grade < 6.0)
        );
        const hasSat = gradesList.some(
          (b) => b.personal.recoveryCode === 'SAT' || b.personal.recovered === true
        );
        const hasInsOrNc = gradesList.some(
          (b) => b.personal.recoveryCode === 'INS' || b.personal.recoveryCode === 'NC'
        );

        if (advFilters.recoveryCategory === 'any_rec_or_low' && !hasAnyRecOrLow) return false;
        if (advFilters.recoveryCategory === 'sat_only' && !hasSat) return false;
        if (advFilters.recoveryCategory === 'ins_nc_only' && !hasInsOrNc) return false;
        if (advFilters.recoveryCategory === 'clean_only' && hasAnyRecOrLow) return false;
      }

      // 7. Advanced filter: Faixa de Nota (M.B.)
      if (advFilters.gradeRange !== 'all') {
        if (avgP === null) return false;
        if (advFilters.gradeRange === 'gte_8' && avgP < 8.0) return false;
        if (advFilters.gradeRange === 'gte_6' && avgP < 6.0) return false;
        if (advFilters.gradeRange === 'lt_6' && avgP >= 6.0) return false;
      }

      // 8. Advanced filter: Faixa de Faltas
      if (advFilters.absenceRange !== 'all') {
        const scopedAbsences = targetBiNum
          ? gradesList.reduce((acc, b) => acc + b.personal.absences, 0)
          : item.totalAbsences;
        if (advFilters.absenceRange === 'zero' && scopedAbsences !== 0) return false;
        if (advFilters.absenceRange === 'has_absences' && scopedAbsences <= 0) return false;
        if (advFilters.absenceRange === 'high_absences' && scopedAbsences < 6) return false;
      }

      return true;
    });

    // 9. Apply Custom Sorting (`advFilters.sortBy`)
    return [...list].sort((a, b) => {
      switch (advFilters.sortBy) {
        case 'grade_desc':
          return (b.personalAvg ?? -1) - (a.personalAvg ?? -1);
        case 'grade_asc':
          return (a.personalAvg ?? 99) - (b.personalAvg ?? 99);
        case 'delta_desc':
          return (b.deltaVsClass ?? -99) - (a.deltaVsClass ?? -99);
        case 'delta_asc':
          return (a.deltaVsClass ?? 99) - (b.deltaVsClass ?? 99);
        case 'absences_desc':
          return b.totalAbsences - a.totalAbsences;
        case 'priority_desc':
          if (a.remainingBimesters > 0 || b.remainingBimesters > 0) {
            return b.requiredGradePerRemaining - a.requiredGradePerRemaining;
          }
          return (a.personalAvg ?? 10) - (b.personalAvg ?? 10);
        case 'alpha_asc':
        default:
          return a.subject.subjectName.localeCompare(b.subject.subjectName, 'pt-BR');
      }
    });
  }, [
    activeYear,
    yearAnalytics.analyses,
    searchQuery,
    viewMode,
    minGradeFilter,
    onlyBelowClassAvg,
    advFilters,
  ]);

  const selectedAnalysis = useMemo(() => {
    if (!selectedSubjectName) return null;
    return yearAnalytics.analysesByName.get(selectedSubjectName) ?? null;
  }, [selectedSubjectName, yearAnalytics.analysesByName]);

  if (loading && !boletim) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: 'center',
          borderRadius: 28,
          backgroundColor: tokens.surfaceContainerLow,
          border: `1px solid ${tokens.outlineVariant}`,
        }}
      >
        <MorphingLoadingState label="Carregando boletim..." minHeight={180} />
      </div>
    );
  }

  if (!activeYear) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: 'center',
          borderRadius: 28,
          backgroundColor: tokens.surfaceContainerLow,
          border: `1px solid ${tokens.outlineVariant}`,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Nenhum ano letivo encontrado</div>
      </div>
    );
  }

  const deltaPositive = yearAnalytics.delta >= 0;

  return (
    <div
      onClickCapture={captureSubjectOrigin}
      style={{ display: 'flex', flexDirection: 'column', gap: isMaterialYou ? 18 : 14 }}
    >
      {/* 1. HERO CARD */}
      <section
        style={{
          borderRadius: isMaterialYou ? 32 : 12,
          padding: isMaterialYou ? '24px 22px' : '20px 20px',
          backgroundColor: tokens.surfaceContainerLow,
          border: `1px solid ${tokens.outlineVariant}`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {isMaterialYou && (
          <div
            style={{
              position: 'absolute',
              top: -60,
              right: -30,
              width: 240,
              height: 240,
              borderRadius: 999,
              background: `radial-gradient(circle, ${tokens.primaryContainer} 0%, transparent 70%)`,
              opacity: 0.55,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Top row: Detected Class Code + Year Selector Pills */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 18,
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <IconShapeContainer size={isMaterialYou ? 54 : 42} active>
              <Award size={isMaterialYou ? 26 : 20} />
            </IconShapeContainer>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                  className={!isMaterialYou ? 'openai-serif-display' : undefined}
                  style={{
                    fontSize: isMaterialYou ? '1.65rem' : '2.1rem',
                    fontWeight: isMaterialYou ? 800 : 400,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {activeYear.title}
                </span>
                <span
                  style={{
                    padding: isMaterialYou ? '4px 12px' : '2px 8px',
                    borderRadius: isMaterialYou ? 999 : 6,
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    backgroundColor: tokens.primaryContainer,
                    color: tokens.onPrimaryContainer,
                  }}
                >
                  {activeYear.year} • {activeYear.status}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: tokens.onSurfaceVariant, marginTop: 2 }}>
                {yearAnalytics.subjectCount} disciplinas • Meta de aprovação direta CTI: 24,0 pts
                (média 6,0)
              </div>
            </div>
          </div>

          {/* School Year Connected Pill Selector (concise year + series, no redundant course name) */}
          {years.length > 1 && (
            <div style={{ maxWidth: '100%', minWidth: 0 }}>
              <EnhancedConnectedButtonGroup
                wrap={true}
                scrollable={false}
                value={activeYear.year}
                onChange={(yr) => setSelectedYearNum(Number(yr))}
                options={years.map((y) => ({
                  value: y.year,
                  label: formatShortYearPill(y),
                }))}
              />
            </div>
          )}
        </div>

        {/* Hero Metrics Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
            gap: 10,
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Your General Average (M.B.) */}
          <div
            style={{
              padding: '15px 16px',
              borderRadius: isMaterialYou ? 24 : 10,
              backgroundColor: isMaterialYou ? tokens.primaryContainer : tokens.surfaceContainer,
              color: isMaterialYou ? tokens.onPrimaryContainer : tokens.onSurface,
              border: isMaterialYou ? 'none' : `1px solid ${tokens.outlineVariant}`,
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isMaterialYou ? undefined : tokens.onSurfaceVariant, opacity: 0.85, textTransform: 'uppercase' }}>
              Sua Média Geral (M.B.)
            </div>
            <div
              style={{
                fontSize: isMaterialYou ? '2.1rem' : '1.85rem',
                fontWeight: 800,
                lineHeight: 1.15,
                marginTop: 4,
              }}
            >
              <AnimatedNumber value={yearAnalytics.personalAvg} decimals={2} />
            </div>
            <div style={{ fontSize: '0.75rem', marginTop: 4, opacity: 0.9 }}>
              {yearAnalytics.mathPassedCount} de {yearAnalytics.subjectCount} já aprovadas
            </div>
          </div>

          {/* Class General Average (M.T.) */}
          <div
            style={{
              padding: '15px 16px',
              borderRadius: isMaterialYou ? 24 : 10,
              backgroundColor: isMaterialYou ? tokens.secondaryContainer : tokens.surfaceContainer,
              color: isMaterialYou ? tokens.onSecondaryContainer : tokens.onSurface,
              border: isMaterialYou ? 'none' : `1px solid ${tokens.outlineVariant}`,
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isMaterialYou ? undefined : tokens.onSurfaceVariant, opacity: 0.85, textTransform: 'uppercase' }}>
              Média da Sala (M.T.)
            </div>
            <div
              style={{
                fontSize: isMaterialYou ? '2.1rem' : '1.85rem',
                fontWeight: 800,
                lineHeight: 1.15,
                marginTop: 4,
              }}
            >
              <AnimatedNumber value={yearAnalytics.classAvg} decimals={2} />
            </div>
            <div style={{ fontSize: '0.75rem', marginTop: 4, opacity: 0.9 }}>
              Acima da sala em {yearAnalytics.aboveClassCount} de{' '}
              {yearAnalytics.comparedWithClassCount || yearAnalytics.subjectCount} matérias
            </div>
          </div>

          {/* Comparative Delta vs Class */}
          <div
            style={{
              padding: '15px 16px',
              borderRadius: isMaterialYou ? 24 : 10,
              backgroundColor: deltaPositive
                ? tokens.gradeSuccessContainer
                : tokens.gradeWarningContainer,
              color: deltaPositive
                ? tokens.onGradeSuccessContainer
                : tokens.onGradeWarningContainer,
              border: isMaterialYou ? 'none' : `1px solid ${tokens.outlineVariant}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              <span>Diferença vs Sala</span>
              {deltaPositive ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
            </div>
            <div
              style={{
                fontSize: isMaterialYou ? '2.1rem' : '1.85rem',
                fontWeight: 800,
                lineHeight: 1.15,
                marginTop: 4,
              }}
            >
              <AnimatedNumber value={yearAnalytics.delta} decimals={2} showPlusSign />
            </div>
            <div style={{ fontSize: '0.75rem', marginTop: 4 }}>
              {deltaPositive ? 'Acima da média da turma' : 'Abaixo da média da turma'}
            </div>
          </div>

          {/* Total Absences & Recovery Status */}
          <div
            style={{
              padding: '15px 16px',
              borderRadius: isMaterialYou ? 24 : 10,
              backgroundColor: isMaterialYou ? tokens.surfaceContainerHigh : tokens.surfaceContainer,
              color: tokens.onSurface,
              border: `1px solid ${tokens.outlineVariant}`,
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: tokens.onSurfaceVariant, textTransform: 'uppercase' }}>
              Faltas & Recuperações
            </div>
            <div
              style={{
                fontSize: isMaterialYou ? '2.1rem' : '1.85rem',
                fontWeight: 800,
                lineHeight: 1.15,
                marginTop: 4,
              }}
            >
              <AnimatedNumber value={yearAnalytics.totalAbsences} decimals={0} suffix=" F." />
            </div>
            <div style={{ fontSize: '0.75rem', marginTop: 4, color: tokens.onSurfaceVariant }}>
              {yearAnalytics.recoveryCount > 0
                ? `${yearAnalytics.recoveryCount} matéria(s) c/ rec.`
                : 'Nenhuma recuperação registrada'}
            </div>
          </div>
        </div>

        {/* High-Value Inferred Academic Metadata Strip (Best vs Class, Study Priority, Absence Concentration) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 10,
            marginTop: 10,
            position: 'relative',
            zIndex: 1,
          }}
        >
          {yearAnalytics.bestVsClass && (
            <div
              onClick={() => setSelectedSubjectName(yearAnalytics.bestVsClass!.subject.subjectName)}
              style={{
                padding: '11px 14px',
                borderRadius: isMaterialYou ? 20 : 8,
                backgroundColor: tokens.surfaceContainer,
                border: `1px solid ${tokens.outlineVariant}`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: tokens.gradeSuccess, textTransform: 'uppercase' }}>
                  Maior Destaque vs Sala
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {yearAnalytics.bestVsClass.subject.subjectName}
                </div>
                <div style={{ fontSize: '0.73rem', color: tokens.onSurfaceVariant }}>
                  Sua média: {(yearAnalytics.bestVsClass.personalAvg ?? 0).toFixed(1)} vs Sala:{' '}
                  {(yearAnalytics.bestVsClass.classAvg ?? 0).toFixed(1)}
                </div>
              </div>
              <span
                style={{
                  padding: '3px 9px',
                  borderRadius: isMaterialYou ? 999 : 6,
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  backgroundColor: tokens.gradeSuccessContainer,
                  color: tokens.onGradeSuccessContainer,
                  flexShrink: 0,
                }}
              >
                <AnimatedNumber
                  value={yearAnalytics.bestVsClass.deltaVsClass ?? 0}
                  decimals={1}
                  showPlusSign
                />
              </span>
            </div>
          )}

          {yearAnalytics.priorityStudy && (
            <div
              onClick={() => setSelectedSubjectName(yearAnalytics.priorityStudy!.subject.subjectName)}
              style={{
                padding: '11px 14px',
                borderRadius: isMaterialYou ? 20 : 8,
                backgroundColor: tokens.surfaceContainer,
                border: `1px solid ${tokens.outlineVariant}`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: tokens.gradeWarning, textTransform: 'uppercase' }}>
                  Prioridade de Estudo (Meta 24 pts)
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {yearAnalytics.priorityStudy.subject.subjectName}
                </div>
                <div style={{ fontSize: '0.73rem', color: tokens.onSurfaceVariant }}>
                  {yearAnalytics.priorityStudy.goalBadgeText}
                </div>
              </div>
              <span
                style={{
                  padding: '3px 9px',
                  borderRadius: isMaterialYou ? 999 : 6,
                  fontSize: '0.73rem',
                  fontWeight: 800,
                  backgroundColor:
                    yearAnalytics.priorityStudy.goalStatus === 'needs_recovery'
                      ? tokens.errorContainer
                      : tokens.gradeWarningContainer,
                  color:
                    yearAnalytics.priorityStudy.goalStatus === 'needs_recovery'
                      ? tokens.onErrorContainer
                      : tokens.onGradeWarningContainer,
                  flexShrink: 0,
                }}
              >
                {yearAnalytics.priorityStudy.accumulatedPoints.toFixed(1)}/24
              </span>
            </div>
          )}

          <div
            onClick={() =>
              yearAnalytics.topAbsenceSubject &&
              setSelectedSubjectName(yearAnalytics.topAbsenceSubject.subject.subjectName)
            }
            style={{
              padding: '11px 14px',
              borderRadius: isMaterialYou ? 20 : 8,
              backgroundColor: tokens.surfaceContainer,
              border: `1px solid ${tokens.outlineVariant}`,
              cursor: yearAnalytics.topAbsenceSubject ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <div style={{ width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: tokens.primary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Distribuição de Faltas
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    backgroundColor: tokens.surfaceContainerHighest,
                    color: tokens.onSurface,
                  }}
                >
                  {yearAnalytics.bimesterAbsences.reduce((acc, v) => acc + v, 0)}F no ano
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                {(() => {
                  const maxBimF = Math.max(1, ...yearAnalytics.bimesterAbsences);
                  return yearAnalytics.bimesterAbsences.map((f, i) => {
                    const pct = Math.round((f / maxBimF) * 100);
                    return (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          padding: '6px 8px',
                          borderRadius: isMaterialYou ? 12 : 6,
                          backgroundColor: tokens.surfaceContainerHigh,
                          border: `1px solid ${tokens.outlineVariant}`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.72rem' }}>
                          <span style={{ color: tokens.onSurfaceVariant, fontWeight: 600 }}>{i + 1}ºB</span>
                          <span style={{ fontWeight: 800, color: f > 0 ? tokens.onSurface : tokens.onSurfaceVariant }}>
                            {f}F
                          </span>
                        </div>
                        <div
                          style={{
                            height: 5,
                            borderRadius: 999,
                            backgroundColor: tokens.surfaceContainerHighest,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${f === 0 ? 0 : Math.max(14, pct)}%`,
                              height: '100%',
                              borderRadius: 999,
                              backgroundColor: f === 0 ? 'transparent' : tokens.primary,
                              transition: 'width 300ms ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              <div style={{ fontSize: '0.73rem', color: tokens.onSurfaceVariant }}>
                {yearAnalytics.topAbsenceSubject ? (
                  <>
                    Maior foco:{' '}
                    <strong style={{ color: tokens.onSurface }}>
                      {yearAnalytics.topAbsenceSubject.subject.subjectName}
                    </strong>{' '}
                    ({yearAnalytics.topAbsenceSubject.totalAbsences}F •{' '}
                    {yearAnalytics.topAbsenceSubject.absenceSharePercent.toFixed(0)}%)
                  </>
                ) : (
                  '100% de presença em todas as matérias'
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. LAYOUT SWITCHER + BIMESTER PILLS + SEARCH & FILTERS */}
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: isMaterialYou ? '16px 18px' : '14px 16px',
          borderRadius: isMaterialYou ? 28 : 12,
          backgroundColor: `${tokens.surfaceContainerLow}CC`,
          backdropFilter: 'blur(16px) saturate(150%)',
          WebkitBackdropFilter: 'blur(16px) saturate(150%)',
          border: `1px solid ${tokens.outlineVariant}`,
        }}
      >
        {/* Top Row: User-Selectable Layout Switcher */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 800,
              color: tokens.primary,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Modo de Exibição do Boletim
          </span>

          <EnhancedConnectedButtonGroup<BoletimLayoutMode>
            value={layoutMode}
            onChange={setLayoutMode}
            options={[
              {
                value: 'cards',
                label: 'Cards',
                icon: <Rows3 size={15} />,
              },
              {
                value: 'table',
                label: 'Tabela',
                icon: <Table2 size={15} />,
              },
              {
                value: 'grid',
                label: 'Grade Compacta',
                icon: <LayoutGrid size={15} />,
              },
              {
                value: 'comparative',
                label: 'Raio-X (Você vs Sala)',
                icon: <BarChart3 size={15} />,
              },
            ]}
          />
        </div>

        {/* Bimester / Filter Mode Connected Pills */}
        <EnhancedConnectedButtonGroup<BimesterViewMode>
          value={viewMode}
          onChange={(mode) => {
            setViewMode(mode);
            if (mode === 'compare') {
              setLayoutMode('comparative');
            }
          }}
          options={[
            { value: 'overview', label: 'Visão Geral (4 Bim.)' },
            { value: '1', label: '1º Bimestre' },
            { value: '2', label: '2º Bimestre' },
            { value: '3', label: '3º Bimestre' },
            { value: '4', label: '4º Bimestre' },
            { value: 'compare', label: 'Ranking vs Sala' },
            {
              value: 'recovery',
              label: 'Recuperações',
              badge: yearAnalytics.recoveryOrBelowSixCount,
            },
          ]}
        />

        {/* Search Input + Quick Filters + Advanced Filter Toggle */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              flex: '1 1 240px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              height: isMaterialYou ? 42 : 36,
              padding: '0 14px',
              borderRadius: isMaterialYou ? 999 : 8,
              backgroundColor: isMaterialYou ? tokens.surfaceContainerHigh : tokens.surfaceContainer,
              border: `1px solid ${tokens.outlineVariant}`,
            }}
          >
            <Search size={16} color={isMaterialYou ? tokens.primary : tokens.onSurfaceVariant} />
            <input
              type="text"
              placeholder="Buscar disciplina (sem acento: fisica, matematica, redes...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: tokens.onSurface,
                fontSize: '0.85rem',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: tokens.onSurfaceVariant,
                  cursor: 'pointer',
                  display: 'flex',
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <EnhancedMorphButton
              size="sm"
              variant={onlyBelowClassAvg ? 'filled' : 'tonal'}
              icon={<Users size={14} />}
              onClick={() => setOnlyBelowClassAvg((v) => !v)}
            >
              Abaixo da M.T.
            </EnhancedMorphButton>

            <EnhancedMorphButton
              size="sm"
              variant={minGradeFilter === 6 ? 'filled' : 'tonal'}
              icon={<CheckCircle2 size={14} />}
              onClick={() => setMinGradeFilter((prev) => (prev === 6 ? 0 : 6))}
            >
              M.B. &gt;= 6,0
            </EnhancedMorphButton>

            <EnhancedMorphButton
              size="sm"
              variant={showAdvancedFilterMenu || activeAdvancedFilterCount > 0 ? 'filled' : 'tonal'}
              icon={<SlidersHorizontal size={14} />}
              onClick={() => setShowAdvancedFilterMenu((prev) => !prev)}
            >
              Filtragem Avançada
              {activeAdvancedFilterCount > 0 ? ` (${activeAdvancedFilterCount})` : ''}
            </EnhancedMorphButton>

            {(activeAdvancedFilterCount > 0 || searchQuery || viewMode !== 'overview') && (
              <EnhancedMorphButton
                size="sm"
                variant="outlined"
                icon={<RotateCcw size={14} />}
                onClick={resetAllFilters}
              >
                Limpar
              </EnhancedMorphButton>
            )}
          </div>
        </div>

        {/* Deep Multi-Criteria Advanced Filter Drawer */}
        <Expandable open={showAdvancedFilterMenu}>
          <div
            style={{
              marginTop: 4,
              padding: '16px 18px',
              borderRadius: 24,
              backgroundColor: tokens.surfaceContainer,
              border: `1px solid ${tokens.outlineVariant}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SlidersHorizontal size={16} color={tokens.primary} />
                <span
                  style={{
                    fontFamily: 'Outfit, sans-serif',
                    fontWeight: 800,
                    fontSize: '0.92rem',
                  }}
                >
                  Menu de Filtragem Profunda & Ordenação
                </span>
                <span
                  style={{
                    padding: '2px 9px',
                    borderRadius: 999,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    backgroundColor: tokens.primaryContainer,
                    color: tokens.onPrimaryContainer,
                  }}
                >
                  Exibindo {filteredAnalyses.length} de {yearAnalytics.subjectCount} disciplinas
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    const anyOpen = ['area', 'bimesters', 'goal', 'class', 'rec', 'trend'].some(
                      (k) => !collapsedFilterGroups[k]
                    );
                    const next: Record<string, boolean> = {};
                    ['area', 'bimesters', 'goal', 'class', 'rec', 'trend'].forEach((k) => {
                      next[k] = anyOpen;
                    });
                    setCollapsedFilterGroups(next);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 12px',
                    borderRadius: 999,
                    border: `1px solid ${tokens.outlineVariant}`,
                    backgroundColor: tokens.surfaceContainerHigh,
                    color: tokens.onSurface,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'Outfit, sans-serif',
                  }}
                >
                  <span>Recolher / Expandir</span>
                </button>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 12px',
                    borderRadius: 999,
                    border: `1px solid ${tokens.outlineVariant}`,
                    backgroundColor: tokens.surfaceContainerHigh,
                    color: tokens.onSurface,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'Outfit, sans-serif',
                  }}
                >
                  <RotateCcw size={13} />
                  <span>Resetar todos</span>
                </button>
              </div>
            </div>

            {/* Multi-select Area & Posted Bimesters Collapsible Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                gap: 12,
              }}
            >
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: isMaterialYou ? 18 : 10,
                  backgroundColor: tokens.surfaceContainerLow,
                  border: `1px solid ${tokens.outlineVariant}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleFilterGroup('area')}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    marginBottom: collapsedFilterGroups['area'] ? 0 : 8,
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    color: tokens.onSurfaceVariant,
                    textTransform: 'uppercase',
                  }}
                >
                  <span>Área de Conhecimento (Múltipla Escolha)</span>
                  <span>{collapsedFilterGroups['area'] ? '▸' : '▾'}</span>
                </button>
                {!collapsedFilterGroups['area'] && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(
                      [
                        { key: 'exatas', label: 'Exatas & Natureza' },
                        { key: 'humanas', label: 'Humanas' },
                        { key: 'linguagens', label: 'Linguagens & Artes' },
                        { key: 'tecnicas', label: 'Técnicas / CTI' },
                      ] as const
                    ).map((opt) => {
                      const active = advFilters.subjectAreas.includes(opt.key);
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => toggleSubjectArea(opt.key)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 999,
                            border: `1px solid ${active ? tokens.primary : tokens.outlineVariant}`,
                            backgroundColor: active ? tokens.primary : tokens.surfaceContainerHigh,
                            color: active ? tokens.onPrimary : tokens.onSurface,
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: isMaterialYou ? 18 : 10,
                  backgroundColor: tokens.surfaceContainerLow,
                  border: `1px solid ${tokens.outlineVariant}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleFilterGroup('bimesters')}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    marginBottom: collapsedFilterGroups['bimesters'] ? 0 : 8,
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    color: tokens.onSurfaceVariant,
                    textTransform: 'uppercase',
                  }}
                >
                  <span>Bimestres com Nota Lançada (Múltipla Escolha)</span>
                  <span>{collapsedFilterGroups['bimesters'] ? '▸' : '▾'}</span>
                </button>
                {!collapsedFilterGroups['bimesters'] && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[1, 2, 3, 4].map((bi) => {
                      const active = advFilters.postedBimesters.includes(bi);
                      return (
                        <button
                          key={bi}
                          type="button"
                          onClick={() => togglePostedBimester(bi)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 999,
                            border: `1px solid ${active ? tokens.primary : tokens.outlineVariant}`,
                            backgroundColor: active ? tokens.primary : tokens.surfaceContainerHigh,
                            color: active ? tokens.onPrimary : tokens.onSurface,
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {bi}º Bimestre
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                gap: 12,
              }}
            >
              {/* 1. Situação Acadêmica / Meta 24 pts */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: isMaterialYou ? 18 : 10,
                  backgroundColor: tokens.surfaceContainerLow,
                  border: `1px solid ${tokens.outlineVariant}`,
                }}
              >
                <div
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    color: tokens.onSurfaceVariant,
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  1. Situação Acadêmica (Meta 24,0 pts)
                </div>
                <EnhancedConnectedButtonGroup<GoalCategoryFilter>
                  wrap={true}
                  value={advFilters.goalCategory}
                  onChange={(goalCategory) =>
                    setAdvFilters((prev) => ({ ...prev, goalCategory }))
                  }
                  options={[
                    { value: 'all', label: 'Todas' },
                    { value: 'passed_24', label: 'Já Aprovadas (24+)' },
                    { value: 'comfortable', label: 'Confortáveis (<=6/bim)' },
                    { value: 'attention', label: 'Atenção (>6/bim)' },
                    { value: 'critical', label: 'Críticas / Exame' },
                  ]}
                />
              </div>

              {/* 2. Desempenho vs Média da Sala (M.T.) */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: isMaterialYou ? 18 : 10,
                  backgroundColor: tokens.surfaceContainerLow,
                  border: `1px solid ${tokens.outlineVariant}`,
                }}
              >
                <div
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    color: tokens.onSurfaceVariant,
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  2. Comparação vs Média da Sala (M.T.)
                </div>
                <EnhancedConnectedButtonGroup<ClassComparisonFilter>
                  wrap={true}
                  value={advFilters.classComparison}
                  onChange={(classComparison) =>
                    setAdvFilters((prev) => ({ ...prev, classComparison }))
                  }
                  options={[
                    { value: 'all', label: 'Todas' },
                    { value: 'above_class', label: 'Acima da Sala' },
                    { value: 'below_class', label: 'Abaixo da Sala' },
                    { value: 'standout_plus_1', label: 'Destaque (+1,0 pt)' },
                    { value: 'deficit_minus_1', label: 'Defasagem (-1,0 pt)' },
                  ]}
                />
              </div>

              {/* 3. Status de Recuperação Específico */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: isMaterialYou ? 18 : 10,
                  backgroundColor: tokens.surfaceContainerLow,
                  border: `1px solid ${tokens.outlineVariant}`,
                }}
              >
                <div
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    color: tokens.onSurfaceVariant,
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  3. Status de Recuperação Específico
                </div>
                <EnhancedConnectedButtonGroup<RecoveryCategoryFilter>
                  wrap={true}
                  value={advFilters.recoveryCategory}
                  onChange={(recoveryCategory) =>
                    setAdvFilters((prev) => ({ ...prev, recoveryCategory }))
                  }
                  options={[
                    { value: 'all', label: 'Qualquer' },
                    { value: 'any_rec_or_low', label: 'Com Rec. ou < 6,0' },
                    { value: 'sat_only', label: 'Rec. Satisfatória (SAT)' },
                    { value: 'ins_nc_only', label: 'Insatisfatória (INS/NC)' },
                    { value: 'clean_only', label: 'Sem Recuperação' },
                  ]}
                />
              </div>

              {/* 4. Tendência de Evolução (Último Bimestre Lançado vs Anterior) */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: isMaterialYou ? 18 : 10,
                  backgroundColor: tokens.surfaceContainerLow,
                  border: `1px solid ${tokens.outlineVariant}`,
                }}
              >
                <div
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    color: tokens.onSurfaceVariant,
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  4. Tendência (Último Bimestre vs Anterior)
                </div>
                <EnhancedConnectedButtonGroup<TrendCategoryFilter>
                  wrap={true}
                  value={advFilters.trendCategory}
                  onChange={(trendCategory) =>
                    setAdvFilters((prev) => ({ ...prev, trendCategory }))
                  }
                  options={[
                    { value: 'all', label: 'Todas' },
                    { value: 'rising', label: 'Em Alta (+)' },
                    { value: 'falling', label: 'Em Queda (-)' },
                    { value: 'stable', label: 'Estável' },
                  ]}
                />
              </div>

              {/* 5. Faixa de Nota Pessoal (M.B.) & Faixa de Faltas */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: isMaterialYou ? 18 : 10,
                  backgroundColor: tokens.surfaceContainerLow,
                  border: `1px solid ${tokens.outlineVariant}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      color: tokens.onSurfaceVariant,
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    }}
                  >
                    5. Faixa de Nota Pessoal (M.B.)
                  </div>
                  <EnhancedConnectedButtonGroup<GradeRangePreset>
                    wrap={true}
                    value={advFilters.gradeRange}
                    onChange={(gradeRange) =>
                      setAdvFilters((prev) => ({ ...prev, gradeRange }))
                    }
                    options={[
                      { value: 'all', label: 'Qualquer Nota' },
                      { value: 'gte_8', label: 'Excelente (>= 8,0)' },
                      { value: 'gte_6', label: 'Na Média (>= 6,0)' },
                      { value: 'lt_6', label: 'Abaixo (< 6,0)' },
                    ]}
                  />
                </div>

                <div>
                  <div
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      color: tokens.onSurfaceVariant,
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    }}
                  >
                    6. Filtro de Faltas
                  </div>
                  <EnhancedConnectedButtonGroup<AbsenceRangePreset>
                    wrap={true}
                    value={advFilters.absenceRange}
                    onChange={(absenceRange) =>
                      setAdvFilters((prev) => ({ ...prev, absenceRange }))
                    }
                    options={[
                      { value: 'all', label: 'Todas' },
                      { value: 'zero', label: 'Zero Faltas (0F)' },
                      { value: 'has_absences', label: 'Com Faltas (> 0)' },
                      { value: 'high_absences', label: '6+ Faltas' },
                    ]}
                  />
                </div>
              </div>

              {/* 6. Ordenação Personalizada */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: isMaterialYou ? 18 : 10,
                  backgroundColor: tokens.surfaceContainerLow,
                  border: `1px solid ${tokens.outlineVariant}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    color: tokens.onSurfaceVariant,
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  <ArrowUpDown size={13} />
                  <span>7. Ordenar Disciplinas Por</span>
                </div>
                <EnhancedConnectedButtonGroup<SubjectSortMode>
                  wrap={true}
                  value={advFilters.sortBy}
                  onChange={(sortBy) => setAdvFilters((prev) => ({ ...prev, sortBy }))}
                  options={[
                    { value: 'alpha_asc', label: 'A-Z' },
                    { value: 'grade_desc', label: 'Maior Média' },
                    { value: 'grade_asc', label: 'Menor Média' },
                    { value: 'delta_desc', label: 'Maior Vantagem vs Sala' },
                    { value: 'delta_asc', label: 'Menor vs Sala' },
                    { value: 'priority_desc', label: 'Prioridade (Meta 24)' },
                    { value: 'absences_desc', label: 'Mais Faltas' },
                  ]}
                />
              </div>
            </div>
          </div>
        </Expandable>
      </section>

      {/* 3. RENDER SELECTED GRADE LAYOUT */}
      {filteredAnalyses.length === 0 ? (
        <div
          style={{
            padding: 36,
            textAlign: 'center',
            borderRadius: 28,
            backgroundColor: tokens.surfaceContainerLow,
            border: `1px solid ${tokens.outlineVariant}`,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>
            Nenhuma disciplina corresponde aos filtros ativos
          </div>
          <div style={{ fontSize: '0.84rem', color: tokens.onSurfaceVariant, marginTop: 4 }}>
            Limpe a busca ou alterne o filtro de bimestre/recuperação acima.
          </div>
        </div>
      ) : layoutMode === 'table' ? (
        <OfficialNsacTableView
          analyses={filteredAnalyses}
          activeYear={activeYear}
          bimesterAbsences={yearAnalytics.bimesterAbsences}
          yearPersonalAvg={yearAnalytics.personalAvg}
          yearClassAvg={yearAnalytics.classAvg}
          yearTotalAbsences={yearAnalytics.totalAbsences}
          mathPassedCount={yearAnalytics.mathPassedCount}
          subjectCount={yearAnalytics.subjectCount}
          selectedSubjectName={selectedSubjectName}
          onSelectSubject={(name) => setSelectedSubjectName(name)}
        />
      ) : layoutMode === 'grid' ? (
        <CompactBentoGridView
          analyses={filteredAnalyses}
          selectedSubjectName={selectedSubjectName}
          onSelectSubject={(name) => setSelectedSubjectName(name)}
        />
      ) : layoutMode === 'comparative' ? (
        <ComparativeXRayView
          analyses={filteredAnalyses}
          selectedSubjectName={selectedSubjectName}
          onSelectSubject={(name) => setSelectedSubjectName(name)}
        />
      ) : (
        <section data-no-size-morph style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filteredAnalyses.map((analysis, idx) => (
            <SubjectSegmentedRow
              key={analysis.subject.subjectName}
              analysis={analysis}
              index={idx}
              total={filteredAnalyses.length}
              viewMode={viewMode}
              selected={selectedSubjectName === analysis.subject.subjectName}
              onSelect={() => setSelectedSubjectName(analysis.subject.subjectName)}
            />
          ))}
        </section>
      )}

      {/* 4. CENTERED VIEWPORT PORTAL FOR SUBJECT DETAILS MODAL */}
      {selectedAnalysis && (
        <SubjectDetailsModal
          analysis={selectedAnalysis}
          classCode={activeYear.title}
          year={activeYear.year}
          originEl={subjectOriginRef.current}
          onClose={() => setSelectedSubjectName(null)}
        />
      )}
    </div>
  );
};

/**
 * LAYOUT 1: TABELA OFICIAL NSAC (Classic NSAC Online Boletim Table in Material 3 Expressive)
 * Columns: Disciplina | 1º Bim (M.B. / M.T. / F / Rec) | 2º Bim | 3º Bim | 4º Bim | Soma / Meta 24 | M.F. | Faltas | Situação
 * Footer: Médias Gerais dos 4 Bimestres (Sua Média M.B. vs Média da Turma M.T. e Faltas)
 */
const CTI_SUBJECT_ABBREVIATIONS: Record<string, string> = {
  'analise e projeto de sistemas': 'APS',
  'aplicativos i': 'APL1',
  'aplicativos ii': 'APL2',
  'artes': 'ARTE',
  'banco de dados i': 'BD1',
  'banco de dados ii': 'BD2',
  'biologia': 'BIO',
  'desenvolvimento web': 'WEB',
  'educacao fisica': 'EDF',
  'eletronica analogica': 'ELA',
  'eletronica digital': 'ELD',
  'empreendedorismo': 'EMP',
  'filosofia': 'FILO',
  'fisica': 'FIS',
  'geografia': 'GEO',
  'gestao de negocios i': 'GN1',
  'gestao de negocios ii': 'GN2',
  'historia': 'HIST',
  'ingles': 'ING',
  'ingles tecnico': 'INGT',
  'lingua portuguesa e literatura': 'PORT',
  'linguagem de programacao i': 'LP1',
  'linguagem de programacao ii': 'LP2',
  'linguagem de programacao iii': 'LP3',
  'linguagem de programacao iv - c#': 'LP4',
  'linguagem de programacao v - php': 'LP5',
  'linguagem de programacao vi - java': 'LP6',
  'matematica': 'MAT',
  'programacao orientada a objetos': 'POO',
  'quimica': 'QUIM',
  'redes de computadores': 'RED',
  'sistemas operacionais': 'SO',
  'sociologia': 'SOC',
};

function getCompactSubjectAbbrev(subjectName: string): string {
  const norm = stripAccents(subjectName.trim());
  const exact = CTI_SUBJECT_ABBREVIATIONS[norm];
  if (exact) return exact;
  // Fallback: first 4 uppercase alphanumeric letters
  const letters = norm.replace(/[^a-z0-9]/g, '').toUpperCase();
  return letters.slice(0, 4) || subjectName.slice(0, 4).toUpperCase();
}

const OfficialNsacTableView: React.FC<{
  analyses: SubjectAcademicAnalysis[];
  activeYear: YearInfo;
  bimesterAbsences: [number, number, number, number];
  yearPersonalAvg: number;
  yearClassAvg: number;
  yearTotalAbsences: number;
  mathPassedCount: number;
  subjectCount: number;
  selectedSubjectName: string | null;
  onSelectSubject: (subjectName: string) => void;
}> = ({
  analyses,
  activeYear,
  bimesterAbsences,
  yearPersonalAvg,
  yearClassAvg,
  yearTotalAbsences,
  mathPassedCount,
  subjectCount,
  selectedSubjectName,
  onSelectSubject,
}) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [useFullNamesMobile, setUseFullNamesMobile] = useState<boolean>(() => {
    try {
      return localStorage.getItem('n2sac_table_full_names') === 'true';
    } catch {
      return false;
    }
  });
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 920 : false
  );

  useEffect(() => {
    const onResize = () => setIsMobileViewport(window.innerWidth < 920);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const toggleFullNamesMobile = () => {
    setUseFullNamesMobile((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('n2sac_table_full_names', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const compactNamesActive = isMobileViewport && !useFullNamesMobile;

  const getCellColors = (grade: number | null, recCode?: string, isRec?: boolean) => {
    if (grade === null) {
      return { bg: tokens.surfaceContainerHighest, fg: tokens.onSurfaceVariant };
    }
    if (recCode === 'INS' || recCode === 'NC' || grade < 6.0) {
      return { bg: tokens.errorContainer, fg: tokens.onErrorContainer };
    }
    if (recCode === 'SAT' || isRec) {
      return { bg: tokens.gradeWarningContainer, fg: tokens.onGradeWarningContainer };
    }
    return { bg: tokens.gradeSuccessContainer, fg: tokens.onGradeSuccessContainer };
  };

  const getGoalBadgeStyle = (status: SubjectAcademicAnalysis['goalStatus']) => {
    switch (status) {
      case 'passed_24':
      case 'completed_pass':
        return { bg: tokens.gradeSuccessContainer, fg: tokens.onGradeSuccessContainer };
      case 'comfortable':
        return { bg: tokens.primaryContainer, fg: tokens.onPrimaryContainer };
      case 'attention':
        return { bg: tokens.gradeWarningContainer, fg: tokens.onGradeWarningContainer };
      case 'pending':
        return { bg: tokens.surfaceContainerHighest, fg: tokens.onSurfaceVariant };
      case 'needs_recovery':
      case 'completed_fail':
      default:
        return { bg: tokens.errorContainer, fg: tokens.onErrorContainer };
    }
  };

  // Compute per-bimester averages strictly from normalized posted bimesters so unposted 0.0 / M.T. 0.0
  // bimesters never drag down or pollute the footer averages
  const bimesterSummaries = [1, 2, 3, 4].map((bNum) => {
    let pS = 0;
    let pC = 0;
    let cS = 0;
    let cC = 0;
    let absSum = 0;
    for (const subj of activeYear.grades) {
      const bi = subj.bimesters.find((x) => x.bimester === bNum);
      if (bi) {
        absSum += bi.personal.absences;
        if (bi.personal.grade !== null && bi.personal.grade !== undefined) {
          pS += bi.personal.grade;
          pC++;
        }
        if (bi.class.averageGrade !== null && bi.class.averageGrade !== undefined) {
          cS += bi.class.averageGrade;
          cC++;
        }
      }
    }
    return {
      bimester: bNum,
      userAvg: pC > 0 ? pS / pC : null,
      classAvg: cC > 0 ? cS / cC : null,
      absences: absSum || bimesterAbsences[bNum - 1] || 0,
    };
  });

  return (
    <section
      style={{
        width: '100%',
        borderRadius: isMaterialYou ? 28 : 12,
        overflow: 'hidden',
        backgroundColor: tokens.surfaceContainerLow,
        border: `1px solid ${tokens.outlineVariant}`,
      }}
    >
      {isMobileViewport && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderBottom: `1px solid ${tokens.outlineVariant}`,
            backgroundColor: tokens.surfaceContainer,
            fontSize: '0.74rem',
          }}
        >
          <span style={{ color: tokens.onSurfaceVariant, fontWeight: 600 }}>
            {useFullNamesMobile ? 'Nomes completos' : 'Nomes abreviados'}
          </span>
          <button
            type="button"
            onClick={toggleFullNamesMobile}
            style={{
              padding: '4px 10px',
              borderRadius: isMaterialYou ? 999 : 6,
              border: `1px solid ${tokens.outlineVariant}`,
              backgroundColor: tokens.surfaceContainerHigh,
              color: tokens.onSurface,
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {useFullNamesMobile ? 'Compactar Nomes' : 'Expandir Nomes'}
          </button>
        </div>
      )}
      <div data-no-size-morph className="nsac-official-table-wrapper" style={{ borderRadius: 0, border: 'none' }}>
        <table
          className={`nsac-official-table ${useFullNamesMobile ? 'nsac-table-full-names' : ''}`}
        >
        <thead>
          <tr
            style={{
              backgroundColor: tokens.surfaceContainerHigh,
              color: tokens.onSurface,
              fontSize: '0.73rem',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            <th
              className="sticky-col"
              style={{
                textAlign: 'left',
                backgroundColor: tokens.surfaceContainerHigh,
                borderBottom: `1px solid ${tokens.outlineVariant}`,
                borderRight: `1px solid ${tokens.outlineVariant}`,
                minWidth: compactNamesActive ? 54 : 165,
              }}
            >
              {compactNamesActive ? 'MAT.' : 'Disciplina'}
            </th>
            {[1, 2, 3, 4].map((bNum) => (
              <th
                key={bNum}
                style={{
                  textAlign: 'center',
                  borderBottom: `1px solid ${tokens.outlineVariant}`,
                  borderRight: `1px solid ${tokens.outlineVariant}`,
                  minWidth: 100,
                }}
              >
                <div>{bNum}º Bim</div>
                <div
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 600,
                    color: tokens.onSurfaceVariant,
                    marginTop: 1,
                  }}
                >
                  M.B. • M.T. • F
                </div>
              </th>
            ))}
            <th
              style={{
                textAlign: 'center',
                borderBottom: `1px solid ${tokens.outlineVariant}`,
                borderRight: `1px solid ${tokens.outlineVariant}`,
                minWidth: 88,
              }}
            >
              <div>Pontos</div>
              <div style={{ fontSize: '0.62rem', fontWeight: 600, color: tokens.onSurfaceVariant }}>
                Soma / 24
              </div>
            </th>
            <th
              style={{
                textAlign: 'center',
                borderBottom: `1px solid ${tokens.outlineVariant}`,
                borderRight: `1px solid ${tokens.outlineVariant}`,
                minWidth: 58,
              }}
            >
              <div>M.F.</div>
              <div style={{ fontSize: '0.62rem', fontWeight: 600, color: tokens.onSurfaceVariant }}>
                Atual
              </div>
            </th>
            <th
              style={{
                textAlign: 'center',
                borderBottom: `1px solid ${tokens.outlineVariant}`,
                borderRight: `1px solid ${tokens.outlineVariant}`,
                minWidth: 54,
              }}
            >
              Faltas
            </th>
            <th
              style={{
                textAlign: 'left',
                borderBottom: `1px solid ${tokens.outlineVariant}`,
                minWidth: 155,
              }}
            >
              Situação & Meta (Média 6,0)
            </th>
          </tr>
        </thead>
        <tbody>
          {analyses.map((item, idx) => {
            const { subject } = item;
            const isSelected = selectedSubjectName === subject.subjectName;
            const rowBg = isSelected
              ? tokens.surfaceContainerHighest
              : idx % 2 === 0
                ? tokens.surfaceContainerLow
                : tokens.surfaceContainer;
            const goalStyle = getGoalBadgeStyle(item.goalStatus);

            return (
              <tr
                key={subject.subjectName}
                onClick={() => onSelectSubject(subject.subjectName)}
                className="nsac-table-row-interactive m3-table-row-stagger"
                style={{
                  backgroundColor: rowBg,
                  animationDelay: `${Math.min(idx * 22, 260)}ms`,
                }}
              >
                {/* Sticky Subject Column */}
                <td
                  className="sticky-col"
                  title={subject.subjectName}
                  style={{
                    backgroundColor: rowBg,
                    borderBottom: `1px solid ${tokens.outlineVariant}`,
                    borderRight: `1px solid ${tokens.outlineVariant}`,
                    fontWeight: 700,
                    fontSize: compactNamesActive ? '0.82rem' : '0.88rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ lineHeight: 1.2 }}>
                      {compactNamesActive
                        ? getCompactSubjectAbbrev(subject.subjectName)
                        : subject.subjectName}
                    </span>
                    {!compactNamesActive && item.trendDelta !== null && (
                      <span
                        title={`Evolução do ${item.previousBimester}ºB para o ${item.latestBimester}ºB`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 2,
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          color:
                            item.trendDelta > 0.05
                              ? tokens.gradeSuccess
                              : item.trendDelta < -0.05
                                ? tokens.error
                                : tokens.onSurfaceVariant,
                          flexShrink: 0,
                        }}
                      >
                        {item.trendDelta > 0.05 ? (
                          <ArrowUpRight size={13} />
                        ) : item.trendDelta < -0.05 ? (
                          <ArrowDownRight size={13} />
                        ) : (
                          <Minus size={12} />
                        )}
                        {item.trendDelta > 0 ? '+' : ''}
                        {item.trendDelta.toFixed(1)}
                      </span>
                    )}
                  </div>
                </td>

                {/* 4 Bimester Columns */}
                {[1, 2, 3, 4].map((bNum) => {
                  const bi = subject.bimesters.find((b) => b.bimester === bNum);
                  const pGrade = bi?.personal.grade ?? null;
                  const cGrade = bi?.class.averageGrade ?? null;
                  const abs = bi?.personal.absences ?? 0;
                  const recCode = bi?.personal.recoveryCode ?? 'NAC';
                  const isRec = bi?.personal.recovery ?? false;
                  const cellColors = getCellColors(pGrade, recCode, isRec);

                  return (
                    <td
                      key={bNum}
                      style={{
                        textAlign: 'center',
                        borderBottom: `1px solid ${tokens.outlineVariant}`,
                        borderRight: `1px solid ${tokens.outlineVariant}`,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 5,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 2,
                              padding: '3px 9px',
                              borderRadius: isMaterialYou ? 10 : 6,
                              backgroundColor: cellColors.bg,
                              color: cellColors.fg,
                              fontWeight: 800,
                              fontSize: '0.9rem',
                              whiteSpace: 'nowrap',
                              lineHeight: 1.2,
                            }}
                          >
                            {pGrade !== null ? (
                              <>
                                <AnimatedNumber value={pGrade} decimals={1} />
                                {isRec ? '*' : ''}
                              </>
                            ) : (
                              '—'
                            )}
                          </span>

                          {recCode !== 'NAC' && (
                            <span
                              title={bi?.personal.recoveryMessage ?? recCode}
                              style={{
                                padding: '2px 5px',
                                borderRadius: isMaterialYou ? 6 : 4,
                                fontSize: '0.62rem',
                                fontWeight: 800,
                                whiteSpace: 'nowrap',
                                backgroundColor:
                                  recCode === 'SAT'
                                    ? tokens.gradeWarningContainer
                                    : tokens.errorContainer,
                                color:
                                  recCode === 'SAT'
                                    ? tokens.onGradeWarningContainer
                                    : tokens.onErrorContainer,
                              }}
                            >
                              {recCode}
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            fontSize: '0.69rem',
                            color: tokens.onSurfaceVariant,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span>M.T. {cGrade !== null ? cGrade.toFixed(1) : '—'}</span>
                          <span>•</span>
                          <span>{abs}F</span>
                        </div>
                      </div>
                    </td>
                  );
                })}

                {/* Accumulated Points / 24.0 */}
                <td
                  style={{
                    textAlign: 'center',
                    borderBottom: `1px solid ${tokens.outlineVariant}`,
                    borderRight: `1px solid ${tokens.outlineVariant}`,
                  }}
                >
                  <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '0.92rem' }}>
                    <AnimatedNumber value={item.accumulatedPoints} decimals={1} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: tokens.onSurfaceVariant }}>
                      {' '}
                      / 24,0
                    </span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: 5,
                      borderRadius: 999,
                      backgroundColor: tokens.surfaceContainerLowest,
                      marginTop: 4,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, (item.accumulatedPoints / 24) * 100).toFixed(0)}%`,
                        height: '100%',
                        borderRadius: 999,
                        backgroundColor:
                          item.accumulatedPoints >= 24 ? tokens.gradeSuccess : tokens.primary,
                      }}
                    />
                  </div>
                </td>

                {/* Final Grade (M.F.) */}
                <td
                  style={{
                    textAlign: 'center',
                    borderBottom: `1px solid ${tokens.outlineVariant}`,
                    borderRight: `1px solid ${tokens.outlineVariant}`,
                    fontFamily: 'Outfit, sans-serif',
                    fontWeight: 800,
                    fontSize: '0.96rem',
                  }}
                >
                  {subject.results.grade !== null ? (
                    <AnimatedNumber value={subject.results.grade} decimals={1} />
                  ) : item.personalAvg !== null ? (
                    <span style={{ color: tokens.onSurfaceVariant }} title="Média parcial">
                      ({item.personalAvg.toFixed(1)})
                    </span>
                  ) : (
                    '—'
                  )}
                </td>

                {/* Total Absences */}
                <td
                  style={{
                    textAlign: 'center',
                    borderBottom: `1px solid ${tokens.outlineVariant}`,
                    borderRight: `1px solid ${tokens.outlineVariant}`,
                    fontWeight: 700,
                    fontSize: '0.86rem',
                  }}
                >
                  <div>{item.totalAbsences}</div>
                  {item.absenceSharePercent >= 18 && item.totalAbsences >= 4 && (
                    <div style={{ fontSize: '0.64rem', color: tokens.gradeWarning, fontWeight: 700 }}>
                      {item.absenceSharePercent.toFixed(0)}% do total
                    </div>
                  )}
                </td>

                {/* Goal / Situation Badge */}
                <td
                  style={{
                    borderBottom: `1px solid ${tokens.outlineVariant}`,
                  }}
                >
                  <div
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: isMaterialYou ? 10 : 6,
                      backgroundColor: goalStyle.bg,
                      color: goalStyle.fg,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      lineHeight: 1.25,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.goalBadgeText}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>

        {/* Official NSAC Footer Row: Médias Gerais dos 4 Bimestres (Sua Média M.B. vs Média da Turma M.T. e Faltas) */}
        <tfoot>
          <tr
            style={{
              backgroundColor: tokens.surfaceContainerHigh,
              fontWeight: 800,
              fontSize: '0.84rem',
            }}
          >
            <td
              className="sticky-col"
              style={{
                backgroundColor: tokens.surfaceContainerHigh,
                borderRight: `1px solid ${tokens.outlineVariant}`,
              }}
            >
              <div style={{ color: tokens.primary }}>MÉDIA</div>
            </td>
            {bimesterSummaries.map((bs) => {
              const diff =
                bs.userAvg !== null && bs.classAvg !== null ? bs.userAvg - bs.classAvg : null;
              return (
                <td
                  key={bs.bimester}
                  style={{
                    textAlign: 'center',
                    borderRight: `1px solid ${tokens.outlineVariant}`,
                  }}
                >
                  <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.92rem' }}>
                    M.B.{' '}
                    {bs.userAvg !== null && bs.userAvg > 0 ? (
                      <AnimatedNumber value={bs.userAvg} decimals={2} />
                    ) : (
                      '—'
                    )}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: tokens.onSurfaceVariant, fontWeight: 600 }}>
                    M.T.{' '}
                    {bs.classAvg !== null && bs.classAvg > 0 ? bs.classAvg.toFixed(2) : '—'} •{' '}
                    {bs.absences}F
                  </div>
                  {diff !== null && (bs.userAvg ?? 0) > 0 && (
                    <div
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        color: diff >= 0 ? tokens.gradeSuccess : tokens.error,
                      }}
                    >
                      {diff >= 0 ? '+' : ''}
                      {diff.toFixed(2)} vs sala
                    </div>
                  )}
                </td>
              );
            })}
            <td
              style={{
                textAlign: 'center',
                borderRight: `1px solid ${tokens.outlineVariant}`,
              }}
            >
              <div style={{ fontSize: '0.72rem', color: tokens.onSurfaceVariant }}>Média Anual</div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.96rem', color: tokens.primary }}>
                <AnimatedNumber value={yearPersonalAvg} decimals={2} />
              </div>
            </td>
            <td
              style={{
                textAlign: 'center',
                borderRight: `1px solid ${tokens.outlineVariant}`,
              }}
            >
              <div style={{ fontSize: '0.72rem', color: tokens.onSurfaceVariant }}>Sala</div>
              <div>{yearClassAvg.toFixed(2)}</div>
            </td>
            <td
              style={{
                textAlign: 'center',
                borderRight: `1px solid ${tokens.outlineVariant}`,
              }}
            >
              <div>{yearTotalAbsences}F</div>
            </td>
            <td style={{ textAlign: 'left' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: tokens.gradeSuccess }}>
                {mathPassedCount}/{subjectCount} aprovadas
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
      </div>
    </section>
  );
};

/**
 * LAYOUT 2: CARDS EXPRESSIVOS (Segmented Tonal Cards with Academic Projections)
 */
const SubjectSegmentedRow: React.FC<{
  analysis: SubjectAcademicAnalysis;
  index: number;
  total: number;
  viewMode: BimesterViewMode;
  selected: boolean;
  onSelect: () => void;
}> = ({ analysis, index, total, viewMode, selected, onSelect }) => {
  const { tokens } = useM3Theme();
  const { subject } = analysis;

  const targetBiNum =
    viewMode === '1' || viewMode === '2' || viewMode === '3' || viewMode === '4'
      ? Number(viewMode)
      : null;

  const focusedBimester: UnifiedBimesterData | null = targetBiNum
    ? (subject.bimesters.find((b) => b.bimester === targetBiNum) ?? null)
    : null;

  const personalAvg =
    focusedBimester !== null ? focusedBimester.personal.grade : analysis.personalAvg;
  const classAvg =
    focusedBimester !== null ? focusedBimester.class.averageGrade : analysis.classAvg;

  const getGradeBadgeColors = (grade: number | null, recCode?: string, isRec?: boolean) => {
    if (grade === null) {
      return { bg: tokens.surfaceContainerHighest, fg: tokens.onSurfaceVariant };
    }
    if (recCode === 'INS' || recCode === 'NC' || grade < 6.0) {
      return { bg: tokens.errorContainer, fg: tokens.onErrorContainer };
    }
    if (recCode === 'SAT' || isRec) {
      return { bg: tokens.gradeWarningContainer, fg: tokens.onGradeWarningContainer };
    }
    return { bg: tokens.gradeSuccessContainer, fg: tokens.onGradeSuccessContainer };
  };

  const mainBadge = getGradeBadgeColors(
    personalAvg,
    focusedBimester?.personal.recoveryCode,
    focusedBimester?.personal.recovery || analysis.hasSatRecovery
  );

  const delta = personalAvg !== null && classAvg !== null ? personalAvg - classAvg : null;

  return (
    <ExpressiveSegmentedCard
      index={index}
      total={total}
      staggerIndex={index}
      selected={selected}
      onClick={onSelect}
      style={{ padding: '16px 18px' }}
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
        {/* Left: IconShapeContainer + Subject Name + Metadata Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '1 1 250px', minWidth: 0 }}>
          <IconShapeContainer
            size={44}
            containerColor={mainBadge.bg}
            contentColor={mainBadge.fg}
            active={selected}
          >
            {renderSubjectIcon(subject.subjectName, 19)}
          </IconShapeContainer>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontFamily: 'Outfit, sans-serif',
                  fontWeight: 700,
                  fontSize: '1.02rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {subject.subjectName}
              </span>

              {/* Goal / Points projection pill */}
              <span
                style={{
                  padding: '2px 9px',
                  borderRadius: 999,
                  fontSize: '0.69rem',
                  fontWeight: 800,
                  backgroundColor:
                    analysis.goalStatus === 'passed_24' || analysis.goalStatus === 'completed_pass'
                      ? tokens.gradeSuccessContainer
                      : analysis.goalStatus === 'comfortable'
                        ? tokens.primaryContainer
                        : analysis.goalStatus === 'attention'
                          ? tokens.gradeWarningContainer
                          : tokens.errorContainer,
                  color:
                    analysis.goalStatus === 'passed_24' || analysis.goalStatus === 'completed_pass'
                      ? tokens.onGradeSuccessContainer
                      : analysis.goalStatus === 'comfortable'
                        ? tokens.onPrimaryContainer
                        : analysis.goalStatus === 'attention'
                          ? tokens.onGradeWarningContainer
                          : tokens.onErrorContainer,
                }}
              >
                {analysis.goalBadgeText}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 8,
                marginTop: 4,
                fontSize: '0.76rem',
                color: tokens.onSurfaceVariant,
              }}
            >
              <span>
                Pontos: <strong>{analysis.accumulatedPoints.toFixed(1)}</strong> / 24,0
              </span>
              <span>•</span>
              <span>Faltas: {subject.results.totalAbsences}</span>
              {delta !== null && (
                <>
                  <span>•</span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: delta >= 0 ? tokens.gradeSuccess : tokens.error,
                    }}
                  >
                    <AnimatedNumber value={delta} decimals={1} showPlusSign suffix=" vs M.T." />
                  </span>
                </>
              )}
              {analysis.trendDelta !== null && (
                <>
                  <span>•</span>
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        analysis.trendDelta >= 0 ? tokens.gradeSuccess : tokens.gradeWarning,
                    }}
                  >
                    {analysis.trendDelta >= 0 ? '+' : ''}
                    {analysis.trendDelta.toFixed(1)} vs {analysis.previousBimester}ºB
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Center/Right: Bimester Pills (full-width balanced grid on mobile, compact on desktop) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: '1 1 260px',
            width: '100%',
            minWidth: 0,
            justifyContent: targetBiNum === null ? 'space-between' : 'flex-end',
          }}
        >
          {targetBiNum === null ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.max(1, subject.bimesters.length)}, minmax(0, 1fr))`,
                gap: 6,
                flex: 1,
                minWidth: 0,
              }}
            >
              {subject.bimesters.map((bi) => {
                const bc = getGradeBadgeColors(
                  bi.personal.grade,
                  bi.personal.recoveryCode,
                  bi.personal.recovery
                );
                return (
                  <div
                    key={bi.bimester}
                    style={{
                      minWidth: 0,
                      padding: '6px 6px',
                      borderRadius: 14,
                      backgroundColor: bc.bg,
                      color: bc.fg,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, opacity: 0.82 }}>
                      {bi.bimester}ºB {bi.personal.recovery ? '*' : ''}
                    </span>
                    <span
                      style={{
                        fontFamily: 'Outfit, sans-serif',
                        fontWeight: 800,
                        fontSize: '0.95rem',
                      }}
                    >
                      {bi.personal.grade !== null ? (
                        <AnimatedNumber value={bi.personal.grade} decimals={1} />
                      ) : (
                        '—'
                      )}
                    </span>
                    <span style={{ fontSize: '0.61rem', opacity: 0.78, whiteSpace: 'nowrap' }}>
                      M.T. {bi.class.averageGrade !== null ? bi.class.averageGrade.toFixed(1) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 14px',
                borderRadius: 18,
                backgroundColor: mainBadge.bg,
                color: mainBadge.fg,
              }}
            >
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  {targetBiNum}º Bimestre (M.B.)
                </div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: 800 }}>
                  {personalAvg !== null ? <AnimatedNumber value={personalAvg} decimals={1} /> : '—'}
                </div>
              </div>
              <div style={{ width: 1, height: 28, backgroundColor: mainBadge.fg, opacity: 0.25 }} />
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, opacity: 0.85 }}>
                  Sala (M.T.)
                </div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', fontWeight: 700 }}>
                  {classAvg !== null ? <AnimatedNumber value={classAvg} decimals={1} /> : '—'}
                </div>
              </div>
            </div>
          )}

          <ChevronRight size={18} color={tokens.onSurfaceVariant} />
        </div>
      </div>

      {/* Comparative M.B. vs M.T. Spring Progress Bars */}
      <div style={{ marginTop: 12 }}>
        <ExpressiveGradeCompareBar
          personalGrade={personalAvg}
          classAverage={classAvg}
          isRecovered={analysis.hasSatRecovery}
        />
      </div>
    </ExpressiveSegmentedCard>
  );
};

/**
 * LAYOUT 3: GRADE COMPACTA (Bento Grid Cards with 4-Bimester Mini Bar Chart & 24-Point Target)
 */
const CompactBentoGridView: React.FC<{
  analyses: SubjectAcademicAnalysis[];
  selectedSubjectName: string | null;
  onSelectSubject: (name: string) => void;
}> = ({ analyses, selectedSubjectName, onSelectSubject }) => {
  const { tokens } = useM3Theme();

  return (
    <section
      data-no-size-morph
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(285px, 1fr))',
        gap: 12,
      }}
    >
      {analyses.map((item, idx) => {
        const { subject } = item;
        const isSelected = selectedSubjectName === subject.subjectName;
        const pAvg = item.personalAvg;
        const isGood = pAvg === null || pAvg >= 6.0;

        return (
          <div
            key={subject.subjectName}
            role="button"
            tabIndex={0}
            onClick={() => onSelectSubject(subject.subjectName)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectSubject(subject.subjectName);
              }
            }}
            className="m3-segmented-card"
            style={{
              animationDelay: `${Math.min(idx * 25, 280)}ms`,
              borderRadius: 26,
              padding: '18px 18px',
              backgroundColor: isSelected
                ? tokens.surfaceContainerHighest
                : tokens.surfaceContainerHigh,
              border: `1px solid ${isSelected ? tokens.primary : tokens.outlineVariant}`,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 14,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div
                  style={{
                    fontFamily: 'Outfit, sans-serif',
                    fontWeight: 800,
                    fontSize: '1.02rem',
                    lineHeight: 1.25,
                  }}
                >
                  {subject.subjectName}
                </div>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: 12,
                    fontFamily: 'Outfit, sans-serif',
                    fontWeight: 800,
                    fontSize: '1.05rem',
                    backgroundColor: isGood
                      ? tokens.gradeSuccessContainer
                      : tokens.errorContainer,
                    color: isGood ? tokens.onGradeSuccessContainer : tokens.onErrorContainer,
                    flexShrink: 0,
                  }}
                >
                  {pAvg !== null ? <AnimatedNumber value={pAvg} decimals={1} /> : '—'}
                </span>
              </div>

              <div
                style={{
                  fontSize: '0.75rem',
                  color: tokens.onSurfaceVariant,
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span>Sala: {item.classAvg !== null ? item.classAvg.toFixed(1) : '—'}</span>
                <span>•</span>
                <span>{item.totalAbsences} falta(s)</span>
                <span>•</span>
                <span>{item.accumulatedPoints.toFixed(1)}/24 pts</span>
              </div>
            </div>

            {/* 4-Bimester Mini Visual Columns */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 6,
                padding: '10px 10px',
                borderRadius: 18,
                backgroundColor: tokens.surfaceContainerLowest,
              }}
            >
              {[1, 2, 3, 4].map((bNum) => {
                const bi = subject.bimesters.find((b) => b.bimester === bNum);
                const g = bi?.personal.grade ?? null;
                const mt = bi?.class.averageGrade ?? null;
                const heightPct = g !== null ? Math.max(15, (g / 10) * 100) : 12;

                return (
                  <div
                    key={bNum}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        height: 40,
                        width: '100%',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: '65%',
                          height: `${heightPct}%`,
                          borderRadius: 6,
                          backgroundColor:
                            g === null
                              ? tokens.surfaceContainerHighest
                              : g >= 6.0
                                ? tokens.gradeSuccess
                                : tokens.error,
                        }}
                      />
                    </div>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '0.82rem' }}>
                      {g !== null ? g.toFixed(1) : '—'}
                    </div>
                    <div style={{ fontSize: '0.64rem', color: tokens.onSurfaceVariant }}>
                      {bNum}ºB {mt !== null ? `(${mt.toFixed(1)})` : ''}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Goal Badge Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                paddingTop: 4,
              }}
            >
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontSize: '0.71rem',
                  fontWeight: 800,
                  backgroundColor:
                    item.goalStatus === 'passed_24' || item.goalStatus === 'completed_pass'
                      ? tokens.gradeSuccessContainer
                      : item.goalStatus === 'comfortable'
                        ? tokens.primaryContainer
                        : item.goalStatus === 'attention'
                          ? tokens.gradeWarningContainer
                          : tokens.errorContainer,
                  color:
                    item.goalStatus === 'passed_24' || item.goalStatus === 'completed_pass'
                      ? tokens.onGradeSuccessContainer
                      : item.goalStatus === 'comfortable'
                        ? tokens.onPrimaryContainer
                        : item.goalStatus === 'attention'
                          ? tokens.onGradeWarningContainer
                          : tokens.onErrorContainer,
                }}
              >
                {item.goalBadgeText}
              </span>
              <ChevronRight size={16} color={tokens.onSurfaceVariant} />
            </div>
          </div>
        );
      })}
    </section>
  );
};

/**
 * LAYOUT 4: RAIO-X COMPARATIVO (Você vs Sala — Sorted by Delta M.B. - M.T. with Diverging Bars)
 */
const ComparativeXRayView: React.FC<{
  analyses: SubjectAcademicAnalysis[];
  selectedSubjectName: string | null;
  onSelectSubject: (name: string) => void;
}> = ({ analyses, selectedSubjectName, onSelectSubject }) => {
  const { tokens } = useM3Theme();

  const sorted = useMemo(() => {
    return [...analyses].sort((a, b) => (b.deltaVsClass ?? -99) - (a.deltaVsClass ?? -99));
  }, [analyses]);

  return (
    <section data-no-size-morph style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sorted.map((item, idx) => {
        const delta = item.deltaVsClass ?? 0;
        const isPositive = delta >= 0;
        // Max delta scale of 4.0 points for half-width diverging bar
        const barMagnitudePct = Math.min(50, (Math.abs(delta) / 4.0) * 50);

        return (
          <ExpressiveSegmentedCard
            key={item.subject.subjectName}
            index={idx}
            total={sorted.length}
            staggerIndex={idx}
            selected={selectedSubjectName === item.subject.subjectName}
            onClick={() => onSelectSubject(item.subject.subjectName)}
            style={{ padding: '14px 18px' }}
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
              <div style={{ flex: '1 1 210px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      color: tokens.onSurfaceVariant,
                      width: 24,
                    }}
                  >
                    #{idx + 1}
                  </span>
                  <span
                    style={{
                      fontFamily: 'Outfit, sans-serif',
                      fontWeight: 800,
                      fontSize: '0.98rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.subject.subjectName}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: tokens.onSurfaceVariant, marginTop: 2, paddingLeft: 32 }}>
                  Sua Média: <strong>{item.personalAvg !== null ? item.personalAvg.toFixed(2) : '—'}</strong> •
                  Média da Sala: <strong>{item.classAvg !== null ? item.classAvg.toFixed(2) : '—'}</strong>
                </div>
              </div>

              {/* Diverging Bar (Center = 0.0 difference vs Class Average) */}
              <div
                style={{
                  flex: '2 1 260px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    flex: 1,
                    height: 14,
                    borderRadius: 999,
                    backgroundColor: tokens.surfaceContainerLowest,
                    overflow: 'hidden',
                  }}
                >
                  {/* Center 0.0 axis line */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: 0,
                      bottom: 0,
                      width: 2,
                      backgroundColor: tokens.outline,
                      zIndex: 2,
                    }}
                  />
                  {item.deltaVsClass !== null && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 2,
                        bottom: 2,
                        left: isPositive ? '50%' : `${50 - barMagnitudePct}%`,
                        width: `${barMagnitudePct}%`,
                        borderRadius: 999,
                        backgroundColor: isPositive ? tokens.gradeSuccess : tokens.error,
                      }}
                    />
                  )}
                </div>

                <span
                  style={{
                    minWidth: 74,
                    textAlign: 'right',
                    padding: '4px 10px',
                    borderRadius: 999,
                    fontFamily: 'Outfit, sans-serif',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    backgroundColor: isPositive
                      ? tokens.gradeSuccessContainer
                      : tokens.errorContainer,
                    color: isPositive
                      ? tokens.onGradeSuccessContainer
                      : tokens.onErrorContainer,
                  }}
                >
                  {item.deltaVsClass !== null ? (
                    <AnimatedNumber value={delta} decimals={2} showPlusSign />
                  ) : (
                    '—'
                  )}
                </span>
              </div>
            </div>
          </ExpressiveSegmentedCard>
        );
      })}
    </section>
  );
};

/**
 * CENTERED PORTAL MODAL FOR DETAILED SUBJECT BREAKDOWN
 * Rendered via `createPortal(..., document.body)` so it is NEVER trapped inside
 * any transformed parent container and always centers cleanly in the viewport.
 */
export interface SubjectNewGradeBanner {
  bimester: number;
  personalGrade: number | null;
  classAverage: number | null;
  previousGrade: number | null;
  eyebrow?: string;
  headline?: string;
  allSubjects?: { subject: string; bimester: number; personal_grade: number | null }[];
  onSelectSubject?: (subject: string, bimester: number) => void;
}

export const SubjectEvolutionMiniChart: React.FC<{
  bimesters: UnifiedBimesterData[];
  highlightBimester?: number | null;
}> = ({ bimesters, highlightBimester = null }) => {
  const { tokens } = useM3Theme();
  const sorted = [...bimesters].sort((a, b) => a.bimester - b.bimester);
  const postedAny = sorted.some((b) => b.personal.grade !== null || b.class.averageGrade !== null);
  if (!postedAny) return null;

  const width = 320;
  const height = 116;
  const padL = 24;
  const padR = 16;
  const padT = 14;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xOf = (idx: number) => padL + (sorted.length > 1 ? (idx / (sorted.length - 1)) * plotW : plotW / 2);
  const yOf = (val: number) => padT + (1 - Math.max(0, Math.min(10, val)) / 10) * plotH;

  const personalPts = sorted
    .map((b, i) => (b.personal.grade !== null ? { x: xOf(i), y: yOf(b.personal.grade), val: b.personal.grade, bi: b.bimester } : null))
    .filter((p): p is { x: number; y: number; val: number; bi: number } => p !== null);
  const classPts = sorted
    .map((b, i) => (b.class.averageGrade !== null ? { x: xOf(i), y: yOf(b.class.averageGrade), val: b.class.averageGrade, bi: b.bimester } : null))
    .filter((p): p is { x: number; y: number; val: number; bi: number } => p !== null);

  const linePath = (pts: { x: number; y: number }[]) =>
    pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  return (
    <div
      style={{
        padding: '12px 14px 10px',
        borderRadius: 18,
        backgroundColor: tokens.surfaceContainerHigh,
        border: `1px solid ${tokens.outlineVariant}`,
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: tokens.onSurface, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          Evolução Bimestral
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.7rem', color: tokens.onSurfaceVariant, fontWeight: 700 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: tokens.primary }} /> Sua nota
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: tokens.outline }} /> Sala (M.T.)
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
        {[0, 6, 10].map((tick) => {
          const y = yOf(tick);
          return (
            <g key={tick}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                stroke={tick === 6 ? tokens.gradeWarning : tokens.outlineVariant}
                strokeWidth={tick === 6 ? 1.1 : 0.7}
                strokeDasharray={tick === 6 ? '4 3' : undefined}
                opacity={tick === 6 ? 0.75 : 0.5}
              />
              <text
                x={padL - 5}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fill={tick === 6 ? tokens.gradeWarning : tokens.onSurfaceVariant}
                fontWeight={tick === 6 ? 800 : 600}
              >
                {tick}
              </text>
            </g>
          );
        })}

        {classPts.length >= 2 && (
          <path d={linePath(classPts)} fill="none" stroke={tokens.outline} strokeWidth={2} strokeDasharray="4 3" strokeLinecap="round" />
        )}
        {personalPts.length >= 2 && (
          <path d={linePath(personalPts)} fill="none" stroke={tokens.primary} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
        )}

        {classPts.map((p) => (
          <circle key={`c-${p.bi}`} cx={p.x} cy={p.y} r={3} fill={tokens.surfaceContainerHigh} stroke={tokens.outline} strokeWidth={1.8} />
        ))}

        {personalPts.map((p) => {
          const isNew = highlightBimester === p.bi;
          return (
            <g key={`p-${p.bi}`}>
              {isNew && <circle cx={p.x} cy={p.y} r={8} fill={tokens.primary} opacity={0.22} />}
              <circle cx={p.x} cy={p.y} r={isNew ? 4.8 : 3.8} fill={tokens.primary} stroke={tokens.surfaceContainerHigh} strokeWidth={1.8} />
              <text
                x={p.x}
                y={p.y - 8}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight={800}
                fill={tokens.onSurface}
              >
                {formatPtBr(p.val, 1)}
              </text>
            </g>
          );
        })}

        {sorted.map((b, i) => (
          <text
            key={`lbl-${b.bimester}`}
            x={xOf(i)}
            y={height - 4}
            textAnchor="middle"
            fontSize="9.5"
            fontWeight={highlightBimester === b.bimester ? 800 : 600}
            fill={highlightBimester === b.bimester ? tokens.primary : tokens.onSurfaceVariant}
          >
            {b.bimester}º Bim
          </text>
        ))}
      </svg>
    </div>
  );
};

export const SubjectDetailsModal: React.FC<{
  analysis: SubjectAcademicAnalysis;
  classCode: string;
  year: number;
  originEl: HTMLElement | null;
  onClose: () => void;
  newGradeBanner?: SubjectNewGradeBanner | null;
}> = ({ analysis, classCode, year, originEl, onClose, newGradeBanner = null }) => {
  const { tokens } = useM3Theme();
  const { subject } = analysis;
  const goalPositive = analysis.goalStatus === 'passed_24' || analysis.goalStatus === 'completed_pass';
  const goalNegative = analysis.goalStatus === 'needs_recovery' || analysis.goalStatus === 'completed_fail';
  const goalColor = goalPositive
    ? tokens.onGradeSuccessContainer
    : goalNegative
      ? tokens.onErrorContainer
      : tokens.onGradeWarningContainer;

  const bannerBimesterData = newGradeBanner
    ? subject.bimesters.find((b) => b.bimester === newGradeBanner.bimester) ?? null
    : null;
  const bannerGrade = newGradeBanner?.personalGrade ?? bannerBimesterData?.personal.grade ?? analysis.latestGrade;
  const bannerClassAvg = newGradeBanner?.classAverage ?? bannerBimesterData?.class.averageGrade ?? analysis.classAvg;
  const bannerPrevGrade = newGradeBanner?.previousGrade ?? analysis.previousGrade;
  const bannerDiffClass =
    bannerGrade !== null && bannerClassAvg !== null ? bannerGrade - bannerClassAvg : null;
  const bannerEvolution =
    bannerGrade !== null && bannerPrevGrade !== null ? bannerGrade - bannerPrevGrade : null;

  return (
    <ExpressiveModal ariaLabel={`Detalhes de ${subject.subjectName}`} onClose={onClose} originEl={originEl}>
      {(close) => (
      <>
        <ModalHeader
          icon={renderSubjectIcon(subject.subjectName, 21)}
          eyebrow={
            newGradeBanner
              ? newGradeBanner.eyebrow || `Nova nota lançada • ${classCode} • ${year}`
              : `${classCode} • Ano Letivo ${year}`
          }
          title={subject.subjectName}
          onClose={() => close()}
        />

        {newGradeBanner && (
          <div
            style={{
              marginTop: 14,
              padding: '14px 16px',
              borderRadius: 20,
              backgroundColor: tokens.primaryContainer,
              color: tokens.onPrimaryContainer,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {newGradeBanner.headline && (
              <div style={{ fontSize: '0.8rem', fontWeight: 700, opacity: 0.92 }}>
                {newGradeBanner.headline}
              </div>
            )}
            {newGradeBanner.allSubjects && newGradeBanner.allSubjects.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {newGradeBanner.allSubjects.map((item) => {
                  const active =
                    stripAccents(item.subject) === stripAccents(subject.subjectName) &&
                    item.bimester === newGradeBanner.bimester;
                  return (
                    <button
                      key={`${item.subject}-${item.bimester}`}
                      type="button"
                      onClick={() => newGradeBanner.onSelectSubject?.(item.subject, item.bimester)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        border: 'none',
                        backgroundColor: active ? tokens.primary : 'rgba(0,0,0,0.14)',
                        color: active ? tokens.onPrimary : tokens.onPrimaryContainer,
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {item.subject}
                      {item.personal_grade !== null ? `: ${formatPtBr(item.personal_grade, 1)}` : ''}
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', opacity: 0.85 }}>
                  {newGradeBanner.bimester}º Bimestre • Nova Nota
                </div>
                <div style={{ marginTop: 2 }}>
                  <GradeRevealScore target={bannerGrade} phase="counting" size="hero" />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                {bannerDiffClass !== null && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 10px',
                      borderRadius: 999,
                      backgroundColor: 'rgba(0,0,0,0.14)',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                    }}
                  >
                    <Users size={12} /> Sala {formatPtBr(bannerClassAvg!, 1)} ({bannerDiffClass >= 0 ? '+' : ''}
                    {formatPtBr(bannerDiffClass, 1)})
                  </span>
                )}
                {bannerEvolution !== null && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 10px',
                      borderRadius: 999,
                      backgroundColor: 'rgba(0,0,0,0.14)',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                    }}
                  >
                    {bannerEvolution >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    Evolução: {formatPtBr(bannerPrevGrade!, 1)} → {formatPtBr(bannerGrade!, 1)} (
                    {bannerEvolution >= 0 ? '+' : ''}
                    {formatPtBr(bannerEvolution, 1)})
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Summary Metrics Grid: Média, Soma de Pontos / 24, Meta p/ Aprovação Direta, Total de Faltas */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 10,
            marginTop: 18,
            marginBottom: 16,
          }}
        >
          <MetricTile
            label="Média Atual / Final"
            value={analysis.personalAvg !== null ? analysis.personalAvg.toFixed(2) : 'Em curso'}
            caption={`Sala (M.T.): ${analysis.classAvg !== null ? analysis.classAvg.toFixed(2) : '—'}`}
            background={tokens.primaryContainer}
            color={tokens.onPrimaryContainer}
          />
          <MetricTile
            label="Pontos Acumulados"
            value={
              <>
                {analysis.accumulatedPoints.toFixed(1)}{' '}
                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>/ 24,0</span>
              </>
            }
            caption={`Máximo anual: ${CTI_MAX_POINTS_TOTAL.toFixed(0)} pts`}
            background={tokens.secondaryContainer}
            color={tokens.onSecondaryContainer}
          />
          <MetricTile
            label={
              <>
                <Target size={13} />
                <span>Projeção (Média 6,0)</span>
              </>
            }
            value={analysis.goalBadgeText}
            caption={analysis.goalDetailText}
            compactValue
            background={
              goalPositive
                ? tokens.gradeSuccessContainer
                : goalNegative
                  ? tokens.errorContainer
                  : tokens.gradeWarningContainer
            }
            color={goalColor}
            captionColor={goalColor}
          />
          <MetricTile
            label="Total de Faltas"
            value={`${subject.results.totalAbsences} aulas`}
            caption={
              analysis.absenceSharePercent > 0
                ? `${analysis.absenceSharePercent.toFixed(1)}% das suas faltas no ano`
                : 'Nenhuma falta registrada'
            }
            background={tokens.surfaceContainerHigh}
            color={tokens.onSurface}
            borderColor={tokens.outlineVariant}
            labelColor={tokens.onSurfaceVariant}
            captionColor={tokens.onSurfaceVariant}
          />
        </div>

        {/* Bimester Evolution Sparkline Chart */}
        <SubjectEvolutionMiniChart
          bimesters={subject.bimesters}
          highlightBimester={newGradeBanner?.bimester ?? null}
        />

        {/* 4 Bimesters Segmented Breakdown */}
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: tokens.primary, marginBottom: 10, textTransform: 'uppercase' }}>
          Desempenho Detalhado nos 4 Bimestres (Sua Nota M.B. vs Média da Sala M.T.)
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {subject.bimesters.map((bi, idx) => {
            const pGrade = bi.personal.grade;
            const cGrade = bi.class.averageGrade;
            const diff = pGrade !== null && cGrade !== null ? pGrade - cGrade : null;
            const recCode = bi.personal.recoveryCode ?? 'NAC';
            const recMsg = bi.personal.recoveryMessage ?? 'Não Aconteceu';
            const isHighlightedNew = newGradeBanner?.bimester === bi.bimester;

            return (
              <ExpressiveSegmentedCard
                key={bi.bimester}
                index={idx}
                total={subject.bimesters.length}
                selected={isHighlightedNew}
                style={{ padding: '16px 18px' }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Calendar size={18} color={tokens.primary} />
                    <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '1.05rem' }}>
                      {bi.bimester}º Bimestre
                    </span>
                    {isHighlightedNew && (
                      <span
                        style={{
                          padding: '2px 9px',
                          borderRadius: 999,
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          backgroundColor: tokens.primary,
                          color: tokens.onPrimary,
                          letterSpacing: '0.03em',
                        }}
                      >
                        NOVA NOTA
                      </span>
                    )}
                    <span
                      style={{
                        padding: '2px 9px',
                        borderRadius: 999,
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        backgroundColor: tokens.surfaceContainerHighest,
                        color: tokens.onSurfaceVariant,
                      }}
                    >
                      {bi.personal.absences} falta(s)
                    </span>
                  </div>

                  {/* Recovery Status Chip */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 11px',
                      borderRadius: 999,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      backgroundColor:
                        recCode === 'SAT'
                          ? tokens.gradeWarningContainer
                          : recCode === 'INS' || recCode === 'NC'
                            ? tokens.errorContainer
                            : tokens.surfaceContainerHighest,
                      color:
                        recCode === 'SAT'
                          ? tokens.onGradeWarningContainer
                          : recCode === 'INS' || recCode === 'NC'
                            ? tokens.onErrorContainer
                            : tokens.onSurfaceVariant,
                    }}
                  >
                    {recCode === 'SAT' ? (
                      <CheckCircle2 size={14} />
                    ) : recCode === 'INS' || recCode === 'NC' ? (
                      <AlertTriangle size={14} />
                    ) : null}
                    <span>
                      Rec: {recCode} ({recMsg})
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 14,
                      backgroundColor: tokens.surfaceContainerLowest,
                    }}
                  >
                    <div style={{ fontSize: '0.7rem', color: tokens.onSurfaceVariant }}>Sua Nota (M.B.)</div>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 800 }}>
                      {pGrade !== null ? pGrade.toFixed(1) : '—'}
                      {bi.personal.recovery ? ' *' : ''}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 14,
                      backgroundColor: tokens.surfaceContainerLowest,
                    }}
                  >
                    <div style={{ fontSize: '0.7rem', color: tokens.onSurfaceVariant }}>Média Sala (M.T.)</div>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 800 }}>
                      {cGrade !== null ? cGrade.toFixed(1) : '—'}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 14,
                      backgroundColor: tokens.surfaceContainerLowest,
                    }}
                  >
                    <div style={{ fontSize: '0.7rem', color: tokens.onSurfaceVariant }}>Diferença vs Sala</div>
                    <div
                      style={{
                        fontFamily: 'Outfit, sans-serif',
                        fontSize: '1.25rem',
                        fontWeight: 800,
                        color:
                          diff === null
                            ? tokens.onSurfaceVariant
                            : diff >= 0
                              ? tokens.gradeSuccess
                              : tokens.error,
                      }}
                    >
                      {diff !== null ? `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}` : '—'}
                    </div>
                  </div>
                </div>

                <ExpressiveGradeCompareBar
                  personalGrade={pGrade}
                  classAverage={cGrade}
                  isRecovered={bi.personal.recovery}
                />
              </ExpressiveSegmentedCard>
            );
          })}
        </div>
      </>
      )}
    </ExpressiveModal>
  );
};
