import type { ClubCategory, ClubStatus } from './club';
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
  logoUrl: string | null;
  status: ClubStatus;
  tags: string[];
  leaderId: number | null;
  leaderName: string | null;
  leaderStudentId: string | null;
  centralClub: boolean;
  rejectionReason: string | null;
  statusChangedAt: string | null;
  statusChangedByName: string | null;
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

/**
 * GET /admin/users 응답 행. 비밀번호 해시·전화번호 등 민감 필드는 의도적으로 빠져있다.
 */
export type AdminUserSearchResult = {
  id: number;
  studentId: string;
  name: string;
  email: string;
  role: UserRole;
};

export type AdminUserSearchParams = {
  q: string;
  page?: number;
  size?: number;
  sort?: string;
};

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

// ─── 재인증 라운드 ──────────────────────────────────────────────────────────────

export type RoundStatus = 'OPEN' | 'CLOSED';

export type AdminRecertificationRoundUserRef = { id: number; name: string };

export type AdminRecertificationRound = {
  id: number;
  year: number;
  label: string;
  status: RoundStatus;
  openedBy: AdminRecertificationRoundUserRef;
  openedAt: string;
  closedBy: AdminRecertificationRoundUserRef | null;
  closedAt: string | null;
};

export type AdminRecertificationRoundSearchParams = {
  status?: RoundStatus;
  page?: number;
  size?: number;
  sort?: string;
};

export type CreateRecertificationRoundPayload = {
  year: number;
  label: string;
};

// ─── 재인증 요청 ──────────────────────────────────────────────────────────────

export type RecertificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type AdminRecertificationUserRef = { id: number; name: string };

export type AdminRecertificationRequestSummary = {
  id: number;
  round: { id: number; year: number; label: string; status: RoundStatus };
  club: { id: number; name: string };
  leader: AdminRecertificationUserRef;
  status: RecertificationStatus;
  operatingYear: number;
  createdAt: string;
};

export type AdminRecertificationRequestDetail = {
  id: number;
  round: { id: number; year: number; label: string };
  club: { id: number; name: string; lastVerifiedYear: number | null };
  currentLeader: AdminRecertificationUserRef | null;
  officers: AdminRecertificationUserRef[];
  submittedLeader: AdminRecertificationUserRef;
  contactEmail: string;
  contactPhone: string;
  operatingYear: number;
  notes: string | null;
  status: RecertificationStatus;
  actionNote: string | null;
  handledBy: AdminRecertificationUserRef | null;
  handledAt: string | null;
  createdAt: string;
  recentMemberHistory: AdminClubMemberHistoryRow[];
};

export type AdminRecertificationRequestSearchParams = {
  roundId?: number;
  status?: RecertificationStatus;
  page?: number;
  size?: number;
  sort?: string;
};

export type ProcessRecertificationPayload = {
  status: Exclude<RecertificationStatus, 'PENDING'>;
  actionNote?: string;
};

export type CentralClubRecertificationStatus = {
  clubId: number;
  clubName: string;
  centralClub: boolean;
  lastVerifiedYear: number | null;
  expired: boolean;
};

export type CentralClubRecertificationStatusParams = {
  operatingYear: number;
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
