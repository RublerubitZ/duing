import type { ActionItemType, RecruitmentDisplayStatus } from '@duing/types';

export const ACTION_ITEM_TYPE_LABEL: Record<ActionItemType, string> = {
  APPLICANTS_AWAITING_REVIEW: '검토 대기 지원자',
  INTERVIEW_ROUND_NEEDED: '면접 라운드 생성 필요',
  INTERVIEW_ROUND_UNCONFIRMED: '면접 일정 미확정',
  INTERVIEW_RESPONSE_UNCOLLECTED: '면접 응답 미수집',
  INTERVIEW_RESULT_PENDING: '면접 결과 미확정',
};

export const RECRUITMENT_DISPLAY_STATUS_LABEL: Record<RecruitmentDisplayStatus, string> = {
  UPCOMING: '예정',
  OPEN: '모집중',
  ALWAYS_OPEN: '상시모집',
  CLOSED: '마감',
};

export const RECRUITMENT_DISPLAY_STATUS_BADGE: Record<RecruitmentDisplayStatus, string> = {
  UPCOMING: 'bg-amber-100 text-amber-700',
  OPEN: 'bg-emerald-100 text-emerald-700',
  ALWAYS_OPEN: 'bg-sky-100 text-sky-700',
  CLOSED: 'bg-slate-100 text-slate-600',
};

/**
 * 만료-OPEN(마감일 경과·수동 마감 전) 칩 색. displayStatus 는 CLOSED 지만 모집은 아직 열려 있어
 * 마감(slate)과 구분하고, 운영진의 처리가 남았음을 알리는 주의색을 쓴다.
 * 라벨은 `RECRUITMENT_UNDER_REVIEW_LABEL`(app/_lib/recruitmentDisplay).
 */
export const RECRUITMENT_UNDER_REVIEW_BADGE = 'bg-amber-100 text-amber-700';
