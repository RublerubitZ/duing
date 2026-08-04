import type { ApplicationStatus } from '@duing/types';

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
