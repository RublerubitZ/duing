import type { InterviewConfig, SlotListView } from '@duing/types';

// spec §4 — 운영진 면접 관리 흐름의 현재 단계.
// 클라이언트 상태가 아닌 서버 상태(config + slots) 만으로 결정한다.
export type InterviewStep = 1 | 2 | 3 | 4;

type DeriveArgs = {
  config: InterviewConfig | null;
  slots: SlotListView[];
  // 테스트 결정성을 위해 주입 가능. 기본값은 호출 시점.
  now?: Date;
};

export function deriveInterviewStep({ config, slots, now = new Date() }: DeriveArgs): InterviewStep {
  // Step 1 — 아직 면접 설정 자체가 없는 상태
  if (!config) return 1;

  // Step 4 — 자동 배정 완료 (이후엔 일정 관리 UI)
  if (config.assignmentCompletedAt) return 4;

  // Step 2 — 슬롯이 없으면 무조건 슬롯 관리 단계
  if (slots.length === 0) return 2;

  // deadline 까지는 응답 수집 단계 (Step 2),
  // deadline 이 지나면 자동 배정 가능 단계 (Step 3).
  if (!config.availabilityDeadline) return 2;
  const deadline = new Date(config.availabilityDeadline);
  if (now < deadline) return 2;
  return 3;
}
