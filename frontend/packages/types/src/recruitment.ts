export type RecruitmentStatus = 'OPEN' | 'CLOSED';
export type ApplicationMode = 'SELF' | 'EXTERNAL';
export type TargetRole = 'MEMBER' | 'OFFICER';

export type RecruitmentSummary = {
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
};

export type RecruitmentDetail = RecruitmentSummary & {
  content: string | null;
  questions: string[];
};

export type CreateRecruitmentPayload = {
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
};

export type UpdateRecruitmentPayload = {
  title?: string;
  content?: string | null;
  startDate?: string;
  endDate?: string;
  capacity?: number;
  useInterview?: boolean;
  questions?: string[];
};