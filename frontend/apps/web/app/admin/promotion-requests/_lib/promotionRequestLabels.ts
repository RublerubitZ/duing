import type { PromotionRequestStatus } from '@duing/types';

export const PROMOTION_REQUEST_STATUS_LABEL: Record<PromotionRequestStatus, string> = {
  PENDING: '대기',
  ACCEPTED: '수락',
  REJECTED: '거절',
};

export const PROMOTION_REQUEST_STATUS_BADGE_CLASS: Record<PromotionRequestStatus, string> = {
  PENDING: 'bg-warm/10 text-warm-deep',
  ACCEPTED: 'bg-sage/10 text-sage-deep',
  REJECTED: 'bg-coral/10 text-coral-deep',
};
