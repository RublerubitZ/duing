export type RecruitmentStatus = 'OPEN' | 'CLOSED';
export type ApplicationMode = 'SELF' | 'EXTERNAL';
export type TargetRole = 'MEMBER' | 'OFFICER';
export type RecruitmentDisplayStatus = 'UPCOMING' | 'OPEN' | 'ALWAYS_OPEN' | 'CLOSED';

export type RecruitmentSummary = {
  id: number;
  clubId: number;
  clubName: string;
  title: string;
  startDate: string; // ISO yyyy-MM-dd
  endDate: string | null; // null = 상시모집
  capacity: number;
  status: RecruitmentStatus;
  displayStatus: RecruitmentDisplayStatus;
  effectivelyOpen: boolean;
  applicationMode: ApplicationMode;
  externalFormUrl: string | null;
  useInterview: boolean;
  targetRole: TargetRole;
};

export type RecruitmentDetail = RecruitmentSummary & {
  content: string | null;
  questions: string[];
  interviewStartDate: string | null;
  interviewEndDate: string | null;
  showApplicantCount: boolean;
  applicantCount: number | null;
  // 면접 가능시간 제출 마감 (LocalDateTime) — useInterview=true 면집 모집에서만 의미가 있다.
  // 백엔드는 모집 endDate 기반으로 산출하며 클라이언트는 deadline 경과 시 picker 를 disable 한다.
  interviewAvailabilityDeadline?: string | null;
};

/**
 * 학생 공개 화면(동아리 상세 페이지) 전용 모집 읽기 모델.
 * ClubDetail.activeRecruitment 에 임베드된다. 운영자용 RecruitmentDetail 과 별개.
 */
export type StudentRecruitmentProjection = {
  id: number;
  title: string;
  startDate: string;
  endDate: string | null;
  displayStatus: RecruitmentDisplayStatus;
  capacity: number;
  useInterview: boolean;
  targetRole: TargetRole;
  applicationMode: ApplicationMode;
  externalFormUrl: string | null;
  interviewStartDate: string | null;
  interviewEndDate: string | null;
  applicantCount: number | null;
};

export type CreateRecruitmentPayload = {
  title: string;
  content?: string;
  startDate: string;
  endDate?: string | null;
  capacity: number;
  questions?: string[];
  applicationMode?: ApplicationMode;
  externalFormUrl?: string;
  useInterview?: boolean;
  targetRole?: TargetRole;
  interviewStartDate?: string | null;
  interviewEndDate?: string | null;
  showApplicantCount?: boolean;
};

export type UpdateRecruitmentPayload = {
  title?: string;
  content?: string | null;
  startDate?: string;
  endDate?: string;
  capacity?: number;
  useInterview?: boolean;
  questions?: string[];
  interviewStartDate?: string | null;
  interviewEndDate?: string | null;
  showApplicantCount?: boolean;
};
