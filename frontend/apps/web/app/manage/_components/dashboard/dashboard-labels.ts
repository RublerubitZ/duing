import type { ActionItemType, OperationItemType } from '@duing/types';
import {
  APPLICATION_AWAITING_REVIEW_LABEL,
  APPLICATION_UNDECIDED_LABEL,
} from '@/app/_constants/application-status';

export const ACTION_ITEM_TYPE_LABEL: Record<ActionItemType, string> = {
  APPLICANTS_AWAITING_REVIEW: `${APPLICATION_AWAITING_REVIEW_LABEL} 지원자`,
  INTERVIEW_ROUND_NEEDED: '면접 라운드 생성 필요',
  INTERVIEW_ROUND_UNCONFIRMED: '면접 일정 미확정',
  INTERVIEW_RESPONSE_UNCOLLECTED: '면접 응답 미수집',
  INTERVIEW_RESULT_PENDING: '면접 결과 미확정',
  CLOSED_RECRUITMENT_UNDECIDED: `마감 모집 결과 ${APPLICATION_UNDECIDED_LABEL}`,
};

export const OPERATION_ITEM_TYPE_LABEL: Record<OperationItemType, string> = {
  JOIN_REQUESTS_PENDING: '가입 요청',
  FEE_OVERDUE: '회비 연체',
  BANK_REVIEW_PENDING: '은행 입금 확인',
  FACILITY_BOOKING_ATTENTION: '시설 예약 결과 확인',
};
