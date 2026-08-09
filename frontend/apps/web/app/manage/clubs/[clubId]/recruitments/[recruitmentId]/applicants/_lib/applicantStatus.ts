import type { ApplicationStatus } from '@duing/types';

/** 상태 배지 색 — 표·카드가 공유하는 단일 출처. 화면마다 같은 상태가 다른 색이면 안 된다. */
export const STATUS_BADGE_CLASS: Record<ApplicationStatus, string> = {
  SUBMITTED: 'bg-sky-100 text-sky-700',
  ON_HOLD: 'bg-amber-100 text-amber-700',
  INTERVIEW_PENDING: 'bg-purple-100 text-purple-700',
  ACCEPTED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-rose-100 text-rose-700',
};

/**
 * 모바일 카드 왼쪽 4px 띠 — 배지와 같은 색 계열이며 새 색 어휘를 만들지 않는다.
 * 배지를 대체하지 않는 보조 신호라 접근성 트리에서는 제외한다(색 단독 전달 금지).
 */
export const STATUS_STRIPE_CLASS: Record<ApplicationStatus, string> = {
  SUBMITTED: 'border-l-sky-400',
  ON_HOLD: 'border-l-amber-400',
  INTERVIEW_PENDING: 'border-l-purple-400',
  ACCEPTED: 'border-l-emerald-500',
  REJECTED: 'border-l-rose-400',
};
