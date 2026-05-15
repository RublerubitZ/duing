export type ApplicationStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'INTERVIEW_PENDING'
  | 'ACCEPTED'
  | 'REJECTED';

export interface ApplicationSummary {
  id: number;
  recruitmentId: number;
  recruitmentTitle: string;
  clubId: number;
  clubName: string;
  status: ApplicationStatus;
  interviewAt: string | null;
  interviewLocation: string | null;
  submittedAt: string; // ISO datetime
}

export interface MyApplicationDetail {
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
}

export interface Applicant {
  applicationId: number;
  userId: number;
  userName: string;
  studentId: string;
  email: string;
  answers: string[];
  status: ApplicationStatus;
  submittedAt: string;
}

export interface SubmitApplicationPayload {
  answers: string[];
}

export interface UpdateApplicationStatusPayload {
  status: Exclude<ApplicationStatus, 'SUBMITTED'>;
}