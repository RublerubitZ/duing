import type { ApplicationStatus } from '@duing/types';

/** SUBMITTED 은 전이 목표가 될 수 없으므로 다음 상태는 항상 이 타입 */
type NextStatus = Exclude<ApplicationStatus, 'SUBMITTED'>;

/**
 * 각 상태에서 허용된 다음 상태 배열.
 * 백엔드 도메인 머신과 동일한 규칙으로 정의한다.
 *
 * useInterview: 해당 모집에 면접 단계가 있는지 여부.
 *   - true → UNDER_REVIEW 에서 INTERVIEW_PENDING 으로만 전이 가능
 *   - false → UNDER_REVIEW 에서 바로 ACCEPTED / REJECTED 가능
 */
export function getStatusTransitions(
  currentStatus: ApplicationStatus,
  useInterview: boolean,
): NextStatus[] {
  const TRANSITIONS: Record<ApplicationStatus, NextStatus[]> = {
    SUBMITTED: ['UNDER_REVIEW'],
    UNDER_REVIEW: useInterview
      ? ['INTERVIEW_PENDING', 'REJECTED']
      : ['ACCEPTED', 'REJECTED'],
    INTERVIEW_PENDING: ['ACCEPTED', 'REJECTED'],
    ACCEPTED: [],
    REJECTED: [],
  };
  return TRANSITIONS[currentStatus];
}

/**
 * 상세 페이지 StatusActionBar 에서 사용.
 * getStatusTransitions 와 동일한 로직 — 단일 진실 보장을 위해 위임.
 */
export function allowedTransitionsFrom(
  status: ApplicationStatus,
  useInterview: boolean,
): NextStatus[] {
  return getStatusTransitions(status, useInterview);
}