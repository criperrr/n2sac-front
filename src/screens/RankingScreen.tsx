import React, { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { PeerComparisonContent, type ComparisonSide } from '../components/PeerComparisonPanel';
import { ProfileAvatar } from '../components/profile/ProfileAvatar';
import { PrivacyToggle } from '../components/PrivacyToggle';
import { StudentSearch } from '../components/social/StudentSearch';
import { shapePaths } from '../components/expressive/ShapeMorph';
import { ExpressiveModal, ModalHeader, ModalIconButton, useTransformOrigin } from '../components/expressive/ExpressiveModal';
import { OverlayPage } from '../components/expressive/OverlayPage';
import {
  ArrowLeft,
  Trophy,
  Users,
  EyeOff,
  Maximize2,
  Swords,
  Search,
  ShieldCheck,
  X,
  Camera,
  Contact,
  Crown,
} from 'lucide-react';
import {
  fetchCompareLeaderboard,
  loadCachedUserProfile,
  updateRankingPreferences,
} from '../api/nsacClient';
import type {
  ComparisonSummaryResponse,
  LeaderboardEntry,
  PeerComparisonDetail,
  RankingPreferences,
} from '../api/types';
import { useM3Theme } from '../theme/ThemeContext';
import {
  AnimatedNumber,
  EnhancedConnectedButtonGroup,
  EnhancedMorphButton,
  ExpressiveSegmentedCard,
  IconShapeContainer,
} from '../components/expressive/ExpressivePrimitives';
import { MorphingLoadingState } from '../components/expressive/ShapeMorph';

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
  const { tokens, isMaterialYou } = useM3Theme();
  const [scope, setScope] = useState<'class' | 'course' | 'school'>('class');
  const [bimester, setBimester] = useState<number>(0); // 0 = all
  const [subjectSearch, setSubjectSearch] = useState('');
  const [debouncedSubject, setDebouncedSubject] = useState('');
  const [selectedPeerId, setSelectedPeerId] = useState<number | null>(null);
  const { originRef: peerOriginRef, onClickCapture: capturePeerOrigin } = useTransformOrigin();
  const [data, setData] = useState<ComparisonSummaryResponse | null>(null);
  const [peerComparison, setPeerComparison] = useState<PeerComparisonDetail | null>(null);
  const [comparisonExpanded, setComparisonExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [peerLoading, setPeerLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const peerCacheRef = useRef<Map<string, PeerComparisonDetail>>(new Map());
  const onPreferencesUpdatedRef = useRef(onPreferencesUpdated);
  onPreferencesUpdatedRef.current = onPreferencesUpdated;
  const onRefreshingChangeRef = useRef(onRefreshingChange);
  onRefreshingChangeRef.current = onRefreshingChange;
  const lastReportedPrefsRef = useRef<RankingPreferences | null>(preferences);
  lastReportedPrefsRef.current = preferences;

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
    peerCacheRef.current.clear();
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
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    fetchCompareLeaderboard(
      token,
      {
        scope,
        bimester: bimester === 0 ? null : bimester,
        subject: debouncedSubject || undefined,
      },
      controller.signal
    )
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
  }, [token, scope, bimester, debouncedSubject, refreshNonce]);

  // 2. Peer comparison fetch: runs ONLY when a peer is actively selected.
  // Closing the modal (`selectedPeerId === null`) triggers ZERO network requests.
  useEffect(() => {
    if (selectedPeerId === null) {
      setPeerComparison(null);
      setPeerLoading(false);
      setComparisonError(false);
      return;
    }

    const cacheKey = `${scope}:${bimester}:${debouncedSubject}:${selectedPeerId}`;
    const cached = peerCacheRef.current.get(cacheKey);
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

    fetchCompareLeaderboard(
      token,
      {
        scope,
        bimester: bimester === 0 ? null : bimester,
        subject: debouncedSubject || undefined,
        peerId: selectedPeerId,
      },
      controller.signal
    )
      .then((res) => {
        if (controller.signal.aborted) return;
        if (res.peer_comparison) {
          peerCacheRef.current.set(cacheKey, res.peer_comparison);
          setPeerComparison(res.peer_comparison);
        } else {
          setComparisonError(true);
        }
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
  }, [token, scope, bimester, debouncedSubject, selectedPeerId, refreshNonce]);

  // Progressive list: the first rows render with the screen, the rest in idle time.
  // Keyed by filter params (not `data`) so opening a peer comparison never tears down and
  // remounts the entire leaderboard behind the modal.
  const [renderCount, setRenderCount] = useState(INITIAL_ROWS);
  const total = data?.leaderboard.length ?? 0;
  const leaderboardKey = `${scope}:${bimester}:${debouncedSubject}`;
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
      peerCacheRef.current.clear();
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
        average: null,
        classCode,
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

  return (
    <div
      onClickCapture={capturePeerOrigin}
      style={{ display: 'flex', flexDirection: 'column', gap: isMaterialYou ? 18 : 16 }}
    >
      {/* 1. HERO HEADER & PRIVACY CONTROLS */}
      <section
        style={{
          borderRadius: isMaterialYou ? 32 : 16,
          padding: isMaterialYou ? '24px 22px' : '24px 26px',
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
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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
                Comparação entre Alunos • {classCode ?? 'CTI'}
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

          {data?.my_rank && (
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
                gap: 8,
              }}
            >
              <span>Sua posição: #{data.my_rank}</span>
              {data.my_percentile !== null && (
                <span style={{ opacity: 0.85 }}>
                  (Top {(100 - data.my_percentile + 0.1).toFixed(0)}%)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Privacy Settings Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 10,
            marginBottom: 18,
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
          <EnhancedConnectedButtonGroup<'class' | 'course' | 'school'>
            wrap={true}
            value={scope}
            onChange={(s) => {
              setScope(s);
              setSelectedPeerId(null);
            }}
            options={[
              { value: 'class', label: `Minha Turma (${classCode ?? 'CTI'})`, icon: <Users size={14} /> },
              { value: 'course', label: 'Meu Curso', icon: <Trophy size={14} /> },
              { value: 'school', label: 'Todo o CTI', icon: <Trophy size={14} /> },
            ]}
          />

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
              onClick={() => setSubjectSearch('')}
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
      </section>

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
              Nenhum participante encontrado neste filtro ainda
            </div>
            <div style={{ fontSize: '0.84rem', color: tokens.onSurfaceVariant, marginTop: 4 }}>
              Ative &quot;Participar do Ranking&quot; acima ou alterne para &quot;Todo o CTI&quot;.
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
                      padding: '18px 18px',
                      background: `linear-gradient(120deg, ${tokens.gradeWarningContainer}, ${tokens.surfaceContainerLow} 62%)`,
                      border: `1.5px solid ${tokens.gradeWarning}`,
                      boxShadow: `0 10px 28px -14px ${tokens.gradeWarning}`,
                    }
                  : {
                      padding: '14px 18px',
                      // Off-screen rows skip layout/paint entirely (big lists stay cheap).
                      contentVisibility: 'auto',
                      containIntrinsicSize: 'auto 92px',
                    }
              }
            >
              {entry.rank === 1 && (
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
                  <Crown size={14} strokeWidth={2.6} /> Melhor média
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {entry.rank === 1 ? (
                    <span style={{ position: 'relative', display: 'inline-flex', padding: 7, flexShrink: 0 }}>
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
                        size={50}
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
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.68rem', color: tokens.onSurfaceVariant, textTransform: 'uppercase' }}>
                      Média
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '1.15rem', color: tokens.primary }}>
                      <AnimatedNumber value={entry.personal_average} decimals={2} />
                    </div>
                  </div>
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
