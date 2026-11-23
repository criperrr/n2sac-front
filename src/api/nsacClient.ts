import type {
  AccountProfileResponse,
  AllYearsResponse,
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  AtrasoRecord,
  BoletimApiQueryParams,
  CachedResource,
  ComparisonSummaryResponse,
  ChatMessage,
  ConversationMessagesPayload,
  FichaAvaliacaoEntry,
  FollowMutationResult,
  HomeInfo,
  LoginResponse,
  PublicProfile,
  RelationshipStatus,
  SendMessagePayload,
  SocialOverview,
  StudentSearchResult,
  RankingPreferences,
  SaidaRecord,
} from './types';

const SESSION_STORAGE_KEY = 'nsac_expressive_session_v2';
const CACHE_PREFIX = 'nsac_expressive_cache_v2:';

export class NsacApiClientError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'NsacApiClientError';
    this.code = code;
    this.status = status;
  }
}

const REFRESH_LIMIT_KEY = 'n2sac_boletim_refresh_ts_v1';
const REFRESH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const REFRESH_MAX_COUNT = 10; // 10 requests per 5-minute sliding window

/**
 * Frontend sliding-window rate limiter: max 10 manual refreshes per 5 minutes.
 * Throws NsacApiClientError(429) if exceeded, mirroring the backend limiter.
 */
export function consumeManualRefreshQuota(): { remaining: number } {
  const now = Date.now();
  let timestamps: number[] = [];
  try {
    const raw = localStorage.getItem(REFRESH_LIMIT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        timestamps = parsed.filter((t): t is number => typeof t === 'number' && now - t < REFRESH_WINDOW_MS);
      }
    }
  } catch {
    timestamps = [];
  }

  if (timestamps.length >= REFRESH_MAX_COUNT) {
    const oldest = timestamps[0] ?? now;
    const retrySecs = Math.max(1, Math.ceil((REFRESH_WINDOW_MS - (now - oldest)) / 1000));
    throw new NsacApiClientError(
      'RATE_LIMITED',
      `Limite de 10 atualizações a cada 5 minutos atingido. Aguarde ${retrySecs}s.`,
      429
    );
  }

  timestamps.push(now);
  try {
    localStorage.setItem(REFRESH_LIMIT_KEY, JSON.stringify(timestamps));
  } catch {
    // ignore storage quota errors
  }

  return { remaining: Math.max(0, REFRESH_MAX_COUNT - timestamps.length) };
}

export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  // When running inside Capacitor Android/iOS WebView (origin is http://localhost with no Vite proxy),
  // default to our permanent public HTTPS Tailscale Funnel endpoint.
  if (
    typeof window !== 'undefined' &&
    (window.location.origin === 'http://localhost' ||
      window.location.origin === 'https://localhost' ||
      window.location.protocol === 'capacitor:')
  ) {
    return 'https://notebook-server.tailddd6bf.ts.net';
  }
  return '';
}

export function loadStoredSession(): LoginResponse | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LoginResponse;
    if (!parsed.token || !parsed.nsac_email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredSession(session: LoginResponse | null): void {
  try {
    if (!session) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } else {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // ignore storage errors
  }
}

export function loadCachedResource<T>(routeKey: string, accountId: number): CachedResource<T> | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${accountId}:${routeKey}`);
    if (!raw) return null;
    return JSON.parse(raw) as CachedResource<T>;
  } catch {
    return null;
  }
}

export function saveCachedResource<T>(
  routeKey: string,
  accountId: number,
  resource: CachedResource<T>
): void {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${accountId}:${routeKey}`, JSON.stringify(resource));
  } catch {
    // ignore quota errors
  }
}

