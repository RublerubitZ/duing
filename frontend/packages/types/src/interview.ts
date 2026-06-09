// OpenAPI generated schema 는 packages/api 에 위치하지만, 면접 도메인 타입은
// 공유 의도가 강해 packages/types 에 둔다. type-only import 라 런타임/번들 영향 없음.
import type { components } from '@duing/api/openapi-types';

// === Backend 응답 1:1 alias ===
export type InterviewConfig = components['schemas']['InterviewConfigResponse'];
export type ApplicantInterviewSlot = components['schemas']['ApplicantInterviewSlotResponse'];
export type SlotListView = components['schemas']['SlotListView'];
export type ScheduleListView = components['schemas']['ScheduleListView'];
export type AutoAssignResult = components['schemas']['AutoAssignResultResponse'];
export type MatchingCandidatesView = components['schemas']['MatchingCandidatesResponse'];

// Backend PR-IS 신규 — 지원자 가능 슬롯 + 면접 일정
export type MyInterviewAvailabilities = components['schemas']['MyInterviewAvailabilitiesResponse'];

// 면접 수동 배정 UX P0 — `ApplicantDetailResponse.interviewAvailabilities` /
// `assignedSlot` 그리고 stepper UI 의 슬롯 표시에 공통 사용되는 경량 표현.
// capacity/assignedCount 는 의도적으로 포함하지 않는다 (정원 정보는 별도 slots API 로).
//
// NOTE: backend `AvailabilityItemResponse` 는 항상 세 필드 모두 채워 응답하지만
// OpenAPI 스펙에 required 미선언 상태라 openapi-typescript 가 모두 optional 로 생성한다.
// alias 그대로 사용하면 호출부마다 undefined 가드가 강제되므로 도메인 레이어에서
// 명시적으로 non-null narrow 한다. 안전성을 alias 일관성보다 우선.
//
// drift 방지: backend response 가 변경(필드 추가/optional 화)되면 `openapi-types.d.ts`
// 재생성과 함께 본 type 도 직접 갱신해야 한다.
export type AvailabilityItem = {
  slotId: number;
  startTime: string;
  endTime: string;
};

// 면접 일정 상태 — backend enum 미러
export type InterviewScheduleStatus = 'ASSIGNED' | 'CANCELLED';

// === Discriminated union ===
// Backend `MyInterviewScheduleResponse` 는 { assigned: boolean; schedule?: InterviewScheduleDetail; location?: string }
// 형태로 schedule/location 이 optional 이라 narrowing 이 약하다. client 단에서
// assigned 플래그를 기준으로 명확한 union 으로 변환한다.
type AssignedSchedule = NonNullable<components['schemas']['MyInterviewScheduleResponse']['schedule']>;

export type MyInterviewSchedule =
  | { assigned: false; schedule: null; location: null }
  | { assigned: true; schedule: AssignedSchedule; location: string | null };

// === View model (route-local 매핑 헬퍼용) ===
export type ManagementSlotAssignment = {
  scheduleId: number;
  applicationId: number;
  applicantLabel: string;
  status: InterviewScheduleStatus;
};

export type ManagementSlotView = {
  slotId: number;
  startTime: string;
  endTime: string;
  capacity: number;
  availabilityCount?: number;
  // 백엔드 SlotListView.assignedCount — 자동배정 후 채워지는 누적 배정 인원수.
  // `assignments` 가 로드되지 않은 시점(Step 2) 의 카드 표시를 위한 fallback 원천.
  assignedCount?: number;
  assignments?: ManagementSlotAssignment[];
};
