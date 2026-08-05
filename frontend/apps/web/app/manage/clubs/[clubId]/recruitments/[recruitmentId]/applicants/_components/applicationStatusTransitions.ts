import type { ApplicationStatus } from '@duing/types';

/** SUBMITTED 은 전이 목표가 될 수 없으므로 다음 상태는 항상 이 타입 */
type NextStatus = Exclude<ApplicationStatus, 'SUBMITTED'>;

/**
 * 각 상태에서 허용된 다음 상태 배열.
 * 백엔드 Application.isAllowedTransition 과 완전 동형으로 정의한다.
 *
 * useInterview: 해당 모집에 면접 단계가 있는지 여부.
 *   - true → SUBMITTED / ON_HOLD 에서 INTERVIEW_PENDING 으로만 합격 경로가 열린다
 *   - false → SUBMITTED / ON_HOLD 에서 바로 ACCEPTED 가능 (면접 단계 없음)
 *
 * ON_HOLD 는 운영진 내부 관리 상태로, 지원자에게는 SUBMITTED 와 동일하게 노출된다.
 */
export function getStatusTransitions(
  currentStatus: ApplicationStatus,
  useInterview: boolean,
): NextStatus[] {
  const TRANSITIONS: Record<ApplicationStatus, NextStatus[]> = {
    SUBMITTED: useInterview
      ? ['INTERVIEW_PENDING', 'ON_HOLD', 'REJECTED']
      : ['ACCEPTED', 'ON_HOLD', 'REJECTED'],
    ON_HOLD: useInterview
      ? ['INTERVIEW_PENDING', 'REJECTED']
      : ['ACCEPTED', 'REJECTED'],
    INTERVIEW_PENDING: ['ACCEPTED', 'REJECTED'],
    ACCEPTED: [],
    REJECTED: [],
  };
  return TRANSITIONS[currentStatus];
}

/**
 * 마감(CLOSED)된 모집에서 허용되는 전이 — 남은 지원서의 최종 결과 확정뿐이다.
 * 백엔드 Application.isClosedFinalizingTransition 과 동형: 아직 결과가 없는 지원만, 최종 결과로만.
 *
 * 면접 모집이라도 면접 단계를 요구하지 않는다 — 마감 후에는 라운드를 열 수 없어 면접 단계를 강제하면
 * 불합격밖에 줄 수 없기 때문이다. 그래서 useInterview 를 받지 않는다.
 */
export function closedRecruitmentTransitionsFrom(status: ApplicationStatus): NextStatus[] {
  const alreadyDecided = status === 'ACCEPTED' || status === 'REJECTED';
  return alreadyDecided ? [] : ['ACCEPTED', 'REJECTED'];
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