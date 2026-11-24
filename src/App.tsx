import { ProfileViewerProvider } from './components/profile/ProfileViewer';
import { PushedPage } from './components/expressive/PushedPage';
import { GradeNotificationModal } from './components/GradeNotificationModal';
import {
  markSharePromptShown,
  ShareAppPromptModal,
  shouldTriggerRareSharePrompt,
} from './components/ShareAppPromptModal';
import { FeedbackSettingsSection } from './components/settings/FeedbackSettings';
import { NotificationSettingsSection } from './components/settings/NotificationSettings';
import {
  consumeNativeAccumulatedGrades,
  consumePendingAppPushOpen,
  initializePushNotifications,
  type AppPushEventDetail,
} from './notifications/pushService';
import {
  detectNewGradesAndUpdateSeen,
  markHighlightsAsSeen,
  mergeGradeHighlights,
  seedSeenGradesIfMissing,
} from './utils/seenGrades';
import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  checkServerHealth,
  fetchAccountProfile,
  fetchAtrasos,
  fetchBoletim,
  fetchFichaList,
  fetchHomeInfo,
  fetchRankingPreferences,
  fetchSaidas,
  loadCachedResource,
  loadStoredSession,
  logoutNsacSession,
  NsacApiClientError,
  updateRankingPreferences,
} from './api/nsacClient';
import type {
  AccountProfileResponse,
  AllYearsResponse,
  AtrasoRecord,
  FichaAvaliacaoEntry,
  HomeInfo,
  LoginResponse,
  RankingPreferences,
  SaidaRecord,
} from './api/types';
import {
  ExpressiveNavigationShell,
  type AppTabId,
} from './components/ExpressiveNavigation';
import { RankingConsentModal } from './components/RankingConsentModal';
import { MorphingLoadingState } from './components/expressive/ShapeMorph';
import { useM3Theme } from './theme/ThemeContext';
import { useBackLayer } from './navigation/backStack';
import { useTabSwipeGesture } from './navigation/useTabSwipeGesture';
import { canRunScreenTransition, runScreenTransition, type ScreenTransition } from './theme/viewTransition';

const loadBoletimScreen = () =>
  import('./screens/BoletimScreen').then((m) => ({ default: m.BoletimScreen }));
const loadTurmaScreen = () =>
  import('./screens/TurmaScreen').then((m) => ({ default: m.TurmaScreen }));
const loadRankingScreen = () =>
  import('./screens/RankingScreen').then((m) => ({ default: m.RankingScreen }));
const loadFrequenciaScreen = () =>
  import('./screens/FrequenciaScreen').then((m) => ({ default: m.FrequenciaScreen }));
const loadSentinelaScreen = () =>
  import('./screens/SentinelaScreen').then((m) => ({ default: m.SentinelaScreen }));
const loadProfileScreen = () =>
  import('./screens/ProfileScreen').then((m) => ({ default: m.ProfileScreen }));
const loadAdaptiveStudioScreen = () =>
  import('./screens/AdaptiveStudioScreen').then((m) => ({ default: m.AdaptiveStudioScreen }));
const loadLoginScreen = () =>
  import('./screens/LoginScreen').then((m) => ({ default: m.LoginScreen }));

const BoletimScreen = lazy(loadBoletimScreen);
const TurmaScreen = lazy(loadTurmaScreen);
const RankingScreen = lazy(loadRankingScreen);
const FrequenciaScreen = lazy(loadFrequenciaScreen);
const SentinelaScreen = lazy(loadSentinelaScreen);
const ProfileScreen = lazy(loadProfileScreen);
const AdaptiveStudioScreen = lazy(loadAdaptiveStudioScreen);
const LoginScreen = lazy(loadLoginScreen);

const MANUAL_REFRESH_COOLDOWN_SECS = 60;

