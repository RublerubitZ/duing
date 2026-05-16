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
    UNDER_REVIEW: useInterview ? ['INTERVIEW_PENDING'] : ['ACCEPTED', 'REJECTED'],
    INTERVIEW_PENDING: ['ACCEPTED', 'REJECTED'],
    ACCEPTED: [],
    REJECTED: [],
  };
  return TRANSITIONS[currentStatus];
}