import type { FederationInquiryStatus } from '@duing/types';

// 학생(/me/inquiries)·admin(/admin/inquiries) 양쪽에서 공용으로 쓰는 상태 라벨·뱃지 색.
// admin/reports 의 REPORT_STATUS_LABEL 과 동일한 패턴.
export const INQUIRY_STATUS_LABEL: Record<FederationInquiryStatus, string> = {
  RECEIVED: '접수',
  IN_PROGRESS: '답변중',
  ANSWERED: '답변완료',
  CLOSED: '종료',
};

export const INQUIRY_STATUS_BADGE_CLASS: Record<FederationInquiryStatus, string> = {
  RECEIVED: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-sky-100 text-sky-800',
  ANSWERED: 'bg-emerald-100 text-emerald-800',
  CLOSED: 'bg-zinc-100 text-zinc-600',
};
