import React from 'react';
import { Equal, TrendingDown, TrendingUp } from 'lucide-react';
import type { ClassroomComparisonDetail, ClassroomSubjectComparisonRow } from '../api/types';
import { useM3Theme } from '../theme/ThemeContext';
import {
  ExpressiveSegmentedCard,
  IconShapeContainer,
  RevealNumber,
} from './expressive/ExpressivePrimitives';
import { MetricTile } from './expressive/ExpressiveModal';
import { renderSubjectIcon } from '../utils/subjectIcons';

const TIE_EPSILON = 0.05;
const plural = (n: number) => (n === 1 ? 'matéria' : 'matérias');

const DeltaChip: React.FC<{ delta: number }> = ({ delta }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const tie = Math.abs(delta) <= TIE_EPSILON;
  const ahead = delta > 0;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        borderRadius: isMaterialYou ? 999 : 8,
        fontSize: '0.76rem',
        fontWeight: 800,
        flexShrink: 0,
        fontVariantNumeric: 'tabular-nums',
        backgroundColor: tie
          ? tokens.surfaceContainerHighest
          : ahead
            ? tokens.gradeSuccessContainer
            : tokens.errorContainer,
        color: tie
          ? tokens.onSurfaceVariant
          : ahead
            ? tokens.onGradeSuccessContainer
            : tokens.onErrorContainer,
      }}
    >
      {tie ? <Equal size={13} /> : ahead ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {tie ? 'Empate' : `${ahead ? '+' : ''}${delta.toFixed(2)}`}
    </span>
  );
};

export const ClassroomComparisonPanel: React.FC<{
  comparison: ClassroomComparisonDetail;
  wide?: boolean;
}> = ({ comparison, wide = false }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const myClass = comparison.my_class_entry;
  const peerClass = comparison.peer_class_entry;

  const avgDelta = myClass.official_average - peerClass.official_average;
  const commonRows = comparison.subjects.filter((s) => s.is_common !== false);
  const exclusiveRows = comparison.subjects.filter((s) => s.is_common === false);

  const renderSubjectRow = (row: ClassroomSubjectComparisonRow, idx: number, total: number) => {
    const myAvg = row.my_class_average;
    const peerAvg = row.peer_class_average;
    const delta = row.delta;
    const bothPresent = myAvg !== null && peerAvg !== null && delta !== null;

    return (
      <ExpressiveSegmentedCard
        key={row.subject_name}
        index={idx}
        total={total}
        style={{ padding: '12px 14px' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 180px' }}>
            <IconShapeContainer size={36}>
              {renderSubjectIcon(row.subject_name, 16)}
            </IconShapeContainer>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.subject_name}
              </div>
              <div
                style={{
                  fontSize: '0.74rem',
                  color: tokens.onSurfaceVariant,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {myClass.class_code}: {myAvg !== null ? myAvg.toFixed(2) : '—'} • {peerClass.class_code}:{' '}
                {peerAvg !== null ? peerAvg.toFixed(2) : '—'}
              </div>
            </div>
          </div>

          {bothPresent ? (
            <DeltaChip delta={delta} />
          ) : (
            <span
              style={{
                padding: '3px 9px',
                borderRadius: isMaterialYou ? 999 : 8,
                fontSize: '0.72rem',
                fontWeight: 700,
                backgroundColor: tokens.surfaceContainerHighest,
                color: tokens.onSurfaceVariant,
              }}
            >
              Exclusiva
            </span>
          )}
        </div>
      </ExpressiveSegmentedCard>
    );
  };

  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Scoreboard */}
      <div
        style={{
          padding: wide ? '18px 20px' : '14px 16px',
          borderRadius: isMaterialYou ? 26 : 14,
          backgroundColor: tokens.surfaceContainer,
          border: `1px solid ${tokens.outlineVariant}`,
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: tokens.primary, textTransform: 'uppercase' }}>
            Sua Sala
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 900 }}>{myClass.class_code}</div>
          <div style={{ fontSize: '0.78rem', color: tokens.onSurfaceVariant }}>
            {comparison.my_wins} {plural(comparison.my_wins)} à frente
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: '0.7rem',
              fontWeight: 800,
              color: tokens.onSurfaceVariant,
              textTransform: 'uppercase',
            }}
          >
            Empates: {comparison.ties}
          </div>
          <div style={{ marginTop: 4 }}>
            <DeltaChip delta={avgDelta} />
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: tokens.onSurfaceVariant,
              textTransform: 'uppercase',
            }}
          >
            Adversária
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 900 }}>{peerClass.class_code}</div>
          <div style={{ fontSize: '0.78rem', color: tokens.onSurfaceVariant }}>
            {comparison.peer_wins} {plural(comparison.peer_wins)} à frente
          </div>
        </div>
      </div>

      {/* Averages */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <MetricTile
          label={`M.T. ${myClass.class_code}`}
          value={<RevealNumber value={myClass.official_average} decimals={2} />}
          caption={`${myClass.subjects_count} matérias`}
          background={tokens.primaryContainer}
          color={tokens.onPrimaryContainer}
        />
        <MetricTile
          label={`M.T. ${peerClass.class_code}`}
          value={<RevealNumber value={peerClass.official_average} decimals={2} />}
          caption={`${peerClass.subjects_count} matérias`}
          background={tokens.surfaceContainerHigh}
          color={tokens.onSurface}
        />
      </div>

      {/* Common Subjects */}
      {commonRows.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '0.76rem',
              fontWeight: 800,
              color: tokens.primary,
              margin: '6px 0 8px',
              textTransform: 'uppercase',
            }}
          >
            Matérias em comum ({commonRows.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMaterialYou ? 4 : 8 }}>
            {commonRows.map((row, idx) => renderSubjectRow(row, idx, commonRows.length))}
          </div>
        </div>
      )}

      {/* Exclusive Subjects */}
      {exclusiveRows.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '0.76rem',
              fontWeight: 800,
              color: tokens.onSurfaceVariant,
              margin: '6px 0 8px',
              textTransform: 'uppercase',
            }}
          >
            Matérias exclusivas ({exclusiveRows.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMaterialYou ? 4 : 8 }}>
            {exclusiveRows.map((row, idx) => renderSubjectRow(row, idx, exclusiveRows.length))}
          </div>
        </div>
      )}
    </div>
  );
};
