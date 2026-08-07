// 총동연 회비 감사 콘솔(admin fee audit) 타입 — 백엔드 AdminFee*Response DTO 와 1:1 매핑.
// 페이지(PageResponse<T>)는 ./api, 회비 도메인 공용 enum(Bank·FeeStatus 등)은 ./fee 의 것을 재사용한다.
// 감사자는 회비 데이터를 바꾸지 않는다 — 쓰기 경로는 총동연 자신의 감사 의견·메모뿐이다.

import type { ClubStatus } from './club';
import type {
  Bank,
  BillingType,
  FeeStatus,
  FeeTargetType,
  PaymentMethod,
  PaymentStatus,
} from './fee';

/** 감사 콘솔 정렬. 서버가 정렬 규칙을 정하며 클라이언트는 키만 고른다. */
export type AdminFeeClubSort = 'OUTSTANDING' | 'BILLED' | 'COLLECTED' | 'RECENT_PAYMENT' | 'NAME';

/** 회비 사용 여부 필터. 활성 정책이나 청구 이력이 있으면 사용 중으로 본다. */
export type AdminFeeUsageFilter = 'USING' | 'NOT_USING';

/** 청구 목록 정렬. LATEST=최근 발행순(기본), DUE=마감 임박순, AMOUNT=청구액 큰 순. */
export type AdminFeeBillSort = 'LATEST' | 'DUE' | 'AMOUNT';

/** 콘솔 필터 — 미납(UNPAID)/연체(OVERDUE)는 저장된 status 가 아니라 마감일 파생으로 서버가 가른다. */
export type AdminFeeBillFilter = 'PAID' | 'UNPAID' | 'OVERDUE' | 'CANCELLED';

export type FeeAuditCommentKind = 'AUDIT_OPINION' | 'OPERATION_MEMO';
export type FeeAuditCommentStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED';
export type FeeAnomalySeverity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';

// 감사 로그에 실리는 이벤트 종류 — ClubAuditEventType 중 회비 관련(FEE_*)만 대상이다.
// 단일 출처(tuple) — 필터 칩 옵션·라벨 맵이 모두 이 순서를 그대로 파생한다.
// 앞 13개는 동아리 운영진의 변경 이벤트고, 뒤 2개는 총동연 자신의 열람 이력이다.
export const FEE_AUDIT_EVENT_TYPES = [
  'FEE_POLICY_CREATED',
  'FEE_POLICY_UPDATED',
  'FEE_POLICY_DELETED',
  'FEE_BILL_ISSUED',
  'FEE_BILL_CANCELLED',
  'FEE_PAYMENT_RECORDED',
  'FEE_PAYMENT_VOIDED',
  'FEE_TX_MANUAL_MATCHED',
  'FEE_TX_IGNORED',
  'FEE_TX_UNMATCHED',
  'FEE_ACCOUNT_REGISTERED',
  'FEE_ACCOUNT_UPDATED',
  'FEE_ACCOUNT_DELETED',
  'FEE_ADMIN_DETAIL_VIEWED',
  'FEE_ADMIN_CSV_DOWNLOADED',
] as const;

export type FeeAuditEventType = (typeof FEE_AUDIT_EVENT_TYPES)[number];

/** 전역 기간 필터. KST 날짜(yyyy-MM-dd)이며 to 는 당일을 포함한다. 생략하면 전체 기간이다. */
export type AdminFeePeriodParams = { from?: string; to?: string };

export type AdminFeeClubSearchParams = AdminFeePeriodParams & {
  q?: string;
  usage?: AdminFeeUsageFilter;
  sort?: AdminFeeClubSort;
  page?: number;
  size?: number;
};

/**
 * AdminFeeClubSummaryResponse 미러(목록 한 행). 집계는 취소 청구·정정 납부를 뺀 서버 계산값이다.
 * clubStatus 는 ClubStatus 전체를 받되 실제로는 ACTIVE·INACTIVE 만 실린다 —
 * 승인 대기·거절 동아리에는 회비 데이터가 존재할 수 없다.
 */
export type AdminFeeClubSummary = {
  clubId: number;
  clubName: string;
  clubStatus: ClubStatus;
  feeUsing: boolean;
  activePolicyCount: number;
  memberCount: number;
  billCount: number;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  unpaidMemberCount: number;
  /** 납부 이력이 없으면 null — 0 이 아니라 "해당 없음"이다. ISO 절대시각(서버가 존 변환을 끝냈다). */
  lastPaidAt: string | null;
  /** 연동 거래가 없으면 null. */
  lastTransactionAt: string | null;
};

