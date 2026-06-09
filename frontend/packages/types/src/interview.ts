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
