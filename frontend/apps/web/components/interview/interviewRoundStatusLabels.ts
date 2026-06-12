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
  DRAFT: 'bg-slate-100 text-slate-700',
  COLLECTING: 'bg-blue-100 text-blue-700',
  ASSIGNING: 'bg-amber-100 text-amber-700',
  SCHEDULED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-rose-100 text-rose-600',
};
