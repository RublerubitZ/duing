import type { ApplicationStatus } from '@duing/types';

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  SUBMITTED: '제출됨',
  UNDER_REVIEW: '서류 검토중',
  INTERVIEW_PENDING: '면접 대기',
  ACCEPTED: '합격',
  REJECTED: '불합격',
};
