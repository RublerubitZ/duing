import type { ApplicationStatus, RecruitmentStatus } from '@duing/types';

// Spec §5-4 — ApplicationStatus 라벨 매트릭스 (운영진/지원자 시점 분리).
//
// 운영진 라벨 — list / 상세 / 타임라인 등 운영진 UI 전반에서 사용.
//   ACCEPTED / REJECTED 는 "최종" prefix 없이 짧게 노출 (운영진은 시점이 명확).
//
// 지원자 라벨 — my-page 등 지원자 시점 UI 에서 사용.
//   ACCEPTED / REJECTED 에 "최종" prefix 를 붙여 결과의 무게감을 전달.
//   ON_HOLD 는 운영진 내부 관리 상태라 지원자에게 노출하지 않는다 — SUBMITTED 와 같은 표기.
//   INTERVIEW_PENDING 의 sub-state 분기는 ApplicationStepper 가 처리하므로
//   여기서는 단순히 "면접 대상" 으로 둔다.
//
// 표 (spec 참조):
// | Enum              | 운영진 라벨 | 지원자 라벨 |
// | SUBMITTED         | 지원 완료   | 심사 중     |
// | ON_HOLD           | 보류        | 심사 중     |
// | INTERVIEW_PENDING | 면접 대상   | 면접 대상   |
// | ACCEPTED          | 합격        | 최종 합격   |
// | REJECTED          | 불합격      | 최종 불합격 |

export const APPLICATION_STATUS_OPERATOR_LABEL: Record<ApplicationStatus, string> = {
  SUBMITTED: '지원 완료',
  ON_HOLD: '보류',
  INTERVIEW_PENDING: '면접 대상',
  ACCEPTED: '합격',
  REJECTED: '불합격',
};

export const APPLICATION_STATUS_APPLICANT_LABEL: Record<ApplicationStatus, string> = {
  SUBMITTED: '심사 중',
  ON_HOLD: '심사 중', // 보류는 지원자에게 노출하지 않는다 — SUBMITTED 와 동일 표기 (스펙 §1-1)
  INTERVIEW_PENDING: '면접 대상',
  ACCEPTED: '최종 합격',
  REJECTED: '최종 불합격',
};

// 기존 호출자(모두 운영진 UI) backward compat alias.
// 신규 코드는 audience 가 명시적인 OPERATOR / APPLICANT 상수를 직접 import 한다.
export const APPLICATION_STATUS_LABEL = APPLICATION_STATUS_OPERATOR_LABEL;

// ─────────────────────────────────────────────────────────────────────────────
// 모집 마감 축
//
// 마감(RecruitmentStatus)은 지원 상태(ApplicationStatus)와 직교한다 — 같은 SUBMITTED 라도
// 모집이 열려 있으면 "심사 중"이지만 마감됐으면 "결과 없이 종료"다. 그래서 위 Record 를
// 늘리지 않고 여기서 파생한다. 지원자 대면 표면은 전부 이 함수들을 경유한다.
// ─────────────────────────────────────────────────────────────────────────────

/** 마감된 모집에서 결과가 정해지지 않은 지원에 쓰는 표기. 이후 결과가 나올 수 있으므로 종결을 단정하지 않는다. */
export const APPLICATION_CLOSED_WITHOUT_RESULT_LABEL = '결과 미발표';

/** 합격·불합격 — 결과가 확정된 지원. 술어로 두어 소비처가 단언 없이 좁힐 수 있게 한다. */
export type TerminalApplicationStatus = Extract<ApplicationStatus, 'ACCEPTED' | 'REJECTED'>;

export function isTerminalApplicationStatus(
  status: ApplicationStatus,
): status is TerminalApplicationStatus {
  return status === 'ACCEPTED' || status === 'REJECTED';
}

/**
 * 모집이 마감됐는지. 필드를 아직 안 내려주는 백엔드에서는 undefined 가 오는데, 이때는
 * "마감 아님"으로 읽어 배포 전환기에 화면이 통째로 뒤바뀌지 않게 한다(fail-open).
 * 알려진 CLOSED 만 숨기고 not-OPEN 으로 판정하지 않는 것이 핵심이다.
 */
export function isRecruitmentClosed(recruitmentStatus: RecruitmentStatus | undefined): boolean {
  return recruitmentStatus === 'CLOSED';
}

/**
 * 결과 없이 종료된 지원 — 모집은 마감됐는데 합격·불합격이 정해지지 않은 조합.
 * 지원자에게 "심사 중"으로 보이면 거짓이고, 면접 안내·철회도 더 이상 성립하지 않는다.
 */
export function isClosedWithoutResult(
  status: ApplicationStatus,
  recruitmentStatus: RecruitmentStatus | undefined,
): boolean {
  return isRecruitmentClosed(recruitmentStatus) && !isTerminalApplicationStatus(status);
}

/** 지원자에게 보여줄 상태 라벨. 결과 없이 종료된 지원은 진행 표기 대신 종료 사실을 알린다. */
export function applicantStatusLabel(
  status: ApplicationStatus,
  recruitmentStatus: RecruitmentStatus | undefined,
): string {
  return isClosedWithoutResult(status, recruitmentStatus)
    ? APPLICATION_CLOSED_WITHOUT_RESULT_LABEL
    : APPLICATION_STATUS_APPLICANT_LABEL[status];
}
