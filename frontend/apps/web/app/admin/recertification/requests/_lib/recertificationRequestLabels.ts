import type { RecertificationStatus } from '@duing/types';

export const RECERTIFICATION_STATUS_LABEL: Record<RecertificationStatus, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '거절',
};

export const RECERTIFICATION_STATUS_BADGE_CLASS: Record<RecertificationStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-rose-100 text-rose-700',
};
