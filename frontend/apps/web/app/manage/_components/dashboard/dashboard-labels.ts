import type { ActionItemType } from '@duing/types';

export const ACTION_ITEM_TYPE_LABEL: Record<ActionItemType, string> = {
  APPLICANTS_AWAITING_REVIEW: '검토 대기 지원자',
  INTERVIEW_ROUND_NEEDED: '면접 라운드 생성 필요',
  INTERVIEW_ROUND_UNCONFIRMED: '면접 일정 미확정',
  INTERVIEW_RESPONSE_UNCOLLECTED: '면접 응답 미수집',
  INTERVIEW_RESULT_PENDING: '면접 결과 미확정',
};
