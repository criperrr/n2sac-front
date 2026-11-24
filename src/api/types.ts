export type RecoveryStatusCode = 'SAT' | 'INS' | 'NC' | 'NAC';

export type RecoveryMessage =
  | 'Satisfatório'
  | 'Insatisfatório'
  | 'Não Compareceu'
  | 'Não Aconteceu'
  | 'Não aconteceu';

export interface PersonalBiInformation {
  grade: number | null;
  absences: number;
  recovery: boolean;
  recovered?: boolean;
  recoveryCode?: RecoveryStatusCode;
  recoveryMessage?: RecoveryMessage;
}

export interface ClassBiInformation {
  averageGrade: number | null;
}

export interface UnifiedBimesterData {
  bimester: number;
  personal: PersonalBiInformation;
  class: ClassBiInformation;
}

export interface ResultData {
  grade: number | null;
  totalAbsences: number;
}

export interface FullGrades {
  subjectName: string;
  results: ResultData;
  bimesters: UnifiedBimesterData[];
}

export interface BimesterData {
  userAverage: number;
  classAverage: number;
  totalAbsences: number;
}

export interface YearInfo {
  title: string;
  year: number;
  status: string;
  grades: FullGrades[];
  bimestersMetrics: BimesterData[];
}

export interface AllYearsResponse {
  warning: boolean | string;
  userCurrentYear: number;
  data: YearInfo[];
}

export interface HomeLinkItem {
  title: string;
  description: string;
  url: string;
}

export interface HomeInfo {
  portalDate: string | null;
  availableRoutes: string[];
  infoLinks: HomeLinkItem[];
}

export interface AtrasoRecord {
  date: string;
  time: string | null;
  subject: string | null;
  reason: string | null;
  rawColumns: string[];
}

export interface SaidaRecord {
  date: string;
  time: string | null;
  reason: string | null;
  authorizedBy: string | null;
  rawColumns: string[];
}

export interface FichaAvaliacaoEntry {
  schoolYear: number | null;
  bimester: number;
  lastViewed: string | null;
  statusText: string;
  available: boolean;
  detailId: number | null;
  detailUrl: string | null;
}

export interface FichaAvaliacaoDetail {
  bimester: number;
  title: string | null;
  tables: string[][][];
  notes: string[];
}

export interface LoginResponse {
  account_id: number;
  nsac_email: string;
  class_code: string | null;
  token: string;
  expires_at: string;
}

export interface AccountProfileResponse {
  account_id: number;
  nsac_email: string;
  class_code: string | null;
  has_fcm_token: boolean;
  discord_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  next_poll_hint_secs?: number;
}

export interface ApiErrorItem {
  code: string;
  message: string;
}

export interface ApiErrorEnvelope {
  success: false;
  errors: ApiErrorItem[];
}

export interface CachedResource<T> {
  data: T;
  etag: string | null;
  cachedAt: number;
  nextPollHintSecs: number;
  lastStatus: 200 | 304;
}

export interface BoletimApiQueryParams {
  schoolYear?: number;
  targetBimester?: number;
  subjectNameContains?: string;
  gradeGte?: number;
  gradeLt?: number;
  classAverageGte?: number;
  classAverageLt?: number;
  deltaGte?: number;
  deltaLt?: number;
  absencesGte?: number;
  absencesLte?: number;
  totalAbsencesGte?: number;
  totalAbsencesLte?: number;
  isRecovery?: boolean;
  recoveryCode?: string;
  postedOnly?: boolean;
}

export interface RankingPreferences {
  account_id: number;
  opted_in: boolean;
  hide_name: boolean;
  display_name: string | null;
  /** Show my profile photo in the ranking (never while `hide_name`). */
  show_avatar: boolean;
  /** Let other ranking participants open my profile (never while `hide_name`). */
  public_profile: boolean;
  /** Findable in student search even without showing the name in the ranking. */
  discoverable: boolean;
  /** Never exposed: out of the ranking, search and profiles. */
  invisible: boolean;
  has_decided: boolean;
  updated_at: string;
}

