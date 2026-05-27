import type { ClubCategory } from './club';

export type ApplicationStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'INTERVIEW_PENDING'
  | 'ACCEPTED'
  | 'REJECTED';

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
  answers: string[];
  status: ApplicationStatus;
  submittedAt: string;
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
  };
  answers: { question: string; answer: string }[];
  status: ApplicationStatus;
  interviewAt: string | null;
  interviewLocation: string | null;
  submittedAt: string;
};

export type UpdateInterviewPayload = {
  interviewAt: string;
  interviewLocation: string;
};