/**
 * AdminFeeDashboardResponse.RecentActivity 미러. 전역 기간 필터와 무관하게 항상 KST 오늘 00:00 이후를 본다.
 * eventCounts 는 회비 변경 이벤트만 세고 총동연 열람 이력은 빼며, 0 건인 종류는 키 자체가 없다.
 */
export type AdminFeeRecentActivity = {
  since: string;
  eventCounts: Partial<Record<FeeAuditEventType, number>>;
  newOpinionCount: number;
};

/** AdminFeeDashboardResponse 미러(전체 현황 KPI). 청구가 없으면 collectionRate 는 0 이다. */
export type AdminFeeDashboard = {
  clubCount: number;
  feeUsingClubCount: number;
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  collectionRate: number;
  /** 전 동아리에서 아직 열려 있는(OPEN·IN_REVIEW) 감사 의견 수. */
  openOpinionCount: number;
  recentActivity: AdminFeeRecentActivity;
};

/**
 * AdminFeeClubDetailResponse 미러(동아리 상세 KPI).
 * billCount 는 취소 청구를 포함한 전체 건수인 반면 totalBilled·totalPaid 는 취소 청구를 뺀 금액이라
 * 건수와 금액의 모수가 다르다. 미납·연체는 저장된 status 가 아니라 마감일로 갈린다.
 */
export type AdminFeeClubDetail = {
  clubId: number;
  clubName: string;
  clubStatus: ClubStatus;
  memberCount: number;
  activePolicyCount: number;
  billCount: number;
  paidCount: number;
  unpaidCount: number;
  overdueCount: number;
  cancelledCount: number;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  collectionRate: number;
  bankMatchingActive: boolean;
};

/**
 * AdminFeePolicyResponse 미러. 비활성 정책도 감사 대상이라 함께 실린다.
 * billCount·paidCount 는 기간 내 발행 청구 기준(취소 제외)이라 정책의 전체 이력이 아니다.
 */
export type AdminFeePolicy = {
  policyId: number;
  name: string;
  amount: number;
  billingType: BillingType;
  targetType: FeeTargetType;
  active: boolean;
  autoIssue: boolean;
  /** autoIssue=true 인 MONTHLY 정책만 채워진다(그 외엔 null). */
  issueDay: number | null;
  dueDay: number | null;
  billCount: number;
  paidCount: number;
  paymentRate: number;
  createdAt: string;
};

/**
 * AdminFeeBillRowResponse 미러(청구 한 행).
 * status 는 DB 원본, overdue 는 마감일 파생이라 연체 전이 배치가 늦어 status 가 PENDING 인 청구도
 * overdue=true 로 온다 — 화면은 두 값을 함께 읽는다. 완납·취소는 마감이 지나도 false 다.
 */
export type AdminFeeBillRow = {
  billId: number;
  /** 탈퇴 회원이면 userId 는 남고 이름·학번·기수만 비워진다. */
  userId: number;
  userName: string | null;
  studentId: string | null;
  generation: number | null;
  /** 삭제된 정책의 청구는 null. */
  policyName: string | null;
  billingPeriod: string;
  amount: number;
  paidAmount: number;
  status: FeeStatus;
  overdue: boolean;
  createdAt: string;
  dueDate: string; // KST yyyy-MM-dd
  /** 납부가 한 건도 없으면 null. */
  lastPaidAt: string | null;
};

/**
 * 납부 매칭 유형(서버 파생). DIRECT=수기 기록, AUTO=자동매칭, MANUAL=운영자가 거래를 골라 승인.
 * 매칭을 해제한 뒤 정정된 납부는 원래 방식을 복원할 수 없어 MANUAL 로 표기된다.
 */
export type AdminFeeMatchType = 'AUTO' | 'MANUAL' | 'DIRECT';

/**
 * AdminFeePaymentRowResponse 미러(납부 한 행). 정정(VOIDED)된 납부도 실린다 —
 * 누가·언제·왜 정정했는지가 감사의 핵심이라 status=ACTIVE 인 행은 voided* 세 필드가 전부 null 이다.
 */
export type AdminFeePaymentRow = {
  paymentId: number;
  billId: number;
  /** 탈퇴 회원이면 null. */
  userName: string | null;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  matchType: AdminFeeMatchType;
  /** 입금자명 — 거래가 연결된 납부에만 있다. */
  counterparty: string | null;
  /** 기록·승인한 운영진 이름. 자동매칭이거나 탈퇴 회원이면 null. */
  recordedByName: string | null;
  status: PaymentStatus;
  voidedByName: string | null;
  voidedAt: string | null;
  voidReason: string | null;
};

