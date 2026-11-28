import React, { useEffect, useState } from 'react';
import { Equal, TrendingDown, TrendingUp } from 'lucide-react';
import type { PeerComparisonDetail, SubjectComparisonRow } from '../api/types';
import { useM3Theme } from '../theme/ThemeContext';
import {
  ExpressiveSegmentedCard,
  IconShapeContainer,
  RevealNumber,
} from './expressive/ExpressivePrimitives';
import { ProfileAvatar } from './profile/ProfileAvatar';
import { MetricTile } from './expressive/ExpressiveModal';
import { renderSubjectIcon } from '../utils/subjectIcons';

const plural = (n: number) => (n === 1 ? 'matéria' : 'matérias');
const absences = (n: number) => `${n} ${n === 1 ? 'falta' : 'faltas'}`;

/** Backend treats |delta| <= 0.05 as a tie; mirror it so chips match the scoreboard. */
const TIE_EPSILON = 0.05;

const sectionLabelStyle = (color: string): React.CSSProperties => ({
  fontSize: '0.78rem',
  fontWeight: 800,
  color,
  margin: '20px 0 10px',
  textTransform: 'uppercase',
});

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
        backgroundColor: tie ? tokens.surfaceContainerHighest : ahead ? tokens.gradeSuccessContainer : tokens.errorContainer,
        color: tie ? tokens.onSurfaceVariant : ahead ? tokens.onGradeSuccessContainer : tokens.onErrorContainer,
      }}
    >
      {tie ? <Equal size={13} /> : ahead ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {tie ? 'Empate' : `${ahead ? '+' : ''}${delta.toFixed(2)}`}
    </span>
  );
};

/** One side of the comparison: who is being compared. */
export interface ComparisonSide {
  accountId: number;
  label: string;
  avatarUrl: string | null;
  rank: number | null;
  average: number | null;
  classCode: string | null;
  canOpenProfile: boolean;
}

/** Name + photo column of the head-to-head header (photo opens the profile when allowed). */
const SideHeader: React.FC<{ side: ComparisonSide; align: 'left' | 'right'; wins: number; isMe: boolean }> = ({
  side,
  align,
  wins,
  isMe,
}) => {
  const { tokens } = useM3Theme();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'left' ? 'flex-start' : 'flex-end',
        gap: 8,
        minWidth: 0,
        textAlign: align,
      }}
    >
      <ProfileAvatar
        name={side.label}
        image={side.avatarUrl}
        size={64}
        rank={side.rank}
        highlight={isMe}
        profile={{
          accountId: side.accountId,
          label: side.label,
          avatarUrl: side.avatarUrl,
          classCode: side.classCode,
          rank: side.rank,
          average: side.average,
          canOpen: side.canOpenProfile,
        }}
      />
      <div style={{ minWidth: 0, maxWidth: '100%' }}>
        <div
          style={{
            fontWeight: 800,
            fontSize: '0.98rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {isMe ? 'Você' : side.label}
        </div>
        <div style={{ fontSize: '0.74rem', color: tokens.onSurfaceVariant }}>
          {wins} {plural(wins)} à frente
        </div>
      </div>
    </div>
  );
};

/**
 * One subject, side by side: my grade on the left, theirs on the right, a bar growing out of the
 * center towards each side. Numbers count up (and bars grow) when the row scrolls into view.
 */
