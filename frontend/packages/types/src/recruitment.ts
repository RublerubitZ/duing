export type RecruitmentStatus = 'OPEN' | 'CLOSED';
export type ApplicationMode = 'SELF' | 'EXTERNAL';
export type TargetRole = 'MEMBER' | 'OFFICER';

export interface RecruitmentSummary {
  id: number;
  clubId: number;
  clubName: string;
  title: string;
  startDate: string; // ISO yyyy-MM-dd
  endDate: string;
  capacity: number;
  status: RecruitmentStatus;
  effectivelyOpen: boolean;
  applicationMode: ApplicationMode;
  externalFormUrl: string | null;
  useInterview: boolean;
  targetRole: TargetRole;
}

export interface RecruitmentDetail extends RecruitmentSummary {
  content: string | null;
  questions: string[];
}

export interface CreateRecruitmentPayload {
  title: string;
  content?: string;
  startDate: string;
  endDate: string;
  capacity: number;
  questions?: string[];
  applicationMode?: ApplicationMode;
  externalFormUrl?: string;
  useInterview?: boolean;
  targetRole?: TargetRole;
}