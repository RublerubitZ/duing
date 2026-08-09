import type { ApplicationStatus } from '@duing/types';

/**
 * 모바일 카드 왼쪽 4px 띠 — 배지와 같은 색 계열을 쓰되 원색(토큰 본값)으로 얇게 긋는다.
 * 배지를 대체하지 않는 보조 신호라 접근성 트리에서는 제외한다(색 단독 전달 금지).
 * 배지 색은 `APPLICATION_STATUS_BADGE_CLASS`(공용 상수)가 단일 출처다.
 */
export const STATUS_STRIPE_CLASS: Record<ApplicationStatus, string> = {
  SUBMITTED: 'border-l-sky',
  ON_HOLD: 'border-l-warm',
  INTERVIEW_PENDING: 'border-l-berry',
  ACCEPTED: 'border-l-ink',
  REJECTED: 'border-l-coral',
};
