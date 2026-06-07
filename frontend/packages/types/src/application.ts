import type { ClubCategory } from './club';
import type { College, Grade } from './user';

// College, Grade 는 user.ts 에서 정의된 타입을 재사용한다.
export type { College, Grade };

export type ApplicationStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'INTERVIEW_PENDING'
  | 'ACCEPTED'
  | 'REJECTED';

export type ApplicationScope = 'ALL' | 'ACTIVE' | 'ARCHIVED';

export type ApplicationSummary = {
  id: number;
  recruitmentId: number;
  recruitmentTitle: string;
  clubId: number;
  clubName: string;
  category: ClubCategory;
  logoUrl: string | null;
  status: ApplicationStatus;
  interviewAt: string | null;
  interviewLocation: string | null;
  submittedAt: string; // ISO datetime
};

export type MyApplicationDetail = {
  id: number;
  recruitmentId: number;
  recruitmentTitle: string;
  clubId: number;
  clubName: string;
  questions: string[];
  answers: string[];
  status: ApplicationStatus;
  interviewAt: string | null;
  interviewLocation: string | null;
  submittedAt: string;
};

export type Applicant = {
  applicationId: number;
  userId: number;
  userName: string;
  studentId: string;
  email: string;
  college: College;
  major: string;
  grade: Grade;
  answers: string[];
  status: ApplicationStatus;
  submittedAt: string;
  interviewAt: string | null;
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

export type SubmitApplicationPayload = {
  answers: string[];
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
    email: string;
    college: College;
    major: string;
    grade: Grade;
  };
  answers: { question: string; answer: string }[];
  status: ApplicationStatus;
  interviewAt: string | null;
  interviewLocation: string | null;
  submittedAt: string;
  myEvaluation: ApplicationEvaluation | null;
  otherEvaluations: ApplicationEvaluation[];
  statusHistory: ApplicationStatusHistoryItem[];
};

export type UpdateInterviewPayload = {
  interviewAt: string;
  interviewLocation: string;
};