export interface AccountTagBadge {
  slug: string;
  label: string;
  description: string;
  color_hex: string;
  priority: number;
}

export interface LeaderboardEntry {
  rank: number;
  account_id: number;
  is_me: boolean;
  display_label: string;
  is_anonymous: boolean;
  /** Versioned `/api/v1/profiles/{id}/avatar?v=…` path (needs the bearer token). */
  avatar_url: string | null;
  /** The requester may open this student's profile. */
  has_public_profile: boolean;
  class_code: string;
  personal_average: number;
  class_average: number;
  delta_vs_class: number;
  posted_bimesters_count: number;
  subjects_count: number;
  total_absences: number;
  tags?: AccountTagBadge[];
}

export interface SubjectComparisonRow {
  subject_name: string;
  my_average: number | null;
  peer_average: number | null;
  class_average: number | null;
  delta_me_vs_peer: number | null;
  my_absences: number;
  peer_absences: number;
}

export interface PeerComparisonDetail {
  peer_entry: LeaderboardEntry;
  my_wins: number;
  peer_wins: number;
  ties: number;
  subjects: SubjectComparisonRow[];
}

export interface ComparisonSummaryResponse {
  scope: 'class' | 'course' | 'school';
  school_year: number;
  bimester: number | null;
  subject_filter: string | null;
  total_participants: number;
  my_preferences: RankingPreferences;
  my_rank: number | null;
  my_percentile: number | null;
  my_entry: LeaderboardEntry | null;
  leaderboard: LeaderboardEntry[];
  peer_comparison: PeerComparisonDetail | null;
}

export type FollowEdgeStatus = 'none' | 'pending' | 'accepted';

export interface RelationshipStatus {
  outgoing: FollowEdgeStatus;
  incoming: FollowEdgeStatus;
  is_friend: boolean;
  blocked_by_me: boolean;
  blocked_me: boolean;
}

/** `GET /api/v1/students/search?q=`: a findable student (never includes the e-mail). */
export interface StudentSearchResult {
  account_id: number;
  display_label: string;
  class_code: string;
  avatar_url: string | null;
  has_public_profile: boolean;
  requires_follow_approval?: boolean;
  followers_count?: number;
  following_count?: number;
  relationship?: RelationshipStatus;
}

export type ConnectionVerificationSource = 'manual' | 'oauth' | 'discord_import';

export interface PublicConnection {
  provider: string;
  handle: string;
  display_name: string | null;
  profile_url: string | null;
  verification_source: ConnectionVerificationSource;
  is_verified: boolean;
}

export interface AccountConnection extends PublicConnection {
  is_visible: boolean;
  display_order: number;
  updated_at: string;
}

export interface ConnectionProviderDescriptor {
  id: string;
  label: string;
  placeholder: string;
  supports_oauth: boolean;
  oauth_enabled: boolean;
  supports_discord_import: boolean;
}

export interface AccountConnectionsPayload {
  connections: AccountConnection[];
  providers: ConnectionProviderDescriptor[];
  max_connections: number;
}

/** `GET /api/v1/profiles/{account_id}`: a classmate's public profile. */
export interface PublicProfile {
  account_id: number;
  is_me: boolean;
  display_label: string;
  class_code: string;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  followers_count?: number;
  following_count?: number;
  relationship?: RelationshipStatus;
  connections?: PublicConnection[];
}

export interface SocialUserSummary {
  account_id: number;
  display_label: string;
  class_code: string;
  avatar_url: string | null;
  has_public_profile: boolean;
  is_friend: boolean;
  outgoing: FollowEdgeStatus;
  incoming: FollowEdgeStatus;
  since: string | null;
}