export function clearAccountCache(accountId: number): void {
  try {
    const prefix = `${CACHE_PREFIX}${accountId}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

async function parseErrorResponse(res: Response): Promise<NsacApiClientError> {
  try {
    const body = (await res.json()) as ApiErrorEnvelope;
    const first = body.errors?.[0];
    if (first) {
      return new NsacApiClientError(first.code, first.message, res.status);
    }
  } catch {
    // Fallback if non-JSON error
  }
  return new NsacApiClientError(
    `HTTP_${res.status}`,
    res.status === 502 || res.status === 504
      ? 'O servidor do NSAC ou a API local está temporariamente indisponível.'
      : `Erro de comunicação HTTP (${res.status}).`,
    res.status
  );
}

/**
 * Zero-Trust Login (`POST /api/v1/auth/login`)
 * Sends ONLY institutional email and password. Class code, school years, and subjects
 * are derived 100% by the Rust backend directly from the authenticated NSAC session.
 */
export async function loginNsacZeroTrust(
  nsacEmail: string,
  nsacPassword: string
): Promise<LoginResponse> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nsac_email: nsacEmail.trim(),
      nsac_password: nsacPassword,
    }),
  });

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }

  const envelope = (await res.json()) as ApiSuccessEnvelope<LoginResponse>;
  saveStoredSession(envelope.data);
  return envelope.data;
}

export async function logoutNsacSession(token: string): Promise<void> {
  const base = getApiBaseUrl();
  try {
    await fetch(`${base}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } finally {
    saveStoredSession(null);
  }
}

/**
 * ETag-aware + Anti-Spam `next_poll_hint_secs` fetcher for all `/api/v1/nsac/*` routes.
 * Sends `If-None-Match` when a cached ETag exists and seamlessly handles `304 Not Modified`
 * with zero JSON re-parsing overhead.
 */
export async function fetchWithEtagCache<T>(options: {
  path: string;
  routeKey: string;
  token: string;
  accountId: number;
  forceRefresh?: boolean;
}): Promise<CachedResource<T>> {
  const base = getApiBaseUrl();
  const existing = loadCachedResource<T>(options.routeKey, options.accountId);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.token}`,
  };

  if (!options.forceRefresh && existing?.etag) {
    headers['If-None-Match'] = existing.etag;
  }

  const url = options.forceRefresh
    ? `${base}${options.path}${options.path.includes('?') ? '&' : '?'}refresh=true`
    : `${base}${options.path}`;

  const res = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (res.status === 304 && existing) {
    const updated: CachedResource<T> = {
      ...existing,
      etag: res.headers.get('etag') ?? existing.etag,
      cachedAt: Date.now(),
      lastStatus: 304,
    };
    saveCachedResource(options.routeKey, options.accountId, updated);
    return updated;
  }

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }

  const etag = res.headers.get('etag');
  const envelope = (await res.json()) as ApiSuccessEnvelope<T>;
  const resource: CachedResource<T> = {
    data: envelope.data,
    etag: etag ?? existing?.etag ?? null,
    cachedAt: Date.now(),
    nextPollHintSecs: envelope.next_poll_hint_secs ?? existing?.nextPollHintSecs ?? 300,
    lastStatus: 200,
  };
  saveCachedResource(options.routeKey, options.accountId, resource);
  return resource;
}

export function buildBoletimFilterQueryString(params: BoletimApiQueryParams): string {
  const sp = new URLSearchParams();
  if (params.schoolYear !== undefined) sp.set('schoolYear[eq]', String(params.schoolYear));
  if (params.targetBimester !== undefined) sp.set('targetBimester[eq]', String(params.targetBimester));
  if (params.subjectNameContains && params.subjectNameContains.trim()) {
    sp.set('subjectName[contains]', params.subjectNameContains.trim());
  }
  if (params.gradeGte !== undefined) sp.set('grade[gte]', String(params.gradeGte));
  if (params.gradeLt !== undefined) sp.set('grade[lt]', String(params.gradeLt));
  if (params.classAverageGte !== undefined) sp.set('classAverage[gte]', String(params.classAverageGte));
  if (params.classAverageLt !== undefined) sp.set('classAverage[lt]', String(params.classAverageLt));
  if (params.deltaGte !== undefined) sp.set('delta[gte]', String(params.deltaGte));
  if (params.deltaLt !== undefined) sp.set('delta[lt]', String(params.deltaLt));
  if (params.absencesGte !== undefined) sp.set('absences[gte]', String(params.absencesGte));
  if (params.absencesLte !== undefined) sp.set('absences[lte]', String(params.absencesLte));
  if (params.totalAbsencesGte !== undefined) {
    sp.set('totalAbsences[gte]', String(params.totalAbsencesGte));
  }
  if (params.totalAbsencesLte !== undefined) {
    sp.set('totalAbsences[lte]', String(params.totalAbsencesLte));
  }
  if (params.isRecovery !== undefined) sp.set('isRecovery[eq]', String(params.isRecovery));
  if (params.recoveryCode && params.recoveryCode.trim()) {
    sp.set('recoveryCode[eq]', params.recoveryCode.trim());
  }
  if (params.postedOnly !== undefined) sp.set('postedOnly[eq]', String(params.postedOnly));
  return sp.toString();
}

export async function fetchBoletim(
  token: string,
  accountId: number,
  forceRefresh = false,
  filterParams?: BoletimApiQueryParams
): Promise<CachedResource<AllYearsResponse>> {
  if (forceRefresh) {
    consumeManualRefreshQuota();
  }
  const qs = filterParams ? buildBoletimFilterQueryString(filterParams) : '';
  const refreshParam = forceRefresh ? (qs ? '&refresh=true' : 'refresh=true') : '';
  const fullQs = `${qs}${refreshParam}`;
  const path = fullQs ? `/api/v1/nsac/boletim?${fullQs}` : '/api/v1/nsac/boletim';
  const routeKey = qs ? `boletim:${qs}` : 'boletim';
  return fetchWithEtagCache<AllYearsResponse>({
    path,
    routeKey,
    token,
    accountId,
    forceRefresh,
  });
}

export async function fetchHomeInfo(
  token: string,
  accountId: number,
  forceRefresh = false
): Promise<CachedResource<HomeInfo>> {
  return fetchWithEtagCache<HomeInfo>({
    path: '/api/v1/nsac/home',
    routeKey: 'home',
    token,
    accountId,
    forceRefresh,
  });
}

export async function fetchAtrasos(
  token: string,
  accountId: number,
  forceRefresh = false
): Promise<CachedResource<AtrasoRecord[]>> {
  return fetchWithEtagCache<AtrasoRecord[]>({
    path: '/api/v1/nsac/atrasos',
    routeKey: 'atrasos',
    token,
    accountId,
    forceRefresh,
  });
}

export async function fetchSaidas(
  token: string,
  accountId: number,
  forceRefresh = false
): Promise<CachedResource<SaidaRecord[]>> {
  return fetchWithEtagCache<SaidaRecord[]>({
    path: '/api/v1/nsac/saidas',
    routeKey: 'saidas',
    token,
    accountId,
    forceRefresh,
  });
}

export async function fetchFichaList(
  token: string,
  accountId: number,
  forceRefresh = false
): Promise<CachedResource<FichaAvaliacaoEntry[]>> {
  return fetchWithEtagCache<FichaAvaliacaoEntry[]>({
    path: '/api/v1/nsac/ficha-avaliacao',
    routeKey: 'ficha_list',
    token,
    accountId,
    forceRefresh,
  });
}

export async function fetchAccountProfile(token: string): Promise<AccountProfileResponse> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/account`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<AccountProfileResponse>;
  return env.data;
}