export const App: React.FC = () => {
  const { applyCourseClassCode } = useM3Theme();
  const [session, setSession] = useState<LoginResponse | null>(() => loadStoredSession());
  const [activeTab, setActiveTab] = useState<AppTabId>('boletim');
  // Configurações & Alertas/Sentinela are pages pushed above the current tab, so the active
  // tab (Turma, Ranking, Frequência, Perfil, Boletim) stays mounted underneath and pressing
  // Back ALWAYS returns straight to where the user was.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sentinelaOpen, setSentinelaOpen] = useState(false);
  const settingsCloseRef = useRef<(() => void) | null>(null);
  const sentinelaCloseRef = useRef<(() => void) | null>(null);
  const tabSurfaceRef = useRef<HTMLDivElement>(null);
  const [gradeNotifDetail, setGradeNotifDetail] = useState<AppPushEventDetail | null>(null);
  const [highlightAnnouncementId, setHighlightAnnouncementId] = useState<number | null>(null);
  /**
   * How the current page arrived, so it animates exactly once:
   * - `vt`: a View Transition already animated it (no CSS entry animation, no card stagger);
   * - `css`: fallback fade-through entry animation (no View Transitions / first load);
   * - `none`: predictive back already previewed the swap.
   */
  const [pageEntry, setPageEntry] = useState<
    'vt' | 'css' | 'axis-x-forward' | 'axis-x-backward' | 'swipe-next' | 'swipe-prev' | 'none'
  >('css');

  // Preload lazy screen chunks during idle time after first paint so tab transitions
  // never stall on network chunk fetches or capture a Suspense fallback snapshot.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.allSettled([
        loadBoletimScreen(),
        loadTurmaScreen(),
        loadRankingScreen(),
        loadFrequenciaScreen(),
        loadSentinelaScreen(),
        loadProfileScreen(),
        loadAdaptiveStudioScreen(),
      ]);
    }, 180);
    return () => window.clearTimeout(timer);
  }, []);

  // Top-level destinations: back returns to Boletim ONLY when no pushed page or modal is open.
  useBackLayer(
    activeTab !== 'boletim' && !settingsOpen && !sentinelaOpen && !gradeNotifDetail,
    (source) => {
      if (source === 'gesture') {
        setPageEntry('css');
        setActiveTab('boletim');
      } else {
        selectTab('boletim');
      }
    },
    { kind: 'tab', surfaceRef: tabSurfaceRef }
  );

  // M3 transition patterns: live-DOM CSS choreography (no View Transition bitmap snapshot
  // stretching/squashing when old and new screens have different heights or async data).
  const navigateTab = useCallback(
    (tab: AppTabId, overrideKind?: ScreenTransition) => {
      if (tab === activeTab) return;
      const kind: ScreenTransition =
        overrideKind ??
        (tab === 'settings' ? 'axis-x-forward' : activeTab === 'settings' ? 'axis-x-backward' : 'fade-through');
      if (kind === 'axis-x-forward' || kind === 'axis-x-backward') {
        setPageEntry(kind);
      } else if (kind === 'swipe-next' || kind === 'swipe-prev') {
        setPageEntry(kind);
      } else {
        setPageEntry('css');
      }
      setActiveTab(tab);
    },
    [activeTab]
  );

  const selectTab = useCallback(
    (tab: AppTabId) => {
      if (tab === 'settings') {
        setSettingsOpen(true);
        return;
      }
      if (tab === 'sentinela') {
        if (settingsOpen) settingsCloseRef.current?.();
        setSentinelaOpen(true);
        return;
      }
      if (settingsOpen) settingsCloseRef.current?.();
      if (sentinelaOpen) sentinelaCloseRef.current?.();
      navigateTab(tab);
    },
    [navigateTab, settingsOpen, sentinelaOpen]
  );

  const handleSwipeTab = useCallback(
    (tab: AppTabId, direction: 'next' | 'prev') => {
      if (tab === activeTab) return;
      // Direct CSS directional slide (no View Transition snapshot stall, zero touch blocking).
      setPageEntry(direction === 'next' ? 'swipe-next' : 'swipe-prev');
      setActiveTab(tab);
    },
    [activeTab]
  );

  useTabSwipeGesture(tabSurfaceRef, activeTab, handleSwipeTab, Boolean(session));
  const [serverHealthy, setServerHealthy] = useState<boolean | null>(null);

  // Instant 0ms Stale-While-Revalidate Local Cache Initialization
  const [boletim, setBoletim] = useState<AllYearsResponse | null>(() => {
    const s = loadStoredSession();
    if (!s) return null;
    return loadCachedResource<AllYearsResponse>('boletim', s.account_id)?.data ?? null;
  });
  const [boletimEtag, setBoletimEtag] = useState<string | null>(() => {
    const s = loadStoredSession();
    if (!s) return null;
    return loadCachedResource<AllYearsResponse>('boletim', s.account_id)?.etag ?? null;
  });
  const [lastStatus, setLastStatus] = useState<200 | 304 | null>(() => {
    const s = loadStoredSession();
    if (!s) return null;
    return loadCachedResource<AllYearsResponse>('boletim', s.account_id)?.lastStatus ?? null;
  });
  const [cachedAt, setCachedAt] = useState<number | null>(() => {
    const s = loadStoredSession();
    if (!s) return null;
    return loadCachedResource<AllYearsResponse>('boletim', s.account_id)?.cachedAt ?? null;
  });
  const [nextPollHintSecs, setNextPollHintSecs] = useState<number>(() => {
    const s = loadStoredSession();
    if (!s) return 300;
    return loadCachedResource<AllYearsResponse>('boletim', s.account_id)?.nextPollHintSecs ?? 300;
  });
  const nextPollHintSecsRef = useRef(nextPollHintSecs);
  nextPollHintSecsRef.current = nextPollHintSecs;
  const [nextPollAt, setNextPollAt] = useState<number | null>(() => {
    const s = loadStoredSession();
    if (!s) return null;
    const hint = loadCachedResource<AllYearsResponse>('boletim', s.account_id)?.nextPollHintSecs ?? 300;
    return Date.now() + hint * 1000;
  });
  const remainingPollMsRef = useRef<number>(nextPollHintSecs * 1000);
  const prevVisibleRef = useRef<boolean>(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );

  const [accountProfile, setAccountProfile] = useState<AccountProfileResponse | null>(null);
  const [sharePromptOpen, setSharePromptOpen] = useState(false);
  const sharePromptTimerRef = useRef<number | null>(null);

  const cancelSharePromptTimer = useCallback(() => {
    if (sharePromptTimerRef.current !== null) {
      window.clearTimeout(sharePromptTimerRef.current);
      sharePromptTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        cancelSharePromptTimer();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      cancelSharePromptTimer();
    };
  }, [cancelSharePromptTimer]);

  const handleCloseGradeNotification = useCallback(() => {
    setGradeNotifDetail(null);
    cancelSharePromptTimer();
    if (!shouldTriggerRareSharePrompt()) return;
    sharePromptTimerRef.current = window.setTimeout(() => {
      sharePromptTimerRef.current = null;
      if (document.visibilityState !== 'visible') return;
      markSharePromptShown();
      setSharePromptOpen(true);
    }, 3000);
  }, [cancelSharePromptTimer]);
  const [rankingPrefs, setRankingPrefs] = useState<RankingPreferences | null>(null);
  const [savingRankingConsent, setSavingRankingConsent] = useState(false);
  const [fichas, setFichas] = useState<FichaAvaliacaoEntry[]>(() => {
    const s = loadStoredSession();
    if (!s) return [];
    return loadCachedResource<FichaAvaliacaoEntry[]>('ficha_list', s.account_id)?.data ?? [];
  });
  const [atrasos, setAtrasos] = useState<AtrasoRecord[]>(() => {
    const s = loadStoredSession();
    if (!s) return [];
    return loadCachedResource<AtrasoRecord[]>('atrasos', s.account_id)?.data ?? [];
  });
  const [saidas, setSaidas] = useState<SaidaRecord[]>(() => {
    const s = loadStoredSession();
    if (!s) return [];
    return loadCachedResource<SaidaRecord[]>('saidas', s.account_id)?.data ?? [];
  });
  const [homeInfo, setHomeInfo] = useState<HomeInfo | null>(() => {
    const s = loadStoredSession();
    if (!s) return null;
    return loadCachedResource<HomeInfo>('home', s.account_id)?.data ?? null;
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tabChildRefreshing, setTabChildRefreshing] = useState(false);
  const [rankingRefreshSignal, setRankingRefreshSignal] = useState(0);
  const [turmaRefreshSignal, setTurmaRefreshSignal] = useState(0);
  const [pendingRoomChannel, setPendingRoomChannel] = useState<'chat' | 'off_topic' | null>(null);
  const [profileRefreshSignal, setProfileRefreshSignal] = useState(0);
  const [refreshCooldownUntil, setRefreshCooldownUntil] = useState<number | null>(null);
  const [isPageVisible, setIsPageVisible] = useState(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );

  const syncInFlightRef = useRef(false);

  // Reset child tab busy indicator whenever switching tabs so a previous tab never leaves it stuck
  useEffect(() => {
    setTabChildRefreshing(false);
  }, [activeTab]);

  // Check backend health
  useEffect(() => {
    checkServerHealth().then(setServerHealthy);
  }, []);

  // Track page foreground/background visibility (`document.visibilityState`)
  useEffect(() => {
    const onVisChange = () => {
      setIsPageVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => document.removeEventListener('visibilitychange', onVisChange);
  }, []);

  // Single-shot timeout for manual refresh anti-spam cooldown (zero 1s App re-renders)
  useEffect(() => {
    if (refreshCooldownUntil === null) return;
    const delayMs = Math.max(0, refreshCooldownUntil - Date.now());
    const timer = window.setTimeout(() => {
      setRefreshCooldownUntil(null);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [refreshCooldownUntil]);

  useEffect(() => {
    if (!session?.token) return;
    void initializePushNotifications(session.token);
  }, [session?.token]);

  const handleLogout = useCallback(async () => {
    if (session) {
      await logoutNsacSession(session.token);
    }
    // Leaving the app level: backward shared axis Z back to the login screen.
    runScreenTransition('axis-z-backward', () => {
      setSession(null);
      setBoletim(null);
      setAccountProfile(null);
      setNextPollAt(null);
    });
  }, [session]);

  const synchronizeAllData = useCallback(
    async (forceBackendRefresh = false) => {
      if (!session || syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      setIsRefreshing(true);

      try {
        const [boletimRes, profileRes, rankingPrefsRes] = await Promise.all([
          fetchBoletim(session.token, session.account_id, forceBackendRefresh),
          fetchAccountProfile(session.token).catch(() => null),
          fetchRankingPreferences(session.token).catch(() => null),
        ]);

        if (rankingPrefsRes) {
          setRankingPrefs(rankingPrefsRes);
        }

        setBoletim(boletimRes.data);
        setBoletimEtag(boletimRes.etag);
        setLastStatus(boletimRes.lastStatus);
        setCachedAt(boletimRes.cachedAt);
        setNextPollHintSecs(boletimRes.nextPollHintSecs);
        const pollDelayMs = Math.max(1000, boletimRes.nextPollHintSecs * 1000);
        remainingPollMsRef.current = pollDelayMs;
        setNextPollAt(Date.now() + pollDelayMs);

        // Detect newly posted grades since the student's last seen boletim snapshot
        // and surface the exact same summary/detail popup ("enquanto você estava fora").
        const detectedWhileAway = detectNewGradesAndUpdateSeen(session.account_id, boletimRes.data);
        if (detectedWhileAway.length > 0) {
          window.NsacAndroidPush?.clearAccumulatedGradeNotifications?.();
          const detectedClass = profileRes?.class_code ?? session.class_code ?? undefined;
          setGradeNotifDetail((prev) => {
            if (prev) {
              const merged = mergeGradeHighlights(prev.highlights ?? [], detectedWhileAway);
              return { ...prev, highlights: merged };
            }
            const first = detectedWhileAway[0]!;
            return {
              kind: 'grade_update',
              source: 'while_away',
              title:
                detectedWhileAway.length >= 2
                  ? 'Algumas notas novas saíram enquanto você estava fora'
                  : 'Uma nota nova saiu enquanto você estava fora',
              body: '',
              classCode: detectedClass,
              subjects: detectedWhileAway.map((h) => h.subject),
              bimesters: Array.from(new Set(detectedWhileAway.map((h) => h.bimester))),
              primarySubject: first.subject,
              primaryBimester: first.bimester,
              primaryYear: first.year,
              primaryGrade: first.personal_grade,
              primaryClassAvg: first.class_average,
              highlights: detectedWhileAway,
            };
          });
        }

        if (profileRes) {
          setAccountProfile(profileRes);
          if (profileRes.class_code) {
            applyCourseClassCode(profileRes.class_code);
          }
        }
      } catch (err) {
        if (err instanceof NsacApiClientError && err.status === 401) {
          await handleLogout();
        } else {
          const fallbackDelayMs = Math.max(1000, nextPollHintSecsRef.current * 1000);
          remainingPollMsRef.current = fallbackDelayMs;
          setNextPollAt(Date.now() + fallbackDelayMs);
        }
      } finally {
        setIsRefreshing(false);
        syncInFlightRef.current = false;
      }
    },
    [session, applyCourseClassCode, handleLogout]
  );

  // Route taps on grade, announcement and classroom-chat push notifications to the right screen/modal.
  useEffect(() => {
    if (!session) return;
    const handleAppPushOpen = (detail: AppPushEventDetail) => {
      if (detail.kind === 'grade_update') {
        if (detail.highlights?.length) {
          markHighlightsAsSeen(session.account_id, detail.highlights);
        }
        setGradeNotifDetail(detail);
        void synchronizeAllData(false);
      } else if (detail.kind === 'class_announcement') {
        selectTab('turma');
        setTurmaRefreshSignal((n) => n + 1);
        if (detail.announcementId) {
          setHighlightAnnouncementId(detail.announcementId);
        }
      } else if (detail.kind === 'room_chat' || detail.kind === 'room_offtopic') {
        selectTab('turma');
        setPendingRoomChannel(detail.channelKind ?? (detail.kind === 'room_offtopic' ? 'off_topic' : 'chat'));
      }
    };
    const onAppPush = (ev: Event) => {
      const detail = (ev as CustomEvent<AppPushEventDetail>).detail;
      if (!detail) return;
      if (detail.kind === 'grade_update') {
        void synchronizeAllData(false);
      } else if (detail.kind === 'class_announcement' || detail.kind === 'room_chat' || detail.kind === 'room_offtopic') {
        setTurmaRefreshSignal((n) => n + 1);
      }
    };
    const onAppPushOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<AppPushEventDetail>).detail;
      if (detail) handleAppPushOpen(detail);
    };
    window.addEventListener('n2sac:app-push', onAppPush);
    window.addEventListener('n2sac:app-push-open', onAppPushOpen);

    // Drain any cold-start notification tap captured before this effect registered.
    const pending = consumePendingAppPushOpen();
    if (pending) {
      handleAppPushOpen(pending);
    } else {
      // User opened the app directly: if unread grade notifications accumulated while away,
      // show them immediately in the exact same "enquanto você estava fora" popup!
      const unreadWhileAway = consumeNativeAccumulatedGrades();
      if (unreadWhileAway) {
        handleAppPushOpen(unreadWhileAway);
      }
    }

    return () => {
      window.removeEventListener('n2sac:app-push', onAppPush);
      window.removeEventListener('n2sac:app-push-open', onAppPushOpen);
    };
  }, [session, selectTab, synchronizeAllData]);

  // Initial Stale-While-Revalidate check on login or startup
  useEffect(() => {
    if (!session) return;
    // Hydrate from local cache in 0ms first
    const cachedBoletim = loadCachedResource<AllYearsResponse>('boletim', session.account_id);
    if (cachedBoletim) {
      seedSeenGradesIfMissing(session.account_id, cachedBoletim.data);
      setBoletim(cachedBoletim.data);
      setBoletimEtag(cachedBoletim.etag);
      setLastStatus(cachedBoletim.lastStatus);
      setCachedAt(cachedBoletim.cachedAt);
      setNextPollHintSecs(cachedBoletim.nextPollHintSecs);
      const pollDelayMs = Math.max(1000, cachedBoletim.nextPollHintSecs * 1000);
      remainingPollMsRef.current = pollDelayMs;
      setNextPollAt(Date.now() + pollDelayMs);
    }
    if (session.class_code) {
      applyCourseClassCode(session.class_code);
    }
    synchronizeAllData(false);
  }, [session, synchronizeAllData, applyCourseClassCode]);

  // Smart Sentinel single-shot scheduler (zero 1s App re-renders; pauses when tab is backgrounded)
  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = isPageVisible;

    if (!session) return;

    if (!isPageVisible) {
      if (nextPollAt !== null) {
        remainingPollMsRef.current = Math.max(1000, nextPollAt - Date.now());
      }
      return;
    }

    if (!wasVisible) {
      // Returning from background: surface any unread accumulated grades immediately
      // and check ETag/304 for newly posted grades while the user was away.
      const unreadWhileAway = consumeNativeAccumulatedGrades();
      if (unreadWhileAway) {
        if (unreadWhileAway.highlights?.length) {
          markHighlightsAsSeen(session.account_id, unreadWhileAway.highlights);
        }
        setGradeNotifDetail((prev) =>
          prev
            ? { ...prev, highlights: mergeGradeHighlights(prev.highlights ?? [], unreadWhileAway.highlights ?? []) }
            : unreadWhileAway
        );
      }
      void synchronizeAllData(false);
      const resumedTarget = Date.now() + Math.max(1000, remainingPollMsRef.current);
      setNextPollAt(resumedTarget);
      return;
    }

    if (nextPollAt === null) return;
    const delayMs = Math.max(1000, nextPollAt - Date.now());
    const timer = window.setTimeout(() => {
      const nextMs = Math.max(1000, nextPollHintSecs * 1000);
      remainingPollMsRef.current = nextMs;
      setNextPollAt(Date.now() + nextMs);
      void synchronizeAllData(false);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [session, isPageVisible, nextPollAt, nextPollHintSecs, synchronizeAllData]);

  const refreshActiveTabData = useCallback(
    async (forceBackendRefresh = false) => {
      if (!session) return;

      // 1. Turma tab: reload class announcements, chat previews & representatives
      if (activeTab === 'turma') {
        setTurmaRefreshSignal((n) => n + 1);
        return;
      }

      // 2. Ranking tab: reload the leaderboard, active peer comparison (if open), and ranking preferences
      if (activeTab === 'ranking') {
        setRankingRefreshSignal((n) => n + 1);
        setIsRefreshing(true);
        try {
          const prefs = await fetchRankingPreferences(session.token).catch(() => null);
          if (prefs) setRankingPrefs(prefs);
        } finally {
          setIsRefreshing(false);
        }
        return;
      }

      // 2. Fichas & Frequência tab: reload Fichas, Atrasos, Saídas, and Portal NSAC (HomeInfo)
      if (activeTab === 'frequencia') {
        if (syncInFlightRef.current) return;
        syncInFlightRef.current = true;
        setIsRefreshing(true);
        try {
          await Promise.allSettled([
            fetchFichaList(session.token, session.account_id, forceBackendRefresh).then((r) =>
              setFichas(r.data)
            ),
            fetchAtrasos(session.token, session.account_id, forceBackendRefresh).then((r) =>
              setAtrasos(r.data)
            ),
            fetchSaidas(session.token, session.account_id, forceBackendRefresh).then((r) =>
              setSaidas(r.data)
            ),
            fetchHomeInfo(session.token, session.account_id, forceBackendRefresh).then((r) =>
              setHomeInfo(r.data)
            ),
          ]);
        } finally {
          setIsRefreshing(false);
          syncInFlightRef.current = false;
        }
        return;
      }

      // 3. Perfil tab: reload user profile, social hub (friends/requests/search), privacy prefs, and account info
      if (activeTab === 'profile') {
        setProfileRefreshSignal((n) => n + 1);
        window.dispatchEvent(new CustomEvent('n2sac:social-refresh'));
        setIsRefreshing(true);
        try {
          const [profileRes, prefsRes] = await Promise.all([
            fetchAccountProfile(session.token).catch(() => null),
            fetchRankingPreferences(session.token).catch(() => null),
          ]);
          if (profileRes) {
            setAccountProfile(profileRes);
            if (profileRes.class_code) {
              applyCourseClassCode(profileRes.class_code);
            }
          }
          if (prefsRes) {
            setRankingPrefs(prefsRes);
          }
        } finally {
          setIsRefreshing(false);
        }
        return;
      }

      // 4. Alertas & Conta (sentinela), Boletim, Configurações (settings), or any fallback tab:
      // reload grades/boletim + account status (same as default synchronizeAllData).
      await synchronizeAllData(forceBackendRefresh);
    },
    [session, activeTab, applyCourseClassCode, synchronizeAllData]
  );

  const frequenciaHydratedAccountRef = useRef<number | null>(null);

  // Lazy-load auxiliary NSAC routes (fichas, atrasos, saídas, home) ONLY when the user
  // actually navigates to the Frequência tab, from backend cache/ETag (refresh=false).
  useEffect(() => {
    if (!session || activeTab !== 'frequencia') return;
    if (frequenciaHydratedAccountRef.current === session.account_id) return;
    frequenciaHydratedAccountRef.current = session.account_id;
    void refreshActiveTabData(false);
  }, [session, activeTab, refreshActiveTabData]);

  const handleManualRefresh = useCallback(
    (forceBackendRefresh = false) => {
      if (forceBackendRefresh) {
        if (refreshCooldownUntil !== null) {
          // Inside 60s NSAC scrape cooldown: still refresh from server cache without hitting NSAC.
          void refreshActiveTabData(false);
          return;
        }
        setRefreshCooldownUntil(Date.now() + MANUAL_REFRESH_COOLDOWN_SECS * 1000);
        // Live NSAC sync scoped strictly to the active tab:
        // - Frequência tab: refreshes only fichas/atrasos/saidas/home
        // - Boletim tab (or Sentinela button): refreshes only boletim (updating Sentinel heuristic)
        if (!settingsOpen && !sentinelaOpen && activeTab === 'frequencia') {
          void refreshActiveTabData(true);
        } else {
          void synchronizeAllData(true);
        }
        return;
      }
      void refreshActiveTabData(false);
    },
    [refreshCooldownUntil, synchronizeAllData, refreshActiveTabData, settingsOpen, sentinelaOpen, activeTab]
  );

  if (!session) {
    return (
      <Suspense
        fallback={
          <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MorphingLoadingState label="Carregando..." />
          </div>
        }
      >
        <LoginScreen
          onLoginSuccess={(newSession) => {
            const entry = canRunScreenTransition() ? 'vt' : 'css';
            runScreenTransition('axis-z-forward', () => {
              setPageEntry(entry);
              setSession(newSession);
            });
          }}
          serverHealthy={serverHealthy}
        />
      </Suspense>
    );
  }

  const effectiveClassCode =
    accountProfile?.class_code ??
    session.class_code ??
    boletim?.data?.[boletim.data.length - 1]?.title ??
    null;

  return (
    <ProfileViewerProvider token={session.token}>
      <ExpressiveNavigationShell
        activeTab={settingsOpen ? 'settings' : sentinelaOpen ? 'sentinela' : activeTab}
        onSelectTab={selectTab}
        classCode={effectiveClassCode}
        nsacEmail={session.nsac_email}
        refreshCooldownUntil={refreshCooldownUntil}
        isRefreshing={isRefreshing || tabChildRefreshing}
        lastHttpStatus={lastStatus}
        onManualRefresh={() =>
          handleManualRefresh(
            !settingsOpen && !sentinelaOpen && (activeTab === 'boletim' || activeTab === 'frequencia')
          )
        }
        onLogout={handleLogout}
      >
        <div
          key={activeTab}
          ref={tabSurfaceRef}
          className={
            pageEntry === 'vt'
              ? 'nsac-page-vt'
              : pageEntry === 'css'
                ? 'm3-page-transition'
                : pageEntry === 'axis-x-forward'
                  ? 'm3-page-axis-x-forward'
                  : pageEntry === 'axis-x-backward'
                    ? 'm3-page-axis-x-backward'
                    : pageEntry === 'swipe-next'
                      ? 'm3-page-swipe-next'
                      : pageEntry === 'swipe-prev'
                        ? 'm3-page-swipe-prev'
                        : undefined
          }
        >
          <Suspense fallback={<MorphingLoadingState label="Carregando tela..." />}>
            {activeTab === 'boletim' && (
              <BoletimScreen boletim={boletim} loading={isRefreshing && !boletim} token={session.token} />
            )}
            {activeTab === 'turma' && (
              <TurmaScreen
                token={session.token}
                refreshSignal={turmaRefreshSignal}
                initialOpenChannel={pendingRoomChannel}
                onConsumedInitialChannel={() => setPendingRoomChannel(null)}
                highlightAnnouncementId={highlightAnnouncementId}
                onConsumedHighlightAnnouncement={() => setHighlightAnnouncementId(null)}
                onRefreshingChange={setTabChildRefreshing}
              />
            )}
            {activeTab === 'ranking' && (
              <RankingScreen
                token={session.token}
                accountId={session.account_id}
                classCode={effectiveClassCode}
                preferences={rankingPrefs}
                onPreferencesUpdated={setRankingPrefs}
                refreshSignal={rankingRefreshSignal}
                onRefreshingChange={setTabChildRefreshing}
              />
            )}
            {activeTab === 'frequencia' && (
              <FrequenciaScreen
                token={session.token}
                accountId={session.account_id}
                fichas={fichas}
                atrasos={atrasos}
                saidas={saidas}
                homeInfo={homeInfo}
              />
            )}
            {activeTab === 'sentinela' && (
              <SentinelaScreen
                token={session.token}
                accountProfile={accountProfile}
                onProfileUpdated={setAccountProfile}
                etag={boletimEtag}
                lastStatus={lastStatus}
                cachedAt={cachedAt}
                nextPollHintSecs={nextPollHintSecs}
                nextPollAt={nextPollAt}
                isPageVisible={isPageVisible}
                refreshCooldownUntil={refreshCooldownUntil}
                isRefreshing={isRefreshing}
                onManualRefresh={handleManualRefresh}
                onOpenSettings={() => selectTab('settings')}
              />
            )}
            {activeTab === 'profile' && (
              <ProfileScreen
                token={session.token}
                accountId={session.account_id}
                accountProfile={accountProfile}
                detectedClassCode={effectiveClassCode}
                onLogout={handleLogout}
                refreshSignal={profileRefreshSignal}
                onRefreshingChange={setTabChildRefreshing}
              />
            )}
          </Suspense>
        </div>
        {sentinelaOpen && (
          <PushedPage
            title="Alertas & Sentinela"
            showTitle={false}
            zIndex={60}
            onClose={() => setSentinelaOpen(false)}
            closeRef={sentinelaCloseRef}
          >
            <Suspense fallback={<MorphingLoadingState label="Carregando alertas..." />}>
              <SentinelaScreen
                token={session.token}
                accountProfile={accountProfile}
                onProfileUpdated={setAccountProfile}
                etag={boletimEtag}
                lastStatus={lastStatus}
                cachedAt={cachedAt}
                nextPollHintSecs={nextPollHintSecs}
                nextPollAt={nextPollAt}
                isPageVisible={isPageVisible}
                refreshCooldownUntil={refreshCooldownUntil}
                isRefreshing={isRefreshing}
                onManualRefresh={handleManualRefresh}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </Suspense>
          </PushedPage>
        )}
        {settingsOpen && (
          <PushedPage
            title="Configurações"
            showTitle={false}
            zIndex={70}
            onClose={() => setSettingsOpen(false)}
            closeRef={settingsCloseRef}
          >
            <Suspense fallback={<MorphingLoadingState label="Carregando configurações..." />}>
              <AdaptiveStudioScreen detectedClassCode={effectiveClassCode} />
              <NotificationSettingsSection
                token={session.token}
                accountProfile={accountProfile}
                onProfileUpdated={setAccountProfile}
              />
              <FeedbackSettingsSection
                token={session.token}
                accountProfile={accountProfile}
                detectedClassCode={effectiveClassCode}
              />
            </Suspense>
          </PushedPage>
        )}
        {gradeNotifDetail && (
          <GradeNotificationModal
            detail={gradeNotifDetail}
            boletim={boletim}
            refreshing={isRefreshing}
            onOpenBoletim={() => selectTab('boletim')}
            onClose={handleCloseGradeNotification}
          />
        )}
        <ShareAppPromptModal
          open={sharePromptOpen}
          onClose={() => setSharePromptOpen(false)}
        />
        <RankingConsentModal
          open={Boolean(rankingPrefs && !rankingPrefs.has_decided)}
          saving={savingRankingConsent}
          onDecide={async (optedIn, hideName) => {
            setSavingRankingConsent(true);
            try {
              const updated = await updateRankingPreferences(session.token, {
                opted_in: optedIn,
                hide_name: hideName,
              });
              setRankingPrefs(updated);
            } finally {
              setSavingRankingConsent(false);
            }
          }}
        />
      </ExpressiveNavigationShell>
    </ProfileViewerProvider>
  );
};

export default App;