export interface ConversationSummary {
  peer: SocialUserSummary;
  is_friend: boolean;
  last_message_id: number | null;
  last_message_preview: string | null;
  last_message_sender_id: number | null;
  last_message_at: string | null;
  unread_count: number;
}

export interface SocialOverview {
  friends_count: number;
  followers_count: number;
  following_count: number;
  pending_requests_count: number;
  unread_messages_count: number;
  friends: SocialUserSummary[];
  followers: SocialUserSummary[];
  following: SocialUserSummary[];
  incoming_requests: SocialUserSummary[];
  outgoing_requests: SocialUserSummary[];
  blocked: SocialUserSummary[];
  conversations: ConversationSummary[];
}

export interface FollowMutationResult {
  relationship: RelationshipStatus;
  became_friends: boolean;
  status: FollowEdgeStatus;
  peer_account_id: number;
  peer_label: string;
  peer_avatar_url: string | null;
  peer_class_code: string;
}

export interface ChatReplyPreview {
  id: number;
  sender_id: number;
  is_me: boolean;
  text: string;
  deleted: boolean;
}

export interface ChatReaction {
  emoji: string;
  count: number;
  mine: boolean;
}

/** Fields after `created_at` come from servers with the chat extras (absent on older ones). */
export interface ChatMessage {
  id: number;
  sender_id: number;
  is_me: boolean;
  text: string;
  created_at: string;
  edited_at?: string | null;
  deleted?: boolean;
  reply_to?: ChatReplyPreview | null;
  reactions?: ChatReaction[];
  rev?: number;
}

export interface ChatRateLimitStatus {
  limit: number;
  window_secs: number;
  remaining: number;
  retry_after_secs: number;
}

export interface ConversationMessagesPayload {
  peer: SocialUserSummary;
  is_friend: boolean;
  blocked: boolean;
  messages: ChatMessage[];
  rate_limit: ChatRateLimitStatus;
  /** Chat extras (absent on older servers). */
  peer_last_read_id?: number;
  peer_typing?: boolean;
  next_rev?: number;
  has_more_before?: boolean;
}

export interface SendMessagePayload {
  message: ChatMessage;
  rate_limit: ChatRateLimitStatus;
}

export type FeedbackKind = 'bug' | 'suggestion' | 'feedback';
export type FeedbackStatus = 'open' | 'triaged' | 'resolved' | 'dismissed';
export type BugSeverity = 'blocker' | 'major' | 'minor';
export type BugFrequency = 'always' | 'sometimes' | 'once';
export type FeedbackArea =
  | 'boletim'
  | 'ranking'
  | 'frequencia'
  | 'sentinela'
  | 'social'
  | 'configuracoes'
  | 'login_update'
  | 'geral'
  | 'nova_funcao';

export interface CreateFeedbackPayload {
  kind: FeedbackKind;
  area: FeedbackArea;
  title: string;
  severity?: BugSeverity;
  frequency?: BugFrequency;
  steps_to_reproduce?: string;
  actual_behavior?: string;
  expected_behavior?: string;
  problem?: string;
  proposal?: string;
  rating?: number;
  message?: string;
  attachments?: string[];
  context?: Record<string, unknown>;
}

export interface CreatedFeedbackResponse {
  id: number;
  kind: FeedbackKind;
  status: FeedbackStatus;
  area: string;
  title: string;
  attachment_count: number;
  created_at: string;
}

export interface FeedbackMineItem {
  id: number;
  kind: FeedbackKind;
  status: FeedbackStatus;
  area: string;
  severity: BugSeverity | null;
  frequency: BugFrequency | null;
  rating: number | null;
  title: string;
  attachment_count: number;
  dev_note: string | null;
  created_at: string;
  updated_at: string;
}

export type RoomChatNotificationMode = 'all' | 'mentions' | 'muted';