export async function updateAccountFcmToken(
  token: string,
  fcmToken: string
): Promise<AccountProfileResponse> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/account/fcm-token`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fcm_token: fcmToken.trim() }),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<AccountProfileResponse>;
  return env.data;
}

export async function deleteAccountFcmToken(
  token: string
): Promise<{ cleared: boolean; profile?: AccountProfileResponse }> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/account/fcm-token`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (res.ok) {
    const env = (await res.json()) as ApiSuccessEnvelope<AccountProfileResponse>;
    return { cleared: true, profile: env.data };
  }
  // If server only exposes PUT /account/fcm-token, clear local device registration gracefully
  return { cleared: true };
}

export interface UserProfileData {
  account_id: number;
  first_name: string;
  display_name: string | null;
  bio: string | null;
  avatar_data_url: string | null;
  banner_data_url: string | null;
  /** Active community-moderation restrictions (absent on older servers). */
  restrictions?: ModerationRestriction[];
}

export type ReportKind = 'media' | 'text';

export interface ModerationRestriction {
  kind: ReportKind;
  /** ISO date; null when permanent. */
  until: string | null;
  permanent: boolean;
}

/** Anonymous report of someone's profile photo/banner (`media`) or name/bio (`text`). */
export async function reportProfile(
  token: string,
  accountId: number,
  kind: ReportKind
): Promise<'received' | 'already_reported' | 'actioned'> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/profiles/${accountId}/report`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind }),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<{ outcome: 'received' | 'already_reported' | 'actioned' }>;
  return env.data.outcome;
}

const USER_PROFILE_CACHE_PREFIX = 'nsac_user_profile_v1_';
const userProfileMemCache = new Map<number, UserProfileData>();

export function loadCachedUserProfile(accountId: number | null | undefined): UserProfileData | null {
  if (!accountId) return null;
  const mem = userProfileMemCache.get(accountId);
  if (mem) return mem;
  try {
    const raw = window.localStorage.getItem(`${USER_PROFILE_CACHE_PREFIX}${accountId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfileData;
    if (parsed && typeof parsed.account_id === 'number') {
      userProfileMemCache.set(accountId, parsed);
      return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function saveCachedUserProfile(data: UserProfileData): void {
  userProfileMemCache.set(data.account_id, data);
  try {
    window.localStorage.setItem(`${USER_PROFILE_CACHE_PREFIX}${data.account_id}`, JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

export async function fetchUserProfile(token: string): Promise<UserProfileData> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/account/profile`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { success?: boolean; data?: UserProfileData; error?: { code?: string; message?: string } };
  if (!res.ok || !body?.success || !body.data) {
    throw new NsacApiClientError(
      body?.error?.code ?? 'PROFILE_ERROR',
      body?.error?.message ?? 'Não foi possível carregar o perfil.',
      res.status
    );
  }
  saveCachedUserProfile(body.data);
  return body.data;
}

export async function updateUserProfile(
  token: string,
  payload: {
    display_name?: string | null;
    bio?: string | null;
    avatar_data_url?: string | null;
    banner_data_url?: string | null;
  }
): Promise<UserProfileData> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/account/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  // Server rejections (moderation restriction, invalid image) carry a user-facing message.
  if (!res.ok) throw await parseErrorResponse(res);
  const body = (await res.json()) as { success?: boolean; data?: UserProfileData };
  if (!body?.success || !body.data) {
    throw new NsacApiClientError('PROFILE_ERROR', 'Não foi possível salvar o perfil.', res.status);
  }
  saveCachedUserProfile(body.data);
  return body.data;
}

export async function updateAccountDiscordLink(
  token: string,
  discordId: string
): Promise<AccountProfileResponse> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/account/discord-link`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ discord_id: discordId.trim() }),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<AccountProfileResponse>;
  return env.data;
}

export async function checkServerHealth(): Promise<boolean> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/api/v1/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchRankingPreferences(token: string): Promise<RankingPreferences> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/account/ranking-preferences`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<RankingPreferences>;
  return env.data;
}

export async function updateRankingPreferences(
  token: string,
  payload: {
    opted_in: boolean;
    hide_name: boolean;
    display_name?: string | null;
    show_avatar?: boolean;
    public_profile?: boolean;
  }
): Promise<RankingPreferences> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/account/ranking-preferences`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<RankingPreferences>;
  return env.data;
}

export async function fetchCompareLeaderboard(
  token: string,
  params: {
    scope?: 'class' | 'course' | 'school';
    year?: number;
    bimester?: number | null;
    subject?: string;
    peerId?: number | null;
  } = {},
  signal?: AbortSignal
): Promise<ComparisonSummaryResponse> {
  const base = getApiBaseUrl();
  const sp = new URLSearchParams();
  if (params.scope) sp.set('scope', params.scope);
  if (params.year) sp.set('year', String(params.year));
  if (params.bimester) sp.set('bimester', String(params.bimester));
  if (params.subject && params.subject.trim()) sp.set('subject', params.subject.trim());
  if (params.peerId) sp.set('peer_id', String(params.peerId));
  const qs = sp.toString();
  const res = await fetch(`${base}/api/v1/compare${qs ? `?${qs}` : ''}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<ComparisonSummaryResponse>;
  return env.data;
}

/** A classmate's public profile (404 → not available: private, anonymous or not in the ranking). */
export async function fetchPublicProfile(token: string, accountId: number): Promise<PublicProfile> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/profiles/${accountId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<PublicProfile>;
  return env.data;
}

/**
 * Profile images need the bearer token, so `<img src>` can't load them directly: they are fetched
 * once, kept as object URLs for the session (the URL is versioned, so it never goes stale) and
 * shared by every avatar showing the same person.
 */
const imageCache = new Map<string, Promise<string | null>>();

export function loadProfileImage(token: string, path: string): Promise<string | null> {
  const cached = imageCache.get(path);
  if (cached) return cached;
  const base = getApiBaseUrl();
  const pending = fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } })
    .then(async (res) => (res.ok ? URL.createObjectURL(await res.blob()) : null))
    .catch(() => null)
    .then((url) => {
      if (!url) imageCache.delete(path); // retry on the next mount
      return url;
    });
  imageCache.set(path, pending);
  return pending;
}

/** Students findable by name (word prefixes, accent-insensitive) or by their exact e-mail. */
export async function searchStudents(
  token: string,
  query: string,
  signal?: AbortSignal
): Promise<StudentSearchResult[]> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/students/search?q=${encodeURIComponent(query)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<StudentSearchResult[]>;
  return env.data;
}

/** Account-wide exposure: "be found in search" and invisible mode. */
export async function updatePrivacy(
  token: string,
  payload: { discoverable?: boolean; invisible?: boolean }
): Promise<RankingPreferences> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/account/privacy`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<RankingPreferences>;
  return env.data;
}

/**
 * Asks the server for a short-lived link to the ficha PDF exactly as the NSAC serves it
 * (fetched with the student's session; the link needs no token, so a browser can open it).
 * 404 → the NSAC hasn't released that bimester yet.
 */
export async function requestFichaPdfLink(token: string, bimesterId: number): Promise<string> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/nsac/ficha-avaliacao/${bimesterId}/pdf-link`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<{ url: string; expires_in_secs: number }>;
  return new URL(`${base}${env.data.url}`, window.location.origin).toString();
}

export async function fetchSocialOverview(token: string): Promise<SocialOverview> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/social/overview`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<SocialOverview>;
  return env.data;
}

export async function followStudent(token: string, accountId: number): Promise<FollowMutationResult> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/social/follows/${accountId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<FollowMutationResult>;
  return env.data;
}

export async function unfollowStudent(token: string, accountId: number): Promise<RelationshipStatus> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/social/follows/${accountId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<RelationshipStatus>;
  return env.data;
}

export async function acceptFollowRequest(token: string, requesterId: number): Promise<FollowMutationResult> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/social/requests/${requesterId}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<FollowMutationResult>;
  return env.data;
}

