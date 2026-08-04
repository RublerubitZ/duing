import type { ApplicationStatus } from './application';

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

export type QuestionType = 'TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';

export type RecruitmentQuestionChoice = {
  id: string;
  label: string;
};

export type RecruitmentQuestionItem = {
  id: string;
  text: string;
  type: QuestionType;
  required: boolean;
  choices: RecruitmentQuestionChoice[];
};

/** 생성·수정 페이로드용 — id 는 수정 시 왕복(신규 항목은 null), 서버가 발급·보존한다. */
export type QuestionChoicePayload = {
  id?: string | null;
  label: string;
};

export type QuestionItemPayload = {
  id?: string | null;
  text: string;
  type: QuestionType;
  required: boolean;
  choices: QuestionChoicePayload[];
};

export type RecruitmentDetail = RecruitmentSummary & {
  content: string | null;
  questions: string[];
  // TODO(legacy-questions-v1): 구 BE 소멸 후 required 로 승격
  questionItems?: RecruitmentQuestionItem[];
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
  // TODO(legacy-questions-v1): 신 FE 는 사용하지 않음 — 제거 예정. questionItems 와 동시 전송 시 백엔드 400.
  questions?: string[];
  questionItems?: QuestionItemPayload[];
  applicationMode?: ApplicationMode;
  externalFormUrl?: string;
  useInterview?: boolean;
  targetRole?: TargetRole;
  interviewStartDate?: string | null;
  interviewEndDate?: string | null;
  showApplicantCount?: boolean;
};

/** 총동연 모집 콘솔 정렬. 서버가 정렬 규칙을 정하며 클라이언트는 키만 고른다. */
export type AdminRecruitmentSort = 'LATEST' | 'APPLICANTS' | 'DEADLINE';

export type AdminRecruitmentSearchParams = {
  q?: string;
  status?: RecruitmentStatus;
  mode?: ApplicationMode;
  sort?: AdminRecruitmentSort;
};

export type AdminRecruitmentSummary = {
  recruitmentId: number;
  clubId: number;
  clubName: string;
  title: string;
  applicationMode: ApplicationMode;
  status: RecruitmentStatus;
  /** 외부 폼 모집은 두잉에 지원 데이터가 없어 0 이 아니라 null(해당 없음)이다. */
  applicantCount: number | null;
  startDate: string; // ISO yyyy-MM-dd
  endDate: string | null; // null = 상시모집
  updatedAt: string;
};

/** 외부 폼 모집의 가입 코드·요청 현황. 전부 서버 계산값이라 화면은 표시만 한다. */
export type AdminJoinLinkStatus = {
  linkStatus: 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED';
  generation: number | null;
  maxUses: number;
  usedCount: number;
  totalRequestCount: number;
  pendingCount: number;
  enrolledCount: number;
  joinWindowDays: number;
  joinExpiresAt: string | null;
};

export type AdminRecruitmentDetail = AdminRecruitmentSummary & {
  externalFormUrl: string | null;
  /** 외부 폼 모집이라도 활성 코드가 없으면 null — 화면은 "코드 없음"으로 읽는다. */
  joinLink: AdminJoinLinkStatus | null;
};

export type ForceCloseRecruitmentPayload = { reason?: string };

/** 총동연 지원자 목록 정렬 — 제출 시각 기준 최신순/오래된순 둘뿐이다. */
export type AdminApplicantSort = 'LATEST' | 'OLDEST';

export type AdminApplicantSearchParams = {
  q?: string;
  status?: ApplicationStatus;
  sort?: AdminApplicantSort;
};

/** 총동연 지원자 목록 행 — 감독에 필요한 신원 항목만 담고 학년·답변·평가는 없다. */
export type AdminApplicant = {
  applicationId: number;
  userName: string;
  studentId: string;
  college: string;
  major: string;
  status: ApplicationStatus;
  submittedAt: string;
};

export type AdminApplicantList = {
  /** 검색·필터와 무관한 모집 전체 지원자 수 — 표의 행 수와 다를 수 있다. */
  total: number;
  /** 건수가 0 인 상태는 키 자체가 없다 — 화면은 없는 키를 0 으로 읽는다. */
  statusCounts: Partial<Record<ApplicationStatus, number>>;
  applicants: AdminApplicant[];
};

/** 총동연 지원서 상세 — 읽기 전용이라 평가·면접·연락처는 응답에 없다. */
export type AdminApplicationDetail = {
  applicationId: number;
  recruitmentId: number;
  recruitmentTitle: string;
  clubId: number;
  clubName: string;
  applicant: { name: string; studentId: string; college: string; major: string };
  status: ApplicationStatus;
  submittedAt: string;
  /** 최초 제출 항목은 previousStatus 가 null. 처리자 이름은 동아리 내부 정보라 담기지 않는다. */
  statusHistory: {
    previousStatus: ApplicationStatus | null;
    newStatus: ApplicationStatus;
    changedAt: string;
  }[];
  /** 미답변 질문의 answer 는 빈 문자열이다. */
  answers: { question: string; answer: string }[];
};

export type UpdateRecruitmentPayload = {
  title?: string;
  content?: string | null;
  startDate?: string;
  endDate?: string;
  capacity?: number;
  useInterview?: boolean;
  // TODO(legacy-questions-v1): 신 FE 는 사용하지 않음 — 제거 예정. questionItems 와 동시 전송 시 백엔드 400.
  questions?: string[];
  questionItems?: QuestionItemPayload[];
  interviewStartDate?: string | null;
  interviewEndDate?: string | null;
  showApplicantCount?: boolean;
};