const DuelRow: React.FC<{
  row: SubjectComparisonRow;
  index: number;
  isCrossClass: boolean;
  myClassCode: string | null;
  peerClassCode: string | null;
}> = ({ row, index, isCrossClass, myClassCode, peerClassCode }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [revealed, setRevealed] = useState(false);
  const mine = row.my_average ?? 0;
  const theirs = row.peer_average ?? 0;
  const delta = row.delta_me_vs_peer ?? mine - theirs;
  const tie = Math.abs(delta) <= TIE_EPSILON;
  const iWin = !tie && delta > 0;
  const theyWin = !tie && delta < 0;
  const scale = Math.max(10, mine, theirs);
  const ratio = (v: number) => (revealed ? Math.min(1, Math.max(0, v / scale)) : 0);
  const grow = 'transform 650ms cubic-bezier(0.05, 0.7, 0.1, 1)';
  const winColor = tokens.gradeSuccess;
  const sideColor = (wins: boolean) => (tie ? tokens.onSurface : wins ? winColor : tokens.onSurfaceVariant);
  const delay = Math.min(index, 4) * 60;
  const hasSeparateClassAverages =
    row.my_class_average != null &&
    row.peer_class_average != null &&
    (isCrossClass || Math.abs(row.my_class_average - row.peer_class_average) >= 0.05);

  return (
    <ExpressiveSegmentedCard
      index={0}
      total={1}
      staggerIndex={index}
      style={{
        padding: '12px 14px',
        ...(index >= 4
          ? { contentVisibility: 'auto', containIntrinsicSize: 'auto 126px' }
          : undefined),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
        <IconShapeContainer size={28}>{renderSubjectIcon(row.subject_name, 14)}</IconShapeContainer>
        <span
          style={{
            fontWeight: 700,
            fontSize: '0.88rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        >
          {row.subject_name}
        </span>
        {isCrossClass && row.is_common && (
          <span
            style={{
              padding: '2px 7px',
              borderRadius: isMaterialYou ? 999 : 6,
              fontSize: '0.66rem',
              fontWeight: 700,
              backgroundColor: tokens.primaryContainer,
              color: tokens.onPrimaryContainer,
              flexShrink: 0,
            }}
          >
            Em comum
          </span>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center',
          gap: 12,
          marginTop: 10,
        }}
      >
        <span style={{ fontWeight: 800, fontSize: '1.3rem', color: sideColor(iWin), minWidth: 44 }}>
          <RevealNumber value={mine} decimals={1} delayMs={delay} onReveal={() => setRevealed(true)} />
        </span>

        {/* Bidirectional bar: mine grows left from the center, theirs grows right. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2px 1fr', alignItems: 'center', gap: 3 }}>
          <div
            style={{
              height: 10,
              borderRadius: isMaterialYou ? 999 : 4,
              backgroundColor: tokens.surfaceContainerHighest,
              display: 'flex',
              justifyContent: 'flex-end',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: 'inherit',
                backgroundColor: iWin ? winColor : tokens.primary,
                opacity: theyWin ? 0.55 : 1,
                transform: `scaleX(${ratio(mine)})`,
                transformOrigin: 'right center',
                transition: grow,
              }}
            />
          </div>
          <div style={{ height: 18, borderRadius: 2, backgroundColor: tokens.outlineVariant }} />
          <div
            style={{
              height: 10,
              borderRadius: isMaterialYou ? 999 : 4,
              backgroundColor: tokens.surfaceContainerHighest,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: 'inherit',
                backgroundColor: theyWin ? winColor : tokens.tertiary,
                opacity: iWin ? 0.55 : 1,
                transform: `scaleX(${ratio(theirs)})`,
                transformOrigin: 'left center',
                transition: grow,
              }}
            />
          </div>
        </div>

        <span style={{ fontWeight: 800, fontSize: '1.3rem', color: sideColor(theyWin), minWidth: 44, textAlign: 'right' }}>
          <RevealNumber value={theirs} decimals={1} delayMs={delay} />
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginTop: 8,
          fontSize: '0.72rem',
          color: tokens.onSurfaceVariant,
        }}
      >
        <span>{absences(row.my_absences)}</span>
        <DeltaChip delta={delta} />
        <span>{absences(row.peer_absences)}</span>
      </div>
      {hasSeparateClassAverages ? (
        <div
          style={{
            textAlign: 'center',
            fontSize: '0.7rem',
            color: tokens.onSurfaceVariant,
            marginTop: 4,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          M.T. {myClassCode ?? 'sua sala'} {row.my_class_average!.toFixed(1)} · M.T.{' '}
          {peerClassCode ?? 'colega'} {row.peer_class_average!.toFixed(1)}
        </div>
      ) : (
        row.class_average !== null && (
          <div style={{ textAlign: 'center', fontSize: '0.7rem', color: tokens.onSurfaceVariant, marginTop: 4 }}>
            Média da sala {row.class_average.toFixed(1)}
          </div>
        )
      )}
    </ExpressiveSegmentedCard>
  );
};

/**
 * Head-to-head body shared by the comparison popup and its full-screen page: both students side
 * by side (me on the left, the peer on the right), the scoreboard, then subject-by-subject duels.
 */
const INITIAL_DUELS = 4;
const DUELS_PER_IDLE = 6;

export const PeerComparisonContent: React.FC<{
  comparison: PeerComparisonDetail;
  me: ComparisonSide;
  peer: ComparisonSide;
  wide?: boolean;
}> = ({ comparison, me, peer, wide = false }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const isCrossClass = Boolean(
    me.classCode &&
      peer.classCode &&
      me.classCode.trim().toUpperCase() !== peer.classCode.trim().toUpperCase()
  );
  const comparableRaw = comparison.subjects.filter((r) => r.my_average !== null && r.peer_average !== null);
  const comparable = [...comparableRaw].sort((a, b) => Number(Boolean(b.is_common)) - Number(Boolean(a.is_common)));
  const unmatched = comparison.subjects.filter((r) => r.my_average === null || r.peer_average === null);
  const [renderedDuels, setRenderedDuels] = useState(INITIAL_DUELS);

  // Mount the first visible rows immediately so the loading veil can fade out at 60fps,
  // then stream the rest of the subjects in idle slices without blocking the main thread.
  const comparableCount = comparable.length;
  useEffect(() => {
    setRenderedDuels(INITIAL_DUELS);
    if (comparableCount <= INITIAL_DUELS) return;
    let handle = 0;
    const idle = (cb: () => void) =>
      'requestIdleCallback' in window
        ? window.requestIdleCallback(cb, { timeout: 240 })
        : (window as Window).setTimeout(cb, 48);
    const cancel = (h: number) =>
      'cancelIdleCallback' in window ? window.cancelIdleCallback(h) : (window as Window).clearTimeout(h);
    const grow = () => {
      setRenderedDuels((n) => {
        const next = Math.min(comparableCount, n + DUELS_PER_IDLE);
        if (next < comparableCount) handle = idle(grow);
        return next;
      });
    };
    // Start appending off-screen rows after the modal enter animation settles.
    const startTimer = window.setTimeout(() => {
      handle = idle(grow);
    }, 260);
    return () => {
      window.clearTimeout(startTimer);
      if (handle) cancel(handle);
    };
  }, [comparison.peer_entry.account_id, comparableCount]);

  const avg = (pick: (r: SubjectComparisonRow) => number) =>
    comparable.length ? comparable.reduce((s, r) => s + pick(r), 0) / comparable.length : null;
  const myAvg = avg((r) => r.my_average!);
  const peerAvg = avg((r) => r.peer_average!);

  return (
    <div data-no-size-morph>
      {/* Me (left) vs peer (right) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
          alignItems: 'center',
          gap: 12,
          marginTop: 18,
          padding: '16px 16px 14px',
          borderRadius: isMaterialYou ? 28 : 14,
          background: `linear-gradient(90deg, ${tokens.primaryContainer}55, ${tokens.surfaceContainer} 45%, ${tokens.surfaceContainer} 55%, ${tokens.tertiaryContainer}55)`,
          border: `1px solid ${tokens.outlineVariant}`,
        }}
      >
        <SideHeader side={me} align="left" wins={comparison.my_wins} isMe />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.12em', color: tokens.onSurfaceVariant }}>VS</span>
          <span style={{ fontSize: '1.5rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            <RevealNumber value={comparison.my_wins} decimals={0} />
            <span style={{ color: tokens.onSurfaceVariant, margin: '0 6px' }}>×</span>
            <RevealNumber value={comparison.peer_wins} decimals={0} />
          </span>
          <span style={{ fontSize: '0.7rem', color: tokens.onSurfaceVariant, whiteSpace: 'nowrap' }}>
            {comparison.ties} {comparison.ties === 1 ? 'empate' : 'empates'}
          </span>
        </div>
        <SideHeader side={peer} align="right" wins={comparison.peer_wins} isMe={false} />
      </div>

      {comparison.subjects.length === 0 ? (
        <div style={{ marginTop: 18, padding: 28, textAlign: 'center', borderRadius: isMaterialYou ? 24 : 12, backgroundColor: tokens.surfaceContainer }}>
          <div style={{ fontWeight: 700 }}>Nenhuma nota publicada neste período</div>
          <div style={{ fontSize: '0.82rem', color: tokens.onSurfaceVariant, marginTop: 4 }}>
            Troque o bimestre para comparar outro período.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <MetricTile
            label="Sua média em comum"
            value={myAvg !== null ? <RevealNumber value={myAvg} decimals={2} /> : '—'}
            background={tokens.primaryContainer}
            color={tokens.onPrimaryContainer}
          />
          <MetricTile
            label={`Média de ${peer.label.split(' ')[0]}`}
            value={peerAvg !== null ? <RevealNumber value={peerAvg} decimals={2} /> : '—'}
            background={tokens.tertiaryContainer}
            color={tokens.onTertiaryContainer}
          />
        </div>
      )}

      {comparable.length > 0 && (
        <>
          <div style={sectionLabelStyle(tokens.primary)}>
            {isCrossClass
              ? `Matérias em comum (${comparable.length}) • valem no placar`
              : 'Matéria por matéria'}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: wide ? 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' : '1fr',
              gap: 8,
            }}
          >
            {comparable.slice(0, renderedDuels).map((row, idx) => (
              <DuelRow
                key={row.subject_name}
                row={row}
                index={idx}
                isCrossClass={isCrossClass}
                myClassCode={me.classCode}
                peerClassCode={peer.classCode}
              />
            ))}
          </div>
        </>
      )}

      {unmatched.length > 0 && (
        <>
          <div style={sectionLabelStyle(tokens.onSurfaceVariant)}>
            {isCrossClass
              ? `Fora do duelo — exclusivas ou sem nota (${unmatched.length})`
              : `Sem comparação (${unmatched.length})`}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {unmatched.map((row) => (
              <span
                key={row.subject_name}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  maxWidth: '100%',
                  padding: '6px 12px',
                  borderRadius: isMaterialYou ? 999 : 8,
                  fontSize: '0.78rem',
                  backgroundColor: tokens.surfaceContainer,
                  border: `1px solid ${tokens.outlineVariant}`,
                  color: tokens.onSurfaceVariant,
                }}
              >
                {renderSubjectIcon(row.subject_name, 13)}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: tokens.onSurface, fontWeight: 600 }}>
                  {row.subject_name}
                </span>
                <span style={{ flexShrink: 0 }}>
                  {row.my_average !== null ? '· só você' : row.peer_average !== null ? '· só colega' : '· sem notas'}
                </span>
              </span>
            ))}
          </div>
          <div style={{ fontSize: '0.74rem', color: tokens.onSurfaceVariant, marginTop: 8 }}>
            Matérias sem nota de um dos dois ficam fora do placar.
          </div>
        </>
      )}
    </div>
  );
};
