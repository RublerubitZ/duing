export type ApplicationStatus = 'SUBMITTED' | 'ACCEPTED' | 'REJECTED';

export interface ApplicationSummary {
  id: number;
  recruitmentId: number;
  recruitmentTitle: string;
  clubId: number;
  clubName: string;
  status: ApplicationStatus;
  submittedAt: string; // ISO datetime
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
