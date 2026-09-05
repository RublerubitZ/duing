import type { ClubCategory, ClubStatus } from './club';
import type { College, Grade } from './user';
import type { ClubMemberRole } from './clubmember';
import type { UserRole } from './user';

/**
 * GET /admin/clubs 응답 행. 학생 측 ClubSummary 와 동일 필드 + leader 정보가 left join 으로 펼쳐진다.
 * 데이터 정합이 깨져 leader 가 없는 동아리는 leader* 필드가 null 로 내려간다.
 */
export type AdminClubSummary = {
  id: number;
  name: string;
  category: ClubCategory;
  division: string | null;
  college: College | null;
  logoUrl: string | null;
  status: ClubStatus;
  tags: string[];
  leaderId: number | null;
  leaderName: string | null;
  leaderStudentId: string | null;
  centralClub: boolean;
  // 기본 확보 시간 대상(시설 크롤 자동 분류 정책) — ON 이면 이 동아리의 크롤 예약이 BASIC_SECURED_TIME 으로
  // 분류되어 해당 시간대의 예약 차단이 해제된다(비차단 전환 2026-08-27).
  facilitySecuredTimeTarget: boolean;
  rejectionReason: string | null;
  statusChangedAt: string | null;
  statusChangedByName: string | null;
};

// === 시설 예약 오픈일(총동연) — 시설별 booking_open_date ===

/** GET /admin/facilities 행. 활성 시설 + 오픈일(null = 닫힘, 아직 신청을 받지 않음). */
export type AdminFacility = {
  id: number;
  roomName: string;
  location: string | null;
  bookingOpenDate: string | null; // yyyy-MM-dd, null = 닫힘
};

/** PATCH /admin/facilities[/{id}]/booking-open-date 바디. null 이면 닫기. */
export type UpdateFacilityBookingOpenDatePayload = { bookingOpenDate: string | null };

// === 어드민 크롤 예약 현황(전면 차단 설계 §3.6) — 그룹 단위 페이징 ===

export type AdminCrawlGroupBy = 'CLUB' | 'FACILITY' | 'FACILITY_DATE';

/** 크롤 예약=차단, 기본 확보 시간=비차단(신청 가능) — 배지는 그 구분 표시다(BASIC_SECURED_TIME=총동연 지정 대상). */
export type AdminCrawlClassification = 'CRAWLED_RESERVATION' | 'BASIC_SECURED_TIME';

export type AdminCrawlReservation = {
  reservationId: number;
  facilityId: number;
  facilityName: string | null;
  organizationName: string;
  reservationDate: string; // yyyy-MM-dd
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  classification: AdminCrawlClassification;
  matchedClubId?: number;
  matchedClubName?: string;
  crawledAt: string; // ISO datetime — 행 내용 마지막 변경 시각(차등 반영: 내용 동일 시 미갱신). 수집 시각이 아니다
};

export type AdminCrawlReservationGroup = {
  groupType: 'CLUB' | 'EXTERNAL' | 'FACILITY' | 'FACILITY_DATE';
  clubId?: number;
  facilitySecuredTimeTarget?: boolean;
  facilityId?: number;
  reservationDate?: string;
  title: string;
  reservations: AdminCrawlReservation[];
};

export type AdminCrawlReservationParams = {
  yearMonth?: string; // yyyy-MM, 당월·익월만 허용
  facilityId?: number;
  groupBy?: AdminCrawlGroupBy;
  page?: number;
  size?: number;
};

export type AdminClubSearchParams = {
  status?: ClubStatus;
  category?: ClubCategory;
  division?: string;
  keyword?: string;
  page?: number;
  size?: number;
  sort?: string;
};

/** 계정 상태. SUSPENDED 는 로그인·API 접근이 차단된 이용 정지이며 탈퇴와 별개다. */
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

/** 회원 상세의 조치 이력 종류. 백엔드 AdminUserAction 과 1:1. */
export type AdminUserActionType =
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_UNSUSPENDED'
  | 'FORCE_LOGOUT'
  | 'ADMIN_NOTE_UPDATED'
  | 'PHONE_VIEW';

/**
 * GET /admin/users 응답 행. 비밀번호 해시·전화번호 등 민감 필드는 의도적으로 빠져있다.
 *
 * grade·college·major 는 동명이인 식별용이다. 원값(enum)으로 내려오며 한글 라벨은
 * GRADE_DISPLAY_NAME·COLLEGE_DISPLAY_NAME 으로 붙인다. major 는 자유 입력이라 빈 문자열일 수 있다.
 */
export type AdminUserSearchResult = {
  id: number;
  studentId: string;
  name: string;
  role: UserRole;
  grade: Grade;
  college: College;
  major: string;
  /** 배포 전환기의 구 백엔드 응답에는 없을 수 있다 — 없으면 화면이 뱃지를 렌더하지 않는다. */
  status?: UserStatus;
};

export type AdminUserSearchParams = {
  /** 선택 — 생략하면 전체를 대상으로 한다(정지 회원만 훑는 경로). */
  q?: string;
  status?: UserStatus;
  page?: number;
  size?: number;
  sort?: string;
};

export type AdminUserClub = {
  clubId: number;
  clubName: string;
  role: ClubMemberRole;
  joinedAt: string;
};

export type AdminUserActionLogEntry = {
  action: AdminUserActionType;
  actorName: string | null;
  reason: string | null;
  at: string;
};

/** GET /admin/users/{userId} 응답. 시각은 전부 ISO 8601 절대시각(백엔드가 존 변환을 끝냈다). */
export type AdminUserDetail = {
  id: number;
  name: string;
  studentId: string;
  grade: Grade;
  college: College;
  major: string;
  role: UserRole;
  maskedPhone: string;
  phoneVerified: boolean;
  phoneVerifiedAt: string | null;
  status: UserStatus;
  createdAt: string;
  /** null 이면 "기록 없음" — 기존 회원은 백필하지 않았다. */
  lastLoginAt: string | null;
  adminNote: string | null;
  adminNoteUpdatedAt: string | null;
  adminNoteUpdatedBy: string | null;
  clubs: AdminUserClub[];
  /** 개인정보 열람(PHONE_VIEW)은 서버가 제외하고 내려준다. */
  recentActions: AdminUserActionLogEntry[];
};

export type AdminUserPhone = { phone: string };

export type ChangeUserStatusPayload = { status: UserStatus; reason: string };

/** 비우려면 빈 문자열을 보낸다 — 백엔드가 null 을 거부한다. */
export type UpdateAdminNotePayload = { note: string };

export type ReportTargetType = 'CLUB' | 'RECRUITMENT';
export type ReportStatus = 'PENDING' | 'RESOLVED' | 'DISMISSED';
export type ReportReasonCode = 'SPAM' | 'FRAUD' | 'INAPPROPRIATE' | 'IMPERSONATION' | 'OTHER';

export type AdminReportSummary = {
  id: number;
  targetType: ReportTargetType;
  targetId: number;
  targetLabel: string;
  reasonCode: ReportReasonCode;
  status: ReportStatus;
  createdAt: string;
};

export type AdminReportUserRef = { id: number; name: string };

export type AdminReportDetail = {
  id: number;
  reporter: AdminReportUserRef | null;
  targetType: ReportTargetType;
  targetId: number;
  targetLabel: string;
  reasonCode: ReportReasonCode;
  detail: string;
  status: ReportStatus;
  actionNote: string | null;
  handledBy: AdminReportUserRef | null;
  handledAt: string | null;
  createdAt: string;
};

export type AdminReportSearchParams = {
  status?: ReportStatus;
  targetType?: ReportTargetType;
  page?: number;
  size?: number;
  sort?: string;
};

export type ProcessReportPayload = {
  status: Exclude<ReportStatus, 'PENDING'>;
  actionNote?: string;
};

export type SubmitReportPayload = {
  targetType: ReportTargetType;
  targetId: number;
  reasonCode: ReportReasonCode;
  detail?: string;
};

// ─── 회장 승계 ───────────────────────────────────────────────────────────────

export type SuccessionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type ClubMemberEventType =
  | 'ROLE_CHANGED'
  | 'LEADER_TRANSFERRED'
  | 'LEFT'
  | 'REMOVED'
  | 'ADMIN_LEADER_ASSIGNED'
  | 'SUCCESSION_APPROVED';

export type AdminSuccessionUserRef = { id: number; name: string };

export type AdminSuccessionSummary = {
  id: number;
  clubId: number;
  clubName: string;
  requester: AdminSuccessionUserRef;
  status: SuccessionStatus;
  createdAt: string;
};

export type AdminSuccessionDetail = {
  id: number;
  club: { id: number; name: string };
  requester: AdminSuccessionUserRef | null;
  currentLeader: AdminSuccessionUserRef | null;
  reason: string;
  status: SuccessionStatus;
  actionNote: string | null;
  handledBy: AdminSuccessionUserRef | null;
  handledAt: string | null;
  createdAt: string;
};

export type AdminSuccessionSearchParams = {
  status?: SuccessionStatus;
  clubId?: number;
  page?: number;
  size?: number;
  sort?: string;
};

export type ProcessSuccessionPayload = {
  status: Exclude<SuccessionStatus, 'PENDING'>;
  actionNote?: string;
};

export type SubmitSuccessionRequestPayload = {
  reason: string;
};

export type AssignAdminLeaderPayload = {
  newLeaderUserId: number;
  reason: string;
};

export type AdminClubMemberHistoryRow = {
  id: number;
  eventType: ClubMemberEventType;
  target: { id: number; name: string };
  actor: { id: number; name: string };
  fromRole: ClubMemberRole | null;
  toRole: ClubMemberRole | null;
  reason: string | null;
  createdAt: string;
};

export type AdminClubMemberHistoryParams = {
  page?: number;
  size?: number;
  sort?: string;
};

// ─── 홍보 요청 ──────────────────────────────────────────────────────────────

export type PromotionRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export type AdminPromotionRequestUserRef = { id: number; name: string };

export type AdminPromotionRequestSummary = {
  id: number;
  club: { id: number; name: string };
  requester: AdminPromotionRequestUserRef;
  title: string;
  status: PromotionRequestStatus;
  createdAt: string;
};

export type AdminPromotionRequestDetail = {
  id: number;
  club: { id: number; name: string };
  requester: AdminPromotionRequestUserRef;
  title: string;
  description: string;
  suggestedBannerImageUrl: string | null;
  suggestedLinkUrl: string | null;
  status: PromotionRequestStatus;
  actionNote: string | null;
  handledBy: AdminPromotionRequestUserRef | null;
  handledAt: string | null;
  createdAt: string;
};

export type AdminPromotionRequestSearchParams = {
  status?: PromotionRequestStatus;
  clubId?: number;
  page?: number;
  size?: number;
  sort?: string;
};

export type ProcessPromotionRequestPayload = {
  status: Exclude<PromotionRequestStatus, 'PENDING'>;
  actionNote?: string;
};

export type SubmitPromotionRequestPayload = {
  title: string;
  description: string;
  suggestedBannerImageUrl?: string;
  suggestedLinkUrl?: string;
};

// ─── 홍보 배너 ──────────────────────────────────────────────────────────────

export type AdminPromotionBannerUserRef = { id: number; name: string };

/**
 * 랜딩 hero 배너의 색 톤 프리셋. 실제 bg/fg/accent hex 매핑은
 * frontend/apps/web/app/_lib/promotionPalette.ts 에 위치.
 */
export type PromotionPalette = 'INK' | 'PLAIN' | 'SAGE' | 'WARM' | 'CORAL' | 'BERRY' | 'SKY';

/** 프로모션 배너 렌더 모드. SYSTEM_COMPOSED=시스템 조합형, FULL_BLEED_IMAGE=완성 이미지형. */
export type PromotionRenderMode = 'SYSTEM_COMPOSED' | 'FULL_BLEED_IMAGE';

/** 백엔드 derived. NONE=클릭 불가, URL=직접 URL, NOTICE=공지 연결, CLUB=동아리 연결. */
export type PromotionLinkType = 'NONE' | 'URL' | 'NOTICE' | 'CLUB';

