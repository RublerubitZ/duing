import type { ClubCategory } from './club';
import type { AvailabilityItem } from './interview';
import type { InterviewRoundStatus, InterviewRoundMemberStatus } from './interviewRound';
import type { RecruitmentStatus } from './recruitment';
import type { College, Grade } from './user';

// College, Grade 는 user.ts 에서 정의된 타입을 재사용한다.
export type { College, Grade };

export type ApplicationStatus =
  | 'SUBMITTED'
  | 'ON_HOLD'
  | 'INTERVIEW_PENDING'
  | 'ACCEPTED'
  | 'REJECTED';

export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'SUBMITTED',
  'ON_HOLD',
  'INTERVIEW_PENDING',
  'ACCEPTED',
  'REJECTED',
];

export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(value);
}

export type ApplicationScope = 'ALL' | 'ACTIVE' | 'ARCHIVED';

export type AssignedInterview = {
  startAt: string;
  endAt: string;
  // nullable — BE interview-config.location 미설정 (=null) 시 그대로 전달된다.
  location: string | null;
};

export type ApplicationSummary = {
  id: number;
  recruitmentId: number;
  recruitmentTitle: string;
  /**
   * 모집 마감 여부 — 지원 상태와 직교한 축이다. 마감된 모집의 미결 지원은 결과가 나오지 않은
   * 채 종료된 것이라 "심사 중"으로 보이면 거짓이다.
   * 아직 이 필드를 안 내려주는 백엔드가 있어 optional 이다 — 없으면 마감 아님으로 읽는다(fail-open).
   * 전 배포가 끝나면 필수로 조인다.
   */
  recruitmentStatus?: RecruitmentStatus;
  clubId: number;
  clubName: string;
  category: ClubCategory;
  logoUrl: string | null;
  status: ApplicationStatus;
  interview: AssignedInterview | null;
  submittedAt: string; // ISO datetime
};

export type MyApplicationDetail = {
  id: number;
  recruitmentId: number;
  recruitmentTitle: string;
  /** 모집 마감 여부 — 면접 안내·철회처럼 마감 후 성립하지 않는 UI 를 접는 근거. 전환기 optional. */
  recruitmentStatus?: RecruitmentStatus;
  clubId: number;
  clubName: string;
  questions: string[];
  answers: string[];
  status: ApplicationStatus;
  interview: AssignedInterview | null;
  submittedAt: string;
  // 면접 진행 필드 (Spec P0-1) — useInterview=false 모집은 count=0,
  // availabilityDeadline=null 로 응답한다.
  interviewAvailabilityCount: number;
  availabilityDeadline: string | null;
  // 면접 사용 모집 여부 — 지원 진행 단계에 면접 단계를 표시할지 결정한다.
  useInterview: boolean;
};

export type Applicant = {
  applicationId: number;
  userId: number;
  userName: string;
  studentId: string;
  college: College;
  major: string;
  grade: Grade;
  answers: string[];
  status: ApplicationStatus;
  submittedAt: string;
  interviewStartAt: string | null;
  myScore: number | null;
};

export type ApplicationEvaluation = {
  evaluatorId: number;
  evaluatorName: string;
  score: number; // 1-5
  memo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationStatusHistoryItem = {
  previousStatus: ApplicationStatus;
  newStatus: ApplicationStatus;
  changedById: number;
  changedByName: string;
  changedAt: string;
};

export type ApplicantNeighbors = {
  prevApplicationId: number | null;
  nextApplicationId: number | null;
};

export type ApplicantsFilters = {
  status?: ApplicationStatus;
  college?: College;
  q?: string;
  submittedFrom?: string; // YYYY-MM-DD
  submittedTo?: string;   // YYYY-MM-DD
};

export type UpsertApplicationEvaluationPayload = {
  score: number;
  memo: string | null;
};

/** 제출 응답 1건 — values 의미는 DraftAnswer 와 동일(TEXT=본문 1개 / 선택형=choiceId 목록). */
export type SubmitAnswerItem = {
  questionId: string;
  values: string[];
};

// 구 `answers: string[]` 과 동시 전송하면 백엔드가 400 으로 거절한다.
export type SubmitApplicationPayload = {
  answerItems: SubmitAnswerItem[];
};

export type UpdateApplicationStatusPayload = {
  status: Exclude<ApplicationStatus, 'SUBMITTED'>;
};

export type BulkUpdateApplicationStatusPayload = {
  applicationIds: number[];
  status: Exclude<ApplicationStatus, 'SUBMITTED'>;
};

export type BulkUpdateApplicationStatusFailure = {
  applicationId: number;
  reason: string;
};

export type BulkUpdateApplicationStatusResult = {
  updated: number;
  failures: BulkUpdateApplicationStatusFailure[];
};

export type ApplicantDetail = {
  applicationId: number;
  recruitmentId: number;
  recruitmentTitle: string;
  clubId: number;
  clubName: string;
  applicant: {
    userId: number;
    name: string;
    studentId: string;
    college: College;
    major: string;
    grade: Grade;
    phone: string;
  };
  answers: { question: string; answer: string }[];
  status: ApplicationStatus;
  interview: AssignedInterview | null;
  submittedAt: string;
  myEvaluation: ApplicationEvaluation | null;
  otherEvaluations: ApplicationEvaluation[];
  statusHistory: ApplicationStatusHistoryItem[];
  // 면접 슬롯 정보 (Spec P0-2) — useInterview=false 모집/일반 모집은 빈 배열,
  // assignedSlot=null. AvailabilityItem 은 capacity/assignedCount 미포함 경량 표현.
  interviewAvailabilities: AvailabilityItem[];
  assignedSlot: AvailabilityItem | null;
  // 면접 라운드 요약 (BE#14) — placement-active 멤버십이 있는 경우에만 채워진다.
  // 대기열 상태(INTERVIEW_PENDING 이지만 미선정)이거나 면접 미사용 모집이면 null.
  interviewRound: InterviewRoundBrief | null;
};

// = ApplicantDetailResponse.InterviewRoundBrief (BE#14)
// backend: controller/dto/response/ApplicantDetailResponse.java — inner record InterviewRoundBrief
export type InterviewRoundBrief = {
  roundId: number;
  title: string;
  roundStatus: InterviewRoundStatus;
  memberStatus: InterviewRoundMemberStatus;
  unresponded: boolean;
  alternativeAvailabilityText: string | null;
};
