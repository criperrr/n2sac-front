import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  ChevronRight,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { AllYearsResponse, FullGrades, YearInfo } from '../api/types';
import type { AppPushEventDetail, GradePushHighlight } from '../notifications/pushService';
import {
  analyzeSubject,
  normalizeYearInfo,
  SubjectDetailsModal,
  SubjectEvolutionMiniChart,
  type SubjectAcademicAnalysis,
} from '../screens/BoletimScreen';
import { ExpressiveModal, MetricTile, ModalHeader } from './expressive/ExpressiveModal';
import {
  AnimatedNumber,
  EnhancedMorphButton,
  ExpressiveGradeCompareBar,
  ExpressiveSegmentedCard,
} from './expressive/ExpressivePrimitives';
import { MorphingShapeIndicator } from './expressive/ShapeMorph';
import { GradeRevealScore, isPerfectTen } from './GradeRevealScore';
import { useM3Theme } from '../theme/ThemeContext';
import { renderSubjectIcon, stripAccents } from '../utils/subjectIcons';

function matchSubjectInYear(year: YearInfo, targetName: string): FullGrades | null {
  const normTarget = stripAccents(targetName);
  if (!normTarget) return null;
  return (
    year.grades.find((g) => stripAccents(g.subjectName) === normTarget) ??
    year.grades.find(
      (g) => stripAccents(g.subjectName).includes(normTarget) || normTarget.includes(stripAccents(g.subjectName))
    ) ??
    null
  );
}

function formatGrade(v: number, decimals = 1): string {
  return v.toFixed(decimals).replace('.', ',');
}

function formatSigned(v: number, decimals = 1): string {
  return `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(decimals).replace('.', ',')}`;
}

interface ResolvedGradeItem {
  key: string;
  highlight: GradePushHighlight;
  year: YearInfo | null;
  analysis: SubjectAcademicAnalysis | null;
  newGrade: number | null;
  classAvgBim: number | null;
  prevGrade: number | null;
  subjectAvg: number | null;
  subjectClassAvg: number | null;
  diffVsClassBim: number | null;
  evolutionDelta: number | null;
}

/**
 * Opened when the user taps a `grade_update` notification (single or accumulated multiple grades).
 *
 * - 1 new grade: opens `SubjectDetailsModal` directly with the "Nova Nota" hero banner & evolution chart.
 * - 2+ new grades (accumulated): opens a Summary-First modal that FIRST lists every new grade and its
 *   subject/class averages at a glance, followed immediately by full per-subject specifications
 *   (projections, absences, comparison bars, SVG evolution charts, and bimester history).
 */