/** 어드민 응답 — 운영자가 비공개/삭제 공지도 식별 가능해야 하므로 title 그대로. */
export type AdminPromotionNoticeRef = {
  id: number;
  title: string;
  visibility: 'PUBLIC' | 'OFFICERS_ALL' | 'CLUB_SCOPED' | null;
  isAccessible: boolean;
};

/** 공개 응답 — isAccessible=false 면 title 이 빈 문자열로 옴 (백엔드 누출 방지). */
export type PublicPromotionNoticeRef = {
  id: number;
  title: string;
  isAccessible: boolean;
};

export type AdminPromotionSummary = {
  id: number;
  club: { id: number; name: string } | null;
  title: string;
  bannerImageUrl: string | null;
  linkUrl: string | null;
  active: boolean;
  displayOrder: number;
  createdBy: AdminPromotionBannerUserRef;
  createdAt: string;
  updatedAt: string;
  tag: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  emoji: string | null;
  palette: PromotionPalette;
  /** ISO 8601 — 노출 시작 시각. null=상시(즉시 노출). */
  startAt: string | null;
  /** ISO 8601 — 노출 종료 시각. null=상시(만료 없음). */
  endAt: string | null;
  renderMode: PromotionRenderMode;
  imageAltText: string | null;
  notice: AdminPromotionNoticeRef | null;
  linkType: PromotionLinkType;
};

export type AdminPromotionSearchParams = {
  active?: boolean;
  clubId?: number;
  page?: number;
  size?: number;
  sort?: string;
};

export type CreatePromotionPayload = {
  clubId?: number | null;
  title: string;
  bannerImageUrl?: string | null;
  linkUrl?: string | null;
  active: boolean;
  displayOrder: number;
  palette: PromotionPalette;
  tag?: string | null;
  subtitle?: string | null;
  ctaLabel?: string | null;
  emoji?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  renderMode?: PromotionRenderMode | null;
  imageAltText?: string | null;
  noticeId?: number | null;
};

export type UpdatePromotionPayload = {
  title?: string;
  bannerImageUrl?: string;
  linkUrl?: string | null;
  clubId?: number | null;
  active?: boolean;
  displayOrder?: number;
  clearClubId?: boolean;
  palette?: PromotionPalette;
  tag?: string;
  subtitle?: string;
  ctaLabel?: string;
  emoji?: string;
  startAt?: string;
  endAt?: string;
  renderMode?: PromotionRenderMode;
  imageAltText?: string;
  clearBannerImageUrl?: boolean;
  clearLinkUrl?: boolean;
  clearTag?: boolean;
  clearSubtitle?: boolean;
  clearCtaLabel?: boolean;
  clearEmoji?: boolean;
  clearStartAt?: boolean;
  clearEndAt?: boolean;
  clearImageAltText?: boolean;
  noticeId?: number;
  clearNoticeId?: boolean;
};

/** 비로그인 사용자도 볼 수 있는 공개 배너 카드 응답 (GET /promotions). */
export type PromotionCard = {
  id: number;
  club: { id: number; name: string } | null;
  title: string;
  bannerImageUrl: string | null;
  linkUrl: string | null;
  displayOrder: number;
  createdAt: string;
  tag: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  emoji: string | null;
  palette: PromotionPalette;
  renderMode: PromotionRenderMode;
  imageAltText: string | null;
  notice: PublicPromotionNoticeRef | null;
};

/**
 * GET /admin/pending-counts 응답. 관리자 콘솔 사이드바 뱃지용 도메인별 미처리 건수.
 *
 * "무엇이 미처리인가" 는 서버가 정한다 — 예를 들어 inquiryUnanswered 는 접수(RECEIVED)뿐 아니라
 * 관리자가 답변을 쓰기 시작한 상태(IN_PROGRESS)까지 포함한 합산값이다. 화면은 숫자만 그린다.
 */
export type AdminPendingCounts = {
  clubApproval: number;
  facilityBooking: number;
  inquiryUnanswered: number;
  promotionRequest: number;
  reportUnresolved: number;
  leaderSuccession: number;
  totalPendingCount: number;
};
