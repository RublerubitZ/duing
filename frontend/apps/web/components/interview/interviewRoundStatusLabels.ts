// 면접 라운드 상태 라벨·배지 색상 — RoundStatusBanner 와 ApplicantInterviewScheduleCard 가 공유.
// 중복 정의 금지 원칙(계획서 Self-Review ②)에 따라 이곳에서 단일 정의한다.

import type { InterviewRoundStatus } from '@duing/types';

export const ROUND_STATUS_LABEL: Record<InterviewRoundStatus, string> = {
  DRAFT: '작성 중',
  COLLECTING: '응답 수집 중',
  ASSIGNING: '배정 검토 중',
  SCHEDULED: '확정',
  CANCELLED: '취소',
};

export const ROUND_STATUS_BADGE_CLASS: Record<InterviewRoundStatus, string> = {
  DRAFT: 'bg-paper text-charcoal-2 ring-1 ring-inset ring-line',
  COLLECTING: 'bg-sky/10 text-sky-deep',
  ASSIGNING: 'bg-warm/10 text-warm-deep',
  SCHEDULED: 'bg-sage/10 text-sage-deep',
  CANCELLED: 'bg-coral/10 text-coral-deep',
};