export const GradeNotificationModal: React.FC<{
  detail: AppPushEventDetail;
  boletim: AllYearsResponse | null;
  refreshing: boolean;
  onOpenBoletim: () => void;
  onClose: () => void;
}> = ({ detail, boletim, refreshing, onOpenBoletim, onClose }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [focusedDetailKey, setFocusedDetailKey] = useState<string | null>(null);
  const [specFilterKey, setSpecFilterKey] = useState<string>('all');
  const specCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const highlights = useMemo<GradePushHighlight[]>(() => {
    if (detail.highlights && detail.highlights.length > 0) return detail.highlights;
    if (detail.primarySubject) {
      return [
        {
          subject: detail.primarySubject,
          bimester: detail.primaryBimester ?? 1,
          year: detail.primaryYear ?? new Date().getFullYear(),
          personal_grade: detail.primaryGrade ?? null,
          class_average: detail.primaryClassAvg ?? null,
          previous_grade: null,
          recovery: false,
        },
      ];
    }
    if (detail.subjects && detail.subjects.length > 0) {
      const bi = detail.bimesters?.[0] ?? detail.primaryBimester ?? 1;
      const yr = detail.primaryYear ?? new Date().getFullYear();
      return detail.subjects.map((subject) => ({
        subject,
        bimester: bi,
        year: yr,
        personal_grade: null,
        class_average: null,
        previous_grade: null,
        recovery: false,
      }));
    }
    return [];
  }, [detail]);

  const normalizedYears = useMemo<YearInfo[]>(() => {
    if (!boletim?.data?.length) return [];
    return [...boletim.data].map(normalizeYearInfo).sort((a, b) => b.year - a.year);
  }, [boletim]);

  const resolvedItems = useMemo<ResolvedGradeItem[]>(() => {
    const items = highlights.map((h, idx) => {
      let chosenYear: YearInfo | undefined = normalizedYears.find((y) => y.year === h.year);
      let matchedSubject: FullGrades | null = null;

      if (chosenYear) {
        matchedSubject = matchSubjectInYear(chosenYear, h.subject);
      }
      if (!matchedSubject) {
        for (const yr of normalizedYears) {
          const found = matchSubjectInYear(yr, h.subject);
          if (found) {
            chosenYear = yr;
            matchedSubject = found;
            break;
          }
        }
      }
      if (!chosenYear) chosenYear = normalizedYears[0];

      let analysis: SubjectAcademicAnalysis | null = null;
      if (chosenYear && matchedSubject) {
        const yearTotalAbsences = chosenYear.grades.reduce((acc, g) => acc + g.results.totalAbsences, 0);
        analysis = analyzeSubject(matchedSubject, yearTotalAbsences, chosenYear.status);
      }

      const bimData = analysis?.subject.bimesters.find((b) => b.bimester === h.bimester) ?? null;
      const prevBimData =
        analysis?.subject.bimesters
          .filter((b) => b.bimester < h.bimester && b.personal.grade !== null)
          .sort((a, b) => b.bimester - a.bimester)[0] ?? null;

      const newGrade = h.personal_grade ?? bimData?.personal.grade ?? analysis?.latestGrade ?? null;
      const classAvgBim = h.class_average ?? bimData?.class.averageGrade ?? analysis?.classAvg ?? null;
      const prevGrade = h.previous_grade ?? prevBimData?.personal.grade ?? null;
      const subjectAvg = analysis?.personalAvg ?? newGrade;
      const subjectClassAvg = analysis?.classAvg ?? classAvgBim;

      return {
        key: `${stripAccents(h.subject)}-${h.bimester}-${h.year}-${idx}`,
        highlight: h,
        year: chosenYear ?? null,
        analysis,
        newGrade,
        classAvgBim,
        prevGrade,
        subjectAvg,
        subjectClassAvg,
        diffVsClassBim: newGrade !== null && classAvgBim !== null ? newGrade - classAvgBim : null,
        evolutionDelta: newGrade !== null && prevGrade !== null ? newGrade - prevGrade : null,
      };
    });

    // Stack from lowest grade first -> highest grades (and 10,0 grand finales) last
    // so the sequential reveal builds suspense naturally!
    return items.sort((a, b) => {
      const ga = a.newGrade ?? -1;
      const gb = b.newGrade ?? -1;
      if (ga !== gb) return ga - gb;
      return a.highlight.subject.localeCompare(b.highlight.subject, 'pt-BR');
    });
  }, [highlights, normalizedYears]);

  const summaryRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Sequential reveal index: starts at -1 for 320ms while the modal opens so the student
  // sees all rows waiting at 0,0 before item 0 -> 1 -> 2 -> 10,0 animate one by one.
  const [revealIdx, setRevealIdx] = useState(-1);
  const revealKey = useMemo(() => resolvedItems.map((i) => i.key).join('|'), [resolvedItems]);
  useEffect(() => {
    setRevealIdx(-1);
    const t = window.setTimeout(() => setRevealIdx(0), 320);
    return () => window.clearTimeout(t);
  }, [revealKey]);

  // Smoothly scroll the currently-animating summary row into view if it sits near/below the fold.
  useEffect(() => {
    if (revealIdx <= 0 || revealIdx >= resolvedItems.length) return;
    const item = resolvedItems[revealIdx];
    if (!item) return;
    const el = summaryRowRefs.current.get(item.key);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [revealIdx, resolvedItems]);

  const advanceReveal = useCallback((idx: number) => {
    setRevealIdx((cur) => (cur === idx ? cur + 1 : cur));
  }, []);

  // Aggregate metrics across all newly posted grades in this accumulated notification.
  const aggregate = useMemo(() => {
    const withNewGrade = resolvedItems.filter((i) => i.newGrade !== null);
    const avgNewGrades =
      withNewGrade.length > 0
        ? withNewGrade.reduce((sum, i) => sum + (i.newGrade ?? 0), 0) / withNewGrade.length
        : null;

    const withClassCompare = resolvedItems.filter((i) => i.diffVsClassBim !== null);
    const aboveClassCount = withClassCompare.filter((i) => (i.diffVsClassBim ?? 0) >= 0).length;
    const avgDiffVsClass =
      withClassCompare.length > 0
        ? withClassCompare.reduce((sum, i) => sum + (i.diffVsClassBim ?? 0), 0) / withClassCompare.length
        : null;

    return {
      totalCount: resolvedItems.length,
      avgNewGrades,
      aboveClassCount,
      comparedCount: withClassCompare.length,
      avgDiffVsClass,
    };
  }, [resolvedItems]);

  const isWhileAway = detail.source === 'while_away';

  // 1. Single-subject notification: open the rich `SubjectDetailsModal` directly.
  if (resolvedItems.length === 1) {
    const single = resolvedItems[0]!;
    if (single.analysis && single.year) {
      const cls = single.year.title || detail.classCode || 'CTI';
      return (
        <SubjectDetailsModal
          analysis={single.analysis}
          classCode={cls}
          year={single.year.year}
          originEl={null}
          onClose={onClose}
          newGradeBanner={{
            bimester: single.highlight.bimester,
            personalGrade: single.newGrade,
            classAverage: single.classAvgBim,
            previousGrade: single.prevGrade,
            eyebrow: isWhileAway ? `Novidade • ${detail.classCode || cls} • ${single.year.year}` : undefined,
            headline: isWhileAway ? 'Uma nova nota saiu enquanto você estava fora' : undefined,
          }}
        />
      );
    }
  }

  // 2. Drill-down from the multi-grade summary into a single subject's full modal (Back returns to summary).
  if (focusedDetailKey) {
    const focused = resolvedItems.find((i) => i.key === focusedDetailKey);
    if (focused?.analysis && focused.year) {
      return (
        <SubjectDetailsModal
          analysis={focused.analysis}
          classCode={focused.year.title || detail.classCode || 'CTI'}
          year={focused.year.year}
          originEl={null}
          onClose={() => setFocusedDetailKey(null)}
          newGradeBanner={{
            bimester: focused.highlight.bimester,
            personalGrade: focused.newGrade,
            classAverage: focused.classAvgBim,
            previousGrade: focused.prevGrade,
          }}
        />
      );
    }
  }

  const headerYear =
    resolvedItems[0]?.year?.year ??
    resolvedItems[0]?.highlight.year ??
    detail.primaryYear ??
    new Date().getFullYear();
  const headerClass = resolvedItems[0]?.year?.title || detail.classCode || 'NSAC';
  const visibleSpecs =
    specFilterKey === 'all' ? resolvedItems : resolvedItems.filter((item) => item.key === specFilterKey);

  const jumpToSpec = (key: string) => {
    setSpecFilterKey('all');
    window.requestAnimationFrame(() => {
      const node = specCardRefs.current.get(key);
      node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // 3. Multi-grade (accumulated) Summary-First Modal — or cold-start fallback for single grade before boletim loads.
  return (
    <ExpressiveModal
      ariaLabel={
        resolvedItems.length >= 2
          ? `Resumo de ${resolvedItems.length} novas notas`
          : detail.title || 'Nova nota no NSAC'
      }
      onClose={onClose}
      maxWidth={560}
    >
      {(close) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ModalHeader
            icon={<Award size={21} />}
            eyebrow={
              isWhileAway
                ? `Novidades • ${detail.classCode || headerClass} • ${headerYear}`
                : resolvedItems.length >= 2
                  ? `Resumo de Notas • ${detail.classCode || headerClass} • ${headerYear}`
                  : `Nova Nota • ${detail.classCode || headerClass}`
            }
            title={
              resolvedItems.length >= 2
                ? `${resolvedItems.length} novas notas lançadas`
                : resolvedItems[0]?.highlight.subject || detail.title || 'Novas notas lançadas'
            }
            onClose={() => close()}
          />

          {isWhileAway && (
            <div
              style={{
                marginTop: -6,
                padding: '9px 13px',
                borderRadius: 14,
                backgroundColor: tokens.surfaceContainerHigh,
                border: `1px solid ${tokens.outlineVariant}`,
                fontSize: '0.82rem',
                fontWeight: 700,
                color: tokens.onSurface,
                lineHeight: 1.35,
              }}
            >
              {resolvedItems.length >= 2
                ? 'Algumas notas novas saíram enquanto você estava fora.'
                : 'Uma nova nota saiu enquanto você estava fora.'}
            </div>
          )}

          {/* Aggregate KPI strip when 2+ grades accumulated */}
          {resolvedItems.length >= 2 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 10,
              }}
            >
              <MetricTile
                label="Média das Novas"
                value={
                  aggregate.avgNewGrades !== null ? (
                    <AnimatedNumber value={aggregate.avgNewGrades} decimals={2} />
                  ) : (
                    '—'
                  )
                }
                caption={`Em ${aggregate.totalCount} matéria${aggregate.totalCount === 1 ? '' : 's'}`}
                background={tokens.primaryContainer}
                color={tokens.onPrimaryContainer}
              />
              <MetricTile
                label="Vs Média da Sala"
                value={
                  aggregate.comparedCount > 0
                    ? `${aggregate.aboveClassCount}/${aggregate.comparedCount} acima`
                    : `${aggregate.totalCount} lançadas`
                }
                caption={
                  aggregate.avgDiffVsClass !== null
                    ? `Média ${formatSigned(aggregate.avgDiffVsClass, 2)} vs M.T.`
                    : 'Toque abaixo para detalhes'
                }
                compactValue
                background={
                  aggregate.avgDiffVsClass !== null && aggregate.avgDiffVsClass < 0
                    ? tokens.gradeWarningContainer
                    : tokens.gradeSuccessContainer
                }
                color={
                  aggregate.avgDiffVsClass !== null && aggregate.avgDiffVsClass < 0
                    ? tokens.onGradeWarningContainer
                    : tokens.onGradeSuccessContainer
                }
              />
            </div>
          )}

          {/* SECTION 1 (FIRST!): Quick Summary of ALL New Grades + Each Subject's Average */}
          {resolvedItems.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  color: tokens.primary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 8,
                }}
              >
                Resumo: Notas Novas e Médias
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {resolvedItems.map((item, idx) => {
                  const aboveClass = item.diffVsClassBim !== null && item.diffVsClassBim >= 0;
                  const phase: 'waiting' | 'counting' | 'done' =
                    idx < revealIdx ? 'done' : idx === revealIdx ? 'counting' : 'waiting';
                  const isCountingTen = phase === 'counting' && isPerfectTen(item.newGrade);
                  const isDoneTen = phase === 'done' && isPerfectTen(item.newGrade);
                  return (
                    <div
                      key={item.key}
                      ref={(node) => {
                        if (node) summaryRowRefs.current.set(item.key, node);
                        else summaryRowRefs.current.delete(item.key);
                      }}
                    >
                    <ExpressiveSegmentedCard
                      index={idx}
                      total={resolvedItems.length}
                      selected={phase === 'counting' || isDoneTen}
                      onClick={() => jumpToSpec(item.key)}
                      style={{
                        padding: '10px 13px',
                        cursor: 'pointer',
                        ...(isDoneTen
                          ? { borderColor: '#F59E0B' }
                          : isCountingTen
                            ? { borderColor: 'rgba(245, 158, 11, 0.65)' }
                            : {}),
                        transition: 'border-color 240ms ease, background-color 220ms ease',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: isMaterialYou ? 12 : 9,
                              backgroundColor: isDoneTen
                                ? 'rgba(245, 158, 11, 0.22)'
                                : tokens.surfaceContainerHighest,
                              color: isDoneTen ? '#F59E0B' : tokens.primary,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {isDoneTen ? <Sparkles size={17} /> : renderSubjectIcon(item.highlight.subject, 17)}
                          </div>

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                flexWrap: 'wrap',
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: 800,
                                  fontSize: '0.92rem',
                                  color: tokens.onSurface,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {item.highlight.subject}
                              </span>
                              <span
                                style={{
                                  padding: '1px 7px',
                                  borderRadius: 999,
                                  fontSize: '0.66rem',
                                  fontWeight: 800,
                                  backgroundColor: isDoneTen
                                    ? 'rgba(245, 158, 11, 0.22)'
                                    : tokens.surfaceContainerHighest,
                                  color: isDoneTen ? '#F59E0B' : tokens.onSurfaceVariant,
                                }}
                              >
                                {isDoneTen ? `${item.highlight.bimester}ºB • 10!` : `${item.highlight.bimester}ºB`}
                              </span>
                            </div>

                            <div
                              style={{
                                fontSize: '0.74rem',
                                color: tokens.onSurfaceVariant,
                                marginTop: 2,
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '2px 8px',
                              }}
                            >
                              <span>
                                Sua média:{' '}
                                <strong style={{ color: tokens.onSurface }}>
                                  {item.subjectAvg !== null ? formatGrade(item.subjectAvg, 2) : '—'}
                                </strong>
                              </span>
                              {item.classAvgBim !== null && (
                                <span>
                                  Sala:{' '}
                                  <strong style={{ color: tokens.onSurface }}>
                                    {formatGrade(item.classAvgBim, 1)}
                                  </strong>
                                  {item.diffVsClassBim !== null && (
                                    <span
                                      style={{
                                        marginLeft: 4,
                                        fontWeight: 800,
                                        color: aboveClass ? tokens.gradeSuccess : tokens.gradeWarning,
                                      }}
                                    >
                                      ({formatSigned(item.diffVsClassBim, 1)})
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <GradeRevealScore
                            target={item.newGrade}
                            phase={phase}
                            size="pill"
                            onComplete={() => advanceReveal(idx)}
                          />
                          <ChevronRight size={15} color={tokens.onSurfaceVariant} />
                        </div>
                      </div>
                    </ExpressiveSegmentedCard>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {refreshing && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 14,
                backgroundColor: tokens.surfaceContainerHigh,
                fontSize: '0.78rem',
                color: tokens.onSurfaceVariant,
              }}
            >
              <MorphingShapeIndicator size={16} label="Atualizando boletim" />
              <span>Sincronizando estatísticas e histórico completo das matérias…</span>
            </div>
          )}

          {/* SECTION 2 (AFTER SUMMARY): Detailed Specifications for Each Subject */}
          {resolvedItems.length >= 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  paddingTop: 4,
                  borderTop: `1px solid ${tokens.outlineVariant}`,
                }}
              >
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    color: tokens.primary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Especificações de Cada Matéria
                </span>
              </div>

              {/* Filter chips for rapid navigation when 3+ subjects */}
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  overflowX: 'auto',
                  paddingBottom: 2,
                  scrollbarWidth: 'none',
                }}
              >
                <button
                  type="button"
                  onClick={() => setSpecFilterKey('all')}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 999,
                    border: `1px solid ${specFilterKey === 'all' ? tokens.primary : tokens.outlineVariant}`,
                    backgroundColor:
                      specFilterKey === 'all' ? tokens.primaryContainer : tokens.surfaceContainerHigh,
                    color: specFilterKey === 'all' ? tokens.onPrimaryContainer : tokens.onSurface,
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                  }}
                >
                  Todas ({resolvedItems.length})
                </button>
                {resolvedItems.map((item) => {
                  const active = specFilterKey === item.key;
                  return (
                    <button
                      key={`pill-${item.key}`}
                      type="button"
                      onClick={() => setSpecFilterKey(item.key)}
                      style={{
                        padding: '5px 11px',
                        borderRadius: 999,
                        border: `1px solid ${active ? tokens.primary : tokens.outlineVariant}`,
                        backgroundColor: active ? tokens.primaryContainer : tokens.surfaceContainerHigh,
                        color: active ? tokens.onPrimaryContainer : tokens.onSurface,
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                      }}
                    >
                      {item.highlight.subject}
                      {item.newGrade !== null ? `: ${formatGrade(item.newGrade, 1)}` : ''}
                    </button>
                  );
                })}
              </div>

              {/* Full per-subject specification cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {visibleSpecs.map((item) => {
                  const a = item.analysis;
                  const goalPositive =
                    a?.goalStatus === 'passed_24' || a?.goalStatus === 'completed_pass';
                  const goalNegative =
                    a?.goalStatus === 'needs_recovery' || a?.goalStatus === 'completed_fail';
                  return (
                    <div
                      key={`spec-${item.key}`}
                      ref={(node) => {
                        if (node) specCardRefs.current.set(item.key, node);
                        else specCardRefs.current.delete(item.key);
                      }}
                      style={{
                        padding: '15px 15px 14px',
                        borderRadius: isMaterialYou ? 22 : 14,
                        backgroundColor: tokens.surfaceContainerLow,
                        border: `1px solid ${tokens.outlineVariant}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                      }}
                    >
                      {/* Subject Spec Header */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: isMaterialYou ? 14 : 10,
                              backgroundColor: tokens.primaryContainer,
                              color: tokens.onPrimaryContainer,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {renderSubjectIcon(item.highlight.subject, 19)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontFamily: 'Outfit, sans-serif',
                                fontWeight: 800,
                                fontSize: '1.02rem',
                                color: tokens.onSurface,
                              }}
                            >
                              {item.highlight.subject}
                            </div>
                            <div
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                color: tokens.primary,
                              }}
                            >
                              {item.highlight.bimester}º Bimestre • Nova Nota:{' '}
                              {item.newGrade !== null ? formatGrade(item.newGrade, 1) : 'Atualizada'}
                            </div>
                          </div>
                        </div>

                        {a && item.year && (
                          <button
                            type="button"
                            onClick={() => setFocusedDetailKey(item.key)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 999,
                              border: `1px solid ${tokens.outlineVariant}`,
                              backgroundColor: tokens.surfaceContainerHigh,
                              color: tokens.onSurface,
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            Detalhes
                          </button>
                        )}
                      </div>

                      {/* Badges: Class comparison + Evolution vs previous bimester */}
                      {(item.diffVsClassBim !== null || item.evolutionDelta !== null) && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {item.classAvgBim !== null && item.diffVsClassBim !== null && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '4px 10px',
                                borderRadius: 999,
                                backgroundColor:
                                  item.diffVsClassBim >= 0
                                    ? tokens.gradeSuccessContainer
                                    : tokens.gradeWarningContainer,
                                color:
                                  item.diffVsClassBim >= 0
                                    ? tokens.onGradeSuccessContainer
                                    : tokens.onGradeWarningContainer,
                                fontSize: '0.72rem',
                                fontWeight: 800,
                              }}
                            >
                              <Users size={12} /> Sala {formatGrade(item.classAvgBim, 1)} (
                              {formatSigned(item.diffVsClassBim, 1)})
                            </span>
                          )}
                          {item.evolutionDelta !== null &&
                            item.prevGrade !== null &&
                            item.newGrade !== null && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '4px 10px',
                                  borderRadius: 999,
                                  backgroundColor: tokens.surfaceContainerHighest,
                                  color: tokens.onSurface,
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                }}
                              >
                                {item.evolutionDelta >= 0 ? (
                                  <TrendingUp size={12} color={tokens.gradeSuccess} />
                                ) : (
                                  <TrendingDown size={12} color={tokens.error} />
                                )}
                                Evolução: {formatGrade(item.prevGrade, 1)} → {formatGrade(item.newGrade, 1)} (
                                {formatSigned(item.evolutionDelta, 1)})
                              </span>
                            )}
                        </div>
                      )}

                      {/* Key Subject Stats Grid (from live `analyzeSubject`) */}
                      {a && (
                        <>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                              gap: 8,
                            }}
                          >
                            <div
                              style={{
                                padding: '9px 10px',
                                borderRadius: 14,
                                backgroundColor: tokens.surfaceContainerHigh,
                              }}
                            >
                              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: tokens.onSurfaceVariant, textTransform: 'uppercase' }}>
                                Sua Média
                              </div>
                              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 900, fontSize: '1.12rem', color: tokens.primary }}>
                                {a.personalAvg !== null ? formatGrade(a.personalAvg, 2) : '—'}
                              </div>
                              <div style={{ fontSize: '0.66rem', color: tokens.onSurfaceVariant }}>
                                Sala {a.classAvg !== null ? formatGrade(a.classAvg, 2) : '—'}
                              </div>
                            </div>

                            <div
                              style={{
                                padding: '9px 10px',
                                borderRadius: 14,
                                backgroundColor: tokens.surfaceContainerHigh,
                              }}
                            >
                              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: tokens.onSurfaceVariant, textTransform: 'uppercase' }}>
                                Pontos
                              </div>
                              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 900, fontSize: '1.12rem', color: tokens.onSurface }}>
                                {formatGrade(a.accumulatedPoints, 1)}
                                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: tokens.onSurfaceVariant }}>
                                  /24
                                </span>
                              </div>
                              <div style={{ fontSize: '0.66rem', color: tokens.onSurfaceVariant }}>
                                {a.totalAbsences} falta(s)
                              </div>
                            </div>

                            <div
                              style={{
                                padding: '9px 10px',
                                borderRadius: 14,
                                backgroundColor: goalPositive
                                  ? tokens.gradeSuccessContainer
                                  : goalNegative
                                    ? tokens.errorContainer
                                    : tokens.gradeWarningContainer,
                                color: goalPositive
                                  ? tokens.onGradeSuccessContainer
                                  : goalNegative
                                    ? tokens.onErrorContainer
                                    : tokens.onGradeWarningContainer,
                              }}
                            >
                              <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Target size={10} /> Meta 6,0
                              </div>
                              <div style={{ fontWeight: 800, fontSize: '0.76rem', lineHeight: 1.25, marginTop: 2 }}>
                                {a.goalBadgeText}
                              </div>
                            </div>
                          </div>

                          {/* Visual Bar comparing new bimester score vs class M.T. */}
                          {item.newGrade !== null && item.classAvgBim !== null && (
                            <ExpressiveGradeCompareBar
                              personalGrade={item.newGrade}
                              classAverage={item.classAvgBim}
                            />
                          )}

                          {/* Reusable SVG Bimester Evolution Chart */}
                          <SubjectEvolutionMiniChart
                            bimesters={a.subject.bimesters}
                            highlightBimester={item.highlight.bimester}
                          />

                          {/* Compact Bimesters Strip */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
                            {a.subject.bimesters.map((bi) => {
                              const isNew = bi.bimester === item.highlight.bimester;
                              return (
                                <div
                                  key={bi.bimester}
                                  style={{
                                    padding: '7px 6px',
                                    borderRadius: 12,
                                    textAlign: 'center',
                                    backgroundColor: isNew
                                      ? tokens.primaryContainer
                                      : tokens.surfaceContainerHighest,
                                    color: isNew ? tokens.onPrimaryContainer : tokens.onSurface,
                                    border: isNew ? `1.5px solid ${tokens.primary}` : 'none',
                                  }}
                                >
                                  <div style={{ fontSize: '0.62rem', fontWeight: 800, opacity: 0.8 }}>
                                    {bi.bimester}ºB{isNew ? ' • NOVA' : ''}
                                  </div>
                                  <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 900, fontSize: '0.96rem' }}>
                                    {bi.personal.grade !== null ? formatGrade(bi.personal.grade, 1) : '—'}
                                  </div>
                                  <div style={{ fontSize: '0.6rem', opacity: 0.75 }}>
                                    Sala {bi.class.averageGrade !== null ? formatGrade(bi.class.averageGrade, 1) : '—'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <EnhancedMorphButton
            size="md"
            variant="filled"
            fullWidth
            onClick={() =>
              close(() => {
                onClose();
                onOpenBoletim();
              })
            }
          >
            Ver no Boletim Completo
          </EnhancedMorphButton>
        </div>
      )}
    </ExpressiveModal>
  );
};