export async function declineFollowRequest(token: string, requesterId: number): Promise<RelationshipStatus> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/social/requests/${requesterId}/decline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<RelationshipStatus>;
  return env.data;
}

export async function blockStudent(token: string, accountId: number): Promise<RelationshipStatus> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/social/blocks/${accountId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<RelationshipStatus>;
  return env.data;
}

export async function unblockStudent(token: string, accountId: number): Promise<RelationshipStatus> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/social/blocks/${accountId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<RelationshipStatus>;
  return env.data;
}

export async function fetchConversationMessages(
  token: string,
  peerId: number,
  options?: { afterId?: number; beforeId?: number; afterRev?: number; limit?: number; signal?: AbortSignal }
): Promise<ConversationMessagesPayload> {
  const base = getApiBaseUrl();
  const params = new URLSearchParams();
  if (options?.afterId) params.set('after_id', String(options.afterId));
  if (options?.beforeId) params.set('before_id', String(options.beforeId));
  if (options?.afterRev !== undefined) params.set('after_rev', String(options.afterRev));
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  const res = await fetch(`${base}/api/v1/social/conversations/${peerId}/messages${qs ? `?${qs}` : ''}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal: options?.signal,
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<ConversationMessagesPayload>;
  return env.data;
}

export async function sendConversationMessage(
  token: string,
  peerId: number,
  text: string,
  replyToId?: number | null
): Promise<SendMessagePayload> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/social/conversations/${peerId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(replyToId ? { text, reply_to_id: replyToId } : { text }),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<SendMessagePayload>;
  return env.data;
}

export async function deleteConversation(token: string, peerId: number): Promise<void> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/social/conversations/${peerId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
}

async function chatMessageMutation(
  token: string,
  path: string,
  method: 'PATCH' | 'DELETE' | 'PUT',
  body?: unknown
): Promise<ChatMessage> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/social/conversations/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<ChatMessage>;
  return env.data;
}

/** Edits one of your messages (up to 15 min after sending). */
export function editConversationMessage(token: string, peerId: number, messageId: number, text: string) {
  return chatMessageMutation(token, `${peerId}/messages/${messageId}`, 'PATCH', { text });
}

/** Unsends one of your messages for both people. */
export function unsendConversationMessage(token: string, peerId: number, messageId: number) {
  return chatMessageMutation(token, `${peerId}/messages/${messageId}`, 'DELETE');
}

/** Sets your reaction on a message; `null` removes it. */
export function setMessageReaction(token: string, peerId: number, messageId: number, emoji: string | null) {
  return chatMessageMutation(token, `${peerId}/messages/${messageId}/reaction`, 'PUT', { emoji });
}

/** "Digitando…" ping; the server forgets it after a few seconds. Failures are ignored. */
export async function sendTypingPing(token: string, peerId: number): Promise<void> {
  const base = getApiBaseUrl();
  try {
    await fetch(`${base}/api/v1/social/conversations/${peerId}/typing`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Typing is best effort.
  }
}

export async function submitFeedback(
  token: string,
  payload: import('./types').CreateFeedbackPayload
): Promise<import('./types').CreatedFeedbackResponse> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<
    import('./types').CreatedFeedbackResponse
  >;
  return env.data;
}

export async function fetchMyFeedback(
  token: string
): Promise<import('./types').FeedbackMineItem[]> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/feedback/mine`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<
    import('./types').FeedbackMineItem[]
  >;
  return env.data;
}

// ---------------------------------------------------------------------------
// Notification Preferences & Class Rooms (Announcements, Chat, Off-Topic, Election)
// ---------------------------------------------------------------------------

export async function fetchNotificationPreferences(
  token: string
): Promise<import('./types').NotificationPreferences> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/account/notification-preferences`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<import('./types').NotificationPreferences>;
  return env.data;
}

export async function updateNotificationPreferences(
  token: string,
  patch: Partial<{
    grades_enabled: boolean;
    announcements_enabled: boolean;
    social_enabled: boolean;
    room_chat_mode: import('./types').RoomChatNotificationMode;
    room_offtopic_mode: import('./types').RoomChatNotificationMode;
  }>
): Promise<import('./types').NotificationPreferences> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/account/notification-preferences`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<import('./types').NotificationPreferences>;
  return env.data;
}