/**
 * AdminFeeAccountResponse 미러(열람 전용). 평문 계좌번호는 어느 필드로도 나가지 않는다.
 * 미등록 동아리는 registered=false 에 나머지가 전부 null 이고, 복호화 실패 시
 * maskedAccountNumber 만 null 이다. 은행 한글 표시명은 프론트 라벨 맵이 보유한다(서버는 코드만).
 */
export type AdminFeeAccount = {
  registered: boolean;
  bank: Bank | null;
  maskedAccountNumber: string | null;
  accountHolder: string | null;
  bankMatchingActive: boolean;
};

/** 감사 로그가 가리키는 회비 대상. 이벤트 종류마다 채워지는 것이 달라 대부분 null 이다. */
export type AdminFeeAuditLogRefs = {
  feePolicyId: number | null;
  feeBillId: number | null;
  paymentId: number | null;
  bankTransactionId: number | null;
};

/**
 * AdminFeeAuditLogResponse 미러(감사 로그 한 행).
 * detail 은 이벤트 종류마다 키가 다른 변경 전/후 스냅샷 JSON 원문이며 값이 없는 이벤트는 null 이다 —
 * 서버가 형태를 규정하지 않으므로 화면은 키를 가정하지 말고 있는 것만 읽는다.
 */
export type AdminFeeAuditLog = {
  eventId: number;
  eventType: FeeAuditEventType;
  /** 탈퇴 회원이면 actorUserId 는 남고 actorName 만 null 이다. */
  actorUserId: number | null;
  actorName: string | null;
  createdAt: string;
  reason: string | null;
  refs: AdminFeeAuditLogRefs;
  detail: Record<string, unknown> | null;
};

/** 이상징후 한 건. evidence 는 규칙마다 키가 다른 판정 근거(건수·비율·임계값)이며 개인정보는 없다. */
export type AdminFeeAnomaly = {
  ruleId: string;
  severity: FeeAnomalySeverity;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
};

/**
 * AdminFeeAnomalyReportResponse 미러. window 는 요청이 생략한 기본값(최근 30일)까지 확정한
 * 실제 평가 구간이다 — 규칙에 따라 window 밖 시점의 징후가 실릴 수 있다(단시간 대량 변경·계좌 교체).
 * anomalies 에는 탐지된 규칙만 심각도 내림차순으로 담기고 미탐지면 빈 배열이다.
 */
export type AdminFeeAnomalyReport = {
  evaluatedAt: string;
  window: { from: string; to: string }; // KST yyyy-MM-dd, to 포함
  anomalies: AdminFeeAnomaly[];
};

/**
 * AdminFeeAuditCommentResponse 미러(감사 의견·운영 메모). 총동연 내부 기록이라 동아리 측에는 나가지 않는다.
 * 운영 메모는 상태를 가질 수 없어 status 가 항상 null 이고, 작성자가 탈퇴하면 authorName 만 비워진다.
 */
export type AdminFeeAuditComment = {
  commentId: number;
  kind: FeeAuditCommentKind;
  status: FeeAuditCommentStatus | null;
  content: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminFeeBillSearchParams = AdminFeePeriodParams & {
  filter?: AdminFeeBillFilter;
  /** 회원명 부분 일치 또는 학번 앞자리. */
  q?: string;
  sort?: AdminFeeBillSort;
  page?: number;
  size?: number;
};

export type AdminFeePaymentSearchParams = AdminFeePeriodParams & {
  status?: PaymentStatus;
  page?: number;
  size?: number;
};

export type AdminFeeAuditLogSearchParams = AdminFeePeriodParams & {
  /** 복수 지정 가능. 생략하면 회비 이벤트 전체. */
  types?: FeeAuditEventType[];
  page?: number;
  size?: number;
};

/** 의견은 status 를 생략하면 OPEN 으로 시작하고, 운영 메모에 status 를 실어 보내면 400 이다. */
export type CreateFeeAuditCommentPayload = {
  kind: FeeAuditCommentKind;
  status?: FeeAuditCommentStatus;
  content: string; // 1~2000자
};

/** 부분 수정 — 보내지 않은 필드는 기존 값을 유지한다. 상태 전이 제약은 없다(완료한 의견도 다시 열 수 있다). */
export type UpdateFeeAuditCommentPayload = {
  content?: string;
  status?: FeeAuditCommentStatus;
};
