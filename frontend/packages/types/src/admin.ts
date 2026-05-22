import type { ClubCategory, ClubStatus } from './club';
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