export async function fetchMyClassroomOverview(
  token: string
): Promise<import('./types').ClassroomOverviewPayload> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/classrooms/me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<import('./types').ClassroomOverviewPayload>;
  return env.data;
}

export async function fetchRoomElection(
  token: string
): Promise<import('./types').ElectionStatePayload> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/classrooms/me/election`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<import('./types').ElectionStatePayload>;
  return env.data;
}

export async function castRepresentativeVote(
  token: string,
  candidateId: number
): Promise<import('./types').ElectionStatePayload> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/classrooms/me/representatives/votes/${candidateId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<import('./types').ElectionStatePayload>;
  return env.data;
}

export async function revokeRepresentativeVote(
  token: string,
  candidateId: number
): Promise<import('./types').ElectionStatePayload> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/classrooms/me/representatives/votes/${candidateId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<import('./types').ElectionStatePayload>;
  return env.data;
}

export async function updateClassroomAppearance(
  token: string,
  payload: {
    avatar_data_url?: string;
    banner_data_url?: string;
    clear_avatar?: boolean;
    clear_banner?: boolean;
  }
): Promise<import('./types').ClassroomInfo> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/classrooms/me/appearance`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<import('./types').ClassroomInfo>;
  return env.data;
}

export async function createClassroomAnnouncement(
  token: string,
  payload: {
    category?: import('./types').AnnouncementCategory;
    title: string;
    body: string;
    event_date?: string | null;
    pinned?: boolean;
    notify_push?: boolean;
    image_data_url?: string | null;
  }
): Promise<import('./types').AnnouncementItem> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/classrooms/me/announcements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<import('./types').AnnouncementItem>;
  return env.data;
}

export async function updateClassroomAnnouncement(
  token: string,
  id: number,
  payload: { title?: string; body?: string; pinned?: boolean }
): Promise<import('./types').AnnouncementItem> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/classrooms/me/announcements/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<import('./types').AnnouncementItem>;
  return env.data;
}

export async function deleteClassroomAnnouncement(token: string, id: number): Promise<void> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/classrooms/me/announcements/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
}

export async function markAnnouncementRead(token: string, id: number): Promise<number> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/classrooms/me/announcements/${id}/read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<{ read_count: number }>;
  return env.data.read_count;
}

export async function setAnnouncementReaction(
  token: string,
  id: number,
  emoji: string | null
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/classrooms/me/announcements/${id}/reaction`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ emoji }),
  });
  if (!res.ok) throw await parseErrorResponse(res);
}

export async function fetchClassroomChannelMessages(
  token: string,
  kind: import('./types').ClassroomChannelKind,
  opts: { afterRev?: number; beforeId?: number; limit?: number } = {}
): Promise<import('./types').ClassroomMessagesPayload> {
  const base = getApiBaseUrl();
  const qs = new URLSearchParams();
  if (typeof opts.afterRev === 'number') qs.set('after_rev', String(opts.afterRev));
  if (typeof opts.beforeId === 'number') qs.set('before_id', String(opts.beforeId));
  if (typeof opts.limit === 'number') qs.set('limit', String(opts.limit));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetch(`${base}/api/v1/classrooms/me/channels/${kind}/messages${query}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<import('./types').ClassroomMessagesPayload>;
  return env.data;
}

