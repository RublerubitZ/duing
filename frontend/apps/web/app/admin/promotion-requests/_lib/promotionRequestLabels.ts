import type { PromotionRequestStatus } from '@duing/types';

export const PROMOTION_REQUEST_STATUS_LABEL: Record<PromotionRequestStatus, string> = {
  PENDING: '대기',
  ACCEPTED: '수락',
  REJECTED: '거절',
};

export const PROMOTION_REQUEST_STATUS_BADGE_CLASS: Record<PromotionRequestStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  ACCEPTED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-rose-100 text-rose-700',
};
