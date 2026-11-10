import type { ReportReasonCode, ReportStatus, ReportTargetType } from '@duing/types';

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  PENDING: '대기',
  RESOLVED: '해결',
  DISMISSED: '기각',
};

export const REPORT_STATUS_BADGE_CLASS: Record<ReportStatus, string> = {
  PENDING: 'bg-warm/10 text-warm-deep',
  RESOLVED: 'bg-sage/10 text-sage-deep',
  DISMISSED: 'bg-graysoft text-charcoal-2',
};

export const REPORT_TARGET_TYPE_LABEL: Record<ReportTargetType, string> = {
  CLUB: '동아리',
  RECRUITMENT: '모집공고',
};

export const REPORT_REASON_LABEL: Record<ReportReasonCode, string> = {
  SPAM: '스팸/도배',
  FRAUD: '사기/허위',
  INAPPROPRIATE: '부적절한 내용',
  IMPERSONATION: '사칭',
  OTHER: '기타',
};
