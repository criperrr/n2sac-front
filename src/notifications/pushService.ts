import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { updateAccountFcmToken } from '../api/nsacClient';

export type SocialPushKind =
  | 'chat_message'
  | 'follow'
  | 'follow_request'
  | 'follow_accepted'
  | 'friendship';

export type AppPushKind =
  | SocialPushKind
  | 'grade_update'
  | 'class_announcement'
  | 'room_chat'
  | 'room_offtopic';

export interface GradePushHighlight {
  subject: string;
  bimester: number;
  year: number;
  personal_grade: number | null;
  class_average: number | null;
  previous_grade: number | null;
  recovery: boolean;
  event_kind?: 'grade' | 'recovery_status';
  recovery_code?: string;
}

export interface SocialPushEventDetail {
  kind: SocialPushKind;
  actorId: number | null;
  actorLabel: string;
  title: string;
  body: string;
  messageId?: string;
}

export interface AppPushEventDetail {
  kind: AppPushKind;
  title: string;
  body: string;
  classCode?: string;
  announcementId?: number | null;
  channelKind?: 'chat' | 'off_topic';
  actorId?: number | null;
  actorLabel?: string;
  subjects?: string[];
  bimesters?: number[];
  primarySubject?: string;
  primaryBimester?: number | null;
  primaryYear?: number | null;
  primaryGrade?: number | null;
  primaryClassAvg?: number | null;
  highlights?: GradePushHighlight[];
  source?: 'notification' | 'while_away';
  messageId?: string;
}

interface NativePushBridge {
  consumePendingPushIntent(): string | null;
  postAccumulatedGradeNotification?(payloadJson: string): void;
  clearAccumulatedGradeNotifications?(): void;
  consumePendingAccumulatedGrades?(): string | null;
}

declare global {
  interface Window {
    NsacAndroidPush?: NativePushBridge;
    __NSAC_PENDING_PUSH__?: Record<string, unknown>;
  }
}

/** Legacy channel IDs that were created with `sound: 'default'` (broken `res/raw/default` URI). */
const LEGACY_BROKEN_CHANNEL_IDS = [
  'n2sac-grades',
  'n2sac-social-messages',
  'n2sac-social-friends',
  'n2sac-social-follows',
];

/**
 * Versioned Android NotificationChannels.
 * IMPORTANT: Never pass `sound: 'default'` to Capacitor's `createChannel` — Capacitor resolves
 * any string `sound` to `res/raw/<sound>`, which breaks sound & heads-up banners when absent!
 * Omitting `sound` uses Android's system default notification sound with full Heads-Up pop-ups.
 */
const APP_NOTIFICATION_CHANNELS = [
  {
    id: 'n2sac-grades-v2',
    name: 'Notas do NSAC',
    description: 'Avisos de alta prioridade quando novas notas são lançadas',
    importance: 4 as const,
    visibility: 1 as const,
    vibration: true,
    lights: true,
  },
  {
    id: 'n2sac-announcements-v1',
    name: 'Anúncios da Turma',
    description: 'Avisos oficiais de alta prioridade dos representantes de classe',
    importance: 4 as const,
    visibility: 1 as const,
    vibration: true,
    lights: true,
  },
  {
    id: 'n2sac-social-messages-v2',
    name: 'Mensagens de amigos',
    description: 'Avisos de novas mensagens recebidas no chat do n²sac',
    importance: 4 as const,
    visibility: 1 as const,
    vibration: true,
    lights: true,
  },
  {
    id: 'n2sac-social-follows-v2',
    name: 'Novos seguidores',
    description: 'Avisos quando alguém segue você ou envia solicitação',
    importance: 4 as const,
    visibility: 1 as const,
    vibration: true,
    lights: true,
  },
  {
    id: 'n2sac-social-friends-v2',
    name: 'Amizades conquistadas',
    description: 'Avisos quando uma nova amizade mútua é formada no n²sac',
    importance: 4 as const,
    visibility: 1 as const,
    vibration: true,
    lights: true,
  },
  {
    id: 'n2sac-room-chat-v1',
    name: 'Chat da Turma',
    description: 'Respostas e mensagens no chat da sua turma',
    importance: 3 as const,
    visibility: 1 as const,
    vibration: true,
  },
  {
    id: 'n2sac-room-offtopic-v1',
    name: 'Chat Off-Topic',
    description: 'Conversas livres no canal off-topic da turma',
    importance: 2 as const,
    visibility: 1 as const,
    vibration: false,
  },
];

let listenersBound = false;
let channelsCreated = false;
let latestAuthToken: string | null = null;
let pendingResolve: ((token: string) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;

/** Queues for cold-start notification taps received before React components finish mounting. */
let pendingAppPushOpen: AppPushEventDetail | null = null;
let pendingSocialPushOpen: SocialPushEventDetail | null = null;

/** Deduplicates when both Capacitor PushNotifications and Android MainActivity Intent fire for the same tap. */
let lastOpenDedupKey = '';
let lastOpenDedupAt = 0;

function channelForKind(kind?: string): string {
  switch (kind) {
    case 'class_announcement':
      return 'n2sac-announcements-v1';
    case 'room_chat':
      return 'n2sac-room-chat-v1';
    case 'room_offtopic':
      return 'n2sac-room-offtopic-v1';
    case 'chat_message':
      return 'n2sac-social-messages-v2';
    case 'friendship':
      return 'n2sac-social-friends-v2';
    case 'follow':
    case 'follow_request':
    case 'follow_accepted':
      return 'n2sac-social-follows-v2';
    case 'grade_update':
    default:
      return 'n2sac-grades-v2';
  }
}

function isSocialKind(kind: unknown): kind is SocialPushKind {
  return (
    kind === 'chat_message' ||
    kind === 'follow' ||
    kind === 'follow_request' ||
    kind === 'follow_accepted' ||
    kind === 'friendship'
  );
}

function parseOptionalNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseHighlights(raw: unknown): GradePushHighlight[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: GradePushHighlight[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const subject = typeof r.subject === 'string' ? r.subject.trim() : '';
    const bimester = parseOptionalNumber(r.bimester);
    if (!subject || bimester === null) continue;
    out.push({
      subject,
      bimester: Math.round(bimester),
      year: Math.round(parseOptionalNumber(r.year) ?? new Date().getFullYear()),
      personal_grade: parseOptionalNumber(r.personal_grade),
      class_average: parseOptionalNumber(r.class_average),
      previous_grade: parseOptionalNumber(r.previous_grade),
      recovery: Boolean(r.recovery),
    });
  }
  return out;
}

function parseSocialDetail(
  data: Record<string, unknown> | undefined,
  title?: string,
  body?: string
): SocialPushEventDetail | null {
  const kind = data?.kind;
  if (!isSocialKind(kind)) return null;
  const rawId = data?.actor_id ?? data?.actorId;
  const parsedId = typeof rawId === 'number' ? rawId : Number.parseInt(String(rawId ?? ''), 10);
  const actorId = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null;
  const actorLabel =
    typeof data?.actor_label === 'string' && data.actor_label.trim()
      ? data.actor_label.trim()
      : title?.trim() || 'Colega';
  const messageId =
    typeof data?.['google.message_id'] === 'string' ? data['google.message_id'] : undefined;
  return {
    kind,
    actorId,
    actorLabel,
    title: title?.trim() || (typeof data?.title === 'string' ? data.title : 'n²sac'),
    body: body?.trim() || (typeof data?.body === 'string' ? data.body : ''),
    messageId,
  };
}

function parseAppDetail(
  data: Record<string, unknown> | undefined,
  title?: string,
  body?: string
): AppPushEventDetail | null {
  const resolvedTitle = title?.trim() || (typeof data?.title === 'string' ? data.title.trim() : '');
  const resolvedBody = body?.trim() || (typeof data?.body === 'string' ? data.body.trim() : '');
  const messageId =
    typeof data?.['google.message_id'] === 'string' ? data['google.message_id'] : undefined;

  const social = parseSocialDetail(data, resolvedTitle, resolvedBody);
  if (social) {
    return {
      kind: social.kind,
      title: social.title,
      body: social.body,
      actorId: social.actorId,
      actorLabel: social.actorLabel,
      messageId,
    };
  }
  const kind = typeof data?.kind === 'string' ? data.kind : undefined;
  const classCode = typeof data?.class_code === 'string' ? data.class_code : undefined;

  if (kind === 'class_announcement') {
    const rawAnn = data?.announcement_id;
    const annId = Number.parseInt(String(rawAnn ?? ''), 10);
    return {
      kind: 'class_announcement',
      title: resolvedTitle || 'Anúncio da Turma',
      body: resolvedBody,
      classCode,
      announcementId: Number.isFinite(annId) && annId > 0 ? annId : null,
      messageId,
    };
  }

  if (kind === 'room_chat' || kind === 'room_offtopic') {
    return {
      kind,
      title: resolvedTitle || 'Chat da Turma',
      body: resolvedBody,
      classCode,
      channelKind: kind === 'room_offtopic' ? 'off_topic' : 'chat',
      messageId,
    };
  }

  if (
    kind === 'grade_update' ||
    typeof data?.subjects === 'string' ||
    typeof data?.primary_subject === 'string' ||
    typeof data?.highlights_json === 'string' ||
    classCode
  ) {
    const highlights = parseHighlights(data?.highlights_json ?? data?.highlights);
    const subjects =
      typeof data?.subjects === 'string'
        ? data.subjects
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : highlights.map((h) => h.subject);
    const bimesters =
      typeof data?.bimesters === 'string'
        ? data.bimesters
            .split(',')
            .map((s) => Number.parseInt(s.trim(), 10))
            .filter((n) => Number.isFinite(n) && n >= 1 && n <= 4)
        : Array.from(new Set(highlights.map((h) => h.bimester)));

    const primarySubject =
      (typeof data?.primary_subject === 'string' && data.primary_subject.trim()) ||
      highlights[0]?.subject ||
      subjects[0] ||
      undefined;
    const primaryBimester =
      parseOptionalNumber(data?.primary_bimester) ?? highlights[0]?.bimester ?? bimesters[0] ?? null;
    const primaryYear =
      parseOptionalNumber(data?.primary_year) ?? highlights[0]?.year ?? null;
    const primaryGrade =
      parseOptionalNumber(data?.primary_grade) ?? highlights[0]?.personal_grade ?? null;
    const primaryClassAvg =
      parseOptionalNumber(data?.primary_class_avg) ?? highlights[0]?.class_average ?? null;

    const source = data?.source === 'while_away' ? 'while_away' : 'notification';

    return {
      kind: 'grade_update',
      title: resolvedTitle || 'Novas notas no NSAC',
      body: resolvedBody,
      classCode,
      subjects,
      bimesters,
      primarySubject,
      primaryBimester: primaryBimester !== null ? Math.round(primaryBimester) : null,
      primaryYear: primaryYear !== null ? Math.round(primaryYear) : null,
      primaryGrade,
      primaryClassAvg,
      source,
      highlights:
        highlights.length > 0
          ? highlights
          : primarySubject
            ? [
                {
                  subject: primarySubject,
                  bimester: primaryBimester !== null ? Math.round(primaryBimester) : 1,
                  year: primaryYear !== null ? Math.round(primaryYear) : new Date().getFullYear(),
                  personal_grade: primaryGrade,
                  class_average: primaryClassAvg,
                  previous_grade: null,
                  recovery: false,
                },
              ]
            : [],
      messageId,
    };
  }

  return null;
}

function dedupKeyOf(detail: AppPushEventDetail): string {
  if (detail.messageId) return `mid:${detail.messageId}`;
  return [
    detail.kind,
    detail.primarySubject ?? '',
    detail.primaryBimester ?? '',
    detail.announcementId ?? '',
    detail.channelKind ?? '',
    detail.actorId ?? '',
  ].join('|');
}

function emitPushOpen(
  data: Record<string, unknown> | undefined,
  title?: string,
  body?: string
): void {
  const social = parseSocialDetail(data, title, body);
  const appDetail = parseAppDetail(data, title, body);
  if (!appDetail && !social) return;

  const key = appDetail ? dedupKeyOf(appDetail) : `social:${social!.kind}:${social!.actorId ?? ''}`;
  const now = Date.now();
  if (key === lastOpenDedupKey && now - lastOpenDedupAt < 4000) {
    return;
  }
  lastOpenDedupKey = key;
  lastOpenDedupAt = now;

  if (social) {
    pendingSocialPushOpen = social;
    window.dispatchEvent(new CustomEvent<SocialPushEventDetail>('n2sac:social-push-open', { detail: social }));
  }
  if (appDetail) {
    pendingAppPushOpen = appDetail;
    window.dispatchEvent(new CustomEvent<AppPushEventDetail>('n2sac:app-push-open', { detail: appDetail }));
  }
}

/** Pulls any cold-start app push tap captured before `App` finished mounting. */
export function consumePendingAppPushOpen(): AppPushEventDetail | null {
  checkNativePendingPushIntent();
  const next = pendingAppPushOpen;
  pendingAppPushOpen = null;
  return next;
}

/**
 * Drains unread accumulated grade notifications from Android SharedPreferences when the user
 * opens/resumes the app directly (without tapping the notification in the shade).
 */
export function consumeNativeAccumulatedGrades(): AppPushEventDetail | null {
  if (typeof window === 'undefined') return null;
  try {
    const rawJson = window.NsacAndroidPush?.consumePendingAccumulatedGrades?.();
    if (!rawJson) return null;
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    const detail = parseAppDetail({ ...parsed, source: 'while_away' });
    return detail && detail.kind === 'grade_update' ? { ...detail, source: 'while_away' } : null;
  } catch {
    return null;
  }
}

/** Pulls any cold-start social push tap captured before `ProfileViewer` finished mounting. */
export function consumePendingSocialPushOpen(): SocialPushEventDetail | null {
  checkNativePendingPushIntent();
  const next = pendingSocialPushOpen;
  pendingSocialPushOpen = null;
  return next;
}

function checkNativePendingPushIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    const rawJson = window.NsacAndroidPush?.consumePendingPushIntent?.();
    if (rawJson) {
      const parsed = JSON.parse(rawJson) as Record<string, unknown>;
      emitPushOpen(parsed);
    }
  } catch {
    // ignore malformed bridge JSON
  }
  if (window.__NSAC_PENDING_PUSH__) {
    const obj = window.__NSAC_PENDING_PUSH__;
    delete window.__NSAC_PENDING_PUSH__;
    emitPushOpen(obj);
  }
}

export async function ensureNotificationChannels(): Promise<void> {
  if (channelsCreated || !Capacitor.isNativePlatform()) return;
  channelsCreated = true;

  for (const legacyId of LEGACY_BROKEN_CHANNEL_IDS) {
    try {
      await PushNotifications.deleteChannel({ id: legacyId });
    } catch {
      // ignore
    }
    try {
      await LocalNotifications.deleteChannel({ id: legacyId });
    } catch {
      // ignore
    }
  }

  for (const ch of APP_NOTIFICATION_CHANNELS) {
    try {
      await LocalNotifications.createChannel(ch);
    } catch {
      // ignore if channel already exists or unsupported
    }
    try {
      await PushNotifications.createChannel(ch);
    } catch {
      // ignore if unsupported
    }
  }
}

function ensureListeners() {
  if (listenersBound) return;
  listenersBound = true;

  if (typeof window !== 'undefined') {
    window.addEventListener('nsac:native-push-open', (ev) => {
      const detail = (ev as CustomEvent<Record<string, unknown>>).detail;
      if (detail && typeof detail === 'object') {
        delete window.__NSAC_PENDING_PUSH__;
        emitPushOpen(detail);
      }
    });
  }

  if (!Capacitor.isNativePlatform()) return;

  void PushNotifications.addListener('registration', async (token) => {
    const fcmToken = token.value?.trim();
    if (!fcmToken) {
      pendingReject?.(new Error('Token FCM vazio retornado pelo Android.'));
      pendingResolve = null;
      pendingReject = null;
      return;
    }

    try {
      if (latestAuthToken) {
        await updateAccountFcmToken(latestAuthToken, fcmToken);
      }
      pendingResolve?.(fcmToken);
    } catch (err) {
      pendingReject?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      pendingResolve = null;
      pendingReject = null;
    }
  });

  void PushNotifications.addListener('registrationError', (err) => {
    const message =
      typeof err === 'object' && err && 'error' in err
        ? String((err as { error: unknown }).error)
        : 'Falha ao registrar no Firebase Cloud Messaging.';
    pendingReject?.(new Error(message));
    pendingResolve = null;
    pendingReject = null;
  });

  void PushNotifications.addListener('pushNotificationReceived', async (notification) => {
    const data = notification.data as Record<string, unknown> | undefined;
    const title = notification.title || 'n²sac';
    const body = notification.body || '';
    const social = parseSocialDetail(data, title, body);
    const appDetail = parseAppDetail(data, title, body);

    if (social) {
      window.dispatchEvent(new CustomEvent<SocialPushEventDetail>('n2sac:social-push', { detail: social }));
    }
    if (appDetail) {
      window.dispatchEvent(new CustomEvent<AppPushEventDetail>('n2sac:app-push', { detail: appDetail }));
    }

    // Android suppresses system banners for FCM pushes while the app is in foreground;
    // schedule an immediate LocalNotification on the matching high-importance channel.
    // Note: `grade_update` pushes are already accumulated and posted natively by
    // `NsacMessagingService` -> `GradeNotificationAccumulator`, so skip duplicating them here.
    const resolvedKind = appDetail?.kind ?? (typeof data?.kind === 'string' ? data.kind : undefined);
    const handledNatively =
      resolvedKind === 'grade_update' &&
      Boolean(window.NsacAndroidPush?.postAccumulatedGradeNotification);

    if (Capacitor.isNativePlatform() && !handledNatively && (title || body)) {
      try {
        await ensureNotificationChannels();
        const id = Math.floor(Date.now() % 2_000_000_000);
        await LocalNotifications.schedule({
          notifications: [
            {
              id,
              title,
              body,
              channelId: channelForKind(resolvedKind),
              extra: { ...(data ?? {}), kind: resolvedKind, title, body },
              schedule: { at: new Date(Date.now() + 50) },
            },
          ],
        });
      } catch {
        // Fallback: in-app toast already dispatched above.
      }
    }
  });

  void PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action.notification.data as Record<string, unknown> | undefined;
    emitPushOpen(data, action.notification.title, action.notification.body);
  });

  void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const data = action.notification.extra as Record<string, unknown> | undefined;
    emitPushOpen(data, action.notification.title, action.notification.body);
  });
}

/**
 * Initializes Android notification channels, binds foreground/tap listeners, drains any
 * cold-start notification intent, and silently refreshes the FCM token on boot.
 */
export async function initializePushNotifications(authToken: string): Promise<void> {
  latestAuthToken = authToken;
  ensureListeners();
  checkNativePendingPushIntent();
  if (!Capacitor.isNativePlatform()) return;

  await ensureNotificationChannels();

  try {
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'granted') {
      await PushNotifications.register();
    }
  } catch {
    // Non-fatal if Play Services is temporarily unavailable.
  }
}

/**
 * Requests Android 13+ POST_NOTIFICATIONS permission, registers with Firebase FCM,
 * and uploads the real device FCM token to `PUT /api/v1/account/fcm-token`.
 */
export async function registerNativeFcmPush(authToken: string): Promise<string> {
  latestAuthToken = authToken;

  if (!Capacitor.isNativePlatform()) {
    throw new Error('Notificações push nativas FCM só funcionam no aplicativo Android.');
  }

  ensureListeners();
  await ensureNotificationChannels();

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') {
    throw new Error('Permissão de notificações negada no Android. Ative nas configurações do app.');
  }

  return new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pendingResolve = null;
      pendingReject = null;
      reject(new Error('Tempo esgotado aguardando token FCM do Google Play Services.'));
    }, 15_000);

    pendingResolve = (tok) => {
      window.clearTimeout(timeout);
      resolve(tok);
    };
    pendingReject = (err) => {
      window.clearTimeout(timeout);
      reject(err);
    };

    void PushNotifications.register();
  });
}
