import type { BillingType, FeeStatus } from '@duing/types';

const BILLING_TYPE_LABEL: Record<BillingType, string> = {
  MONTHLY: '월 회비',
  SEMESTER: '학기 회비',
  YEARLY: '연 회비',
  ONE_TIME: '일회성',
};

const FEE_STATUS_LABEL: Record<FeeStatus, string> = {
  PENDING: '납부대기',
  PAID: '납부완료',
  PARTIAL_PAID: '부분납부',
  OVERDUE: '연체',
  CANCELLED: '취소됨',
};

export const billingTypeLabel = (type: BillingType): string => BILLING_TYPE_LABEL[type];

export const feeStatusLabel = (status: FeeStatus): string => FEE_STATUS_LABEL[status];

export const formatWon = (amount: number): string => `${amount.toLocaleString('ko-KR')}원`;