export async function sendClassroomChannelMessage(
  token: string,
  kind: import('./types').ClassroomChannelKind,
  payload: {
    text: string;
    reply_to_id?: number | null;
    ref_announcement_id?: number | null;
    image_data_url?: string | null;
  }
): Promise<import('./types').SendRoomMessagePayload> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/classrooms/me/channels/${kind}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<import('./types').SendRoomMessagePayload>;
  return env.data;
}

export async function editClassroomChannelMessage(
  token: string,
  kind: import('./types').ClassroomChannelKind,
  id: number,
  text: string
): Promise<import('./types').ClassroomChatMessage> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/classrooms/me/channels/${kind}/messages/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<import('./types').ClassroomChatMessage>;
  return env.data;
}

export async function deleteClassroomChannelMessage(
  token: string,
  kind: import('./types').ClassroomChannelKind,
  id: number
): Promise<import('./types').ClassroomChatMessage> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/classrooms/me/channels/${kind}/messages/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<import('./types').ClassroomChatMessage>;
  return env.data;
}

export async function setClassroomChannelMessageReaction(
  token: string,
  kind: import('./types').ClassroomChannelKind,
  id: number,
  emoji: string | null
): Promise<import('./types').ClassroomChatMessage> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/classrooms/me/channels/${kind}/messages/${id}/reaction`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ emoji }),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const env = (await res.json()) as ApiSuccessEnvelope<import('./types').ClassroomChatMessage>;
  return env.data;
}

export async function sendClassroomChannelTyping(
  token: string,
  kind: import('./types').ClassroomChannelKind
): Promise<void> {
  const base = getApiBaseUrl();
  await fetch(`${base}/api/v1/classrooms/me/channels/${kind}/typing`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

const classroomMediaCache = new Map<string, string>();

/** Fetches an authenticated room JPEG asset (avatar, banner, announcement/message attachment) as a cached Object URL. */
export async function fetchAuthenticatedMediaUrl(
  token: string,
  relativePath: string
): Promise<string | null> {
  const cached = classroomMediaCache.get(relativePath);
  if (cached) return cached;
  const base = getApiBaseUrl();
  const url = relativePath.startsWith('http') ? relativePath : `${base}${relativePath}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    classroomMediaCache.set(relativePath, objUrl);
    return objUrl;
  } catch {
    return null;
  }
}

export interface ClassroomStreamEvent {
  kind: 'rev_bump' | 'typing' | 'representatives_changed' | 'appearance_changed' | 'resync';
  channel?: string;
  rev?: number;
  account_id?: number;
  label?: string;
  room_id?: number;
}

/** Subscribes to `GET /api/v1/classrooms/me/stream` using authenticated streaming fetch with auto-cleanup. */
export function subscribeClassroomStream(
  token: string,
  onEvent: (ev: ClassroomStreamEvent) => void
): () => void {
  const controller = new AbortController();
  let stopped = false;

  const connect = async () => {
    const base = getApiBaseUrl();
    while (!stopped) {
      try {
        const res = await fetch(`${base}/api/v1/classrooms/me/stream`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          await new Promise((r) => window.setTimeout(r, 4000));
          continue;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split('\n\n');
          buf = frames.pop() ?? '';
          for (const frame of frames) {
            for (const line of frame.split('\n')) {
              if (line.startsWith('data:')) {
                const raw = line.slice(5).trim();
                if (!raw || raw === 'ping') continue;
                try {
                  onEvent(JSON.parse(raw) as ClassroomStreamEvent);
                } catch {
                  // ignore malformed frame
                }
              }
            }
          }
        }
      } catch {
        if (stopped) return;
      }
      if (!stopped) {
        await new Promise((r) => window.setTimeout(r, 3500));
      }
    }
  };

  void connect();
  return () => {
    stopped = true;
    controller.abort();
  };
}