export interface NotificationPreferences {
  grades_enabled: boolean;
  announcements_enabled: boolean;
  social_enabled: boolean;
  room_chat_mode: RoomChatNotificationMode;
  room_offtopic_mode: RoomChatNotificationMode;
  updated_at: string;
}

export type ClassroomChannelKind = 'chat' | 'off_topic';
export type AnnouncementCategory = string;

export interface ClassroomInfo {
  id: number;
  class_code: string;
  school_year: number;
  member_count: number;
  min_members_required: number;
  is_functional: boolean;
  quorum: number;
  max_representatives: number;
  max_votes_per_student: number;
  avatar_url: string | null;
  banner_url: string | null;
}

export interface RoomVoterChip {
  account_id: number;
  display_label: string;
  avatar_url: string | null;
}

export interface RoomRepresentativeSummary {
  account_id: number;
  display_label: string;
  avatar_url: string | null;
  vote_count: number;
  elected_at: string;
}

export interface ElectionCandidateRow {
  rank: number;
  account_id: number;
  is_me: boolean;
  display_label: string;
  nsac_email?: string;
  avatar_url: string | null;
  vote_count: number;
  is_representative: boolean;
  voted_by_me: boolean;
  voters: RoomVoterChip[];
}

export interface ElectionStatePayload {
  room: ClassroomInfo;
  am_i_representative: boolean;
  my_votes: number[];
  candidates: ElectionCandidateRow[];
}

export interface RoomChannelPreview {
  channel_kind: ClassroomChannelKind;
  unread_count: number;
  last_message_id: number | null;
  last_message_preview: string | null;
  last_sender_label: string | null;
  last_message_at: string | null;
}

export interface AnnouncementItem {
  id: number;
  room_id: number;
  author_id: number;
  author_label: string;
  author_avatar_url: string | null;
  is_mine: boolean;
  category: AnnouncementCategory;
  title: string;
  body: string;
  event_date: string | null;
  pinned: boolean;
  notify_push: boolean;
  attachment_url: string | null;
  read_count: number;
  read_by_me: boolean;
  reactions: ChatReaction[];
  created_at: string;
  edited_at: string | null;
  deleted: boolean;
  rev: number;
}

export interface ClassroomOverviewPayload {
  room: ClassroomInfo;
  am_i_representative: boolean;
  my_votes: number[];
  representatives: RoomRepresentativeSummary[];
  unread_announcements: number;
  chat: RoomChannelPreview;
  off_topic: RoomChannelPreview;
  announcements: AnnouncementItem[];
  next_announcements_rev: number;
}

export interface RoomMessageReplyPreview {
  id: number;
  sender_id: number;
  sender_label: string;
  is_me: boolean;
  text: string;
  deleted: boolean;
}

export interface RoomAnnouncementRef {
  id: number;
  title: string;
  category: AnnouncementCategory;
}

export interface ClassroomChatMessage {
  id: number;
  room_id: number;
  channel_kind: ClassroomChannelKind;
  sender_id: number;
  sender_label: string;
  sender_avatar_url: string | null;
  sender_is_representative: boolean;
  sender_tags?: AccountTagBadge[];
  is_me: boolean;
  text: string;
  attachment_url: string | null;
  created_at: string;
  edited_at: string | null;
  deleted: boolean;
  deletion_kind: 'author' | 'representative' | 'moderation' | null;
  reply_to: RoomMessageReplyPreview | null;
  ref_announcement: RoomAnnouncementRef | null;
  reactions: ChatReaction[];
  rev: number;
}

export interface ClassroomMessagesPayload {
  room: ClassroomInfo;
  channel_kind: ClassroomChannelKind;
  am_i_representative: boolean;
  messages: ClassroomChatMessage[];
  rate_limit: ChatRateLimitStatus;
  typing_users: string[];
  next_rev: number;
  has_more_before: boolean;
}

export interface SendRoomMessagePayload {
  message: ClassroomChatMessage;
  rate_limit: ChatRateLimitStatus;
}
