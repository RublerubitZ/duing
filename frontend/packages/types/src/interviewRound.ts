// 면접 라운드 (재설계) — 백엔드 DTO 1:1 수동 정의.
// OpenAPI codegen 산출물은 커밋하지 않으므로(재생성은 live 서버 필요) 직접 정의한다.
// 각 타입의 출처: backend/src/main/java/com/duing/domain/interview/controller/dto/
// drift 방지: 백엔드 DTO 변경 시 본 파일도 직접 갱신 필요.
//
// NOTE: College / Grade / ApplicationStatus 는 user.ts / application.ts 에 이미 동일값으로
// 정의되어 있어 import 하여 재사용한다 (중복 export 방지).

import type { College } from './user';
import type { Grade } from './user';
import type { ApplicationStatus } from './application';

// Re-export so callers importing from interviewRound can access these types
// without reaching into unrelated domain files.
export type { College, Grade, ApplicationStatus as CandidateApplicationStatus };

// = RoundStatus enum (backend/src/main/java/com/duing/domain/interview/entity/RoundStatus.java)
export type InterviewRoundStatus = 'DRAFT' | 'COLLECTING' | 'ASSIGNING' | 'SCHEDULED' | 'CANCELLED';

// = RoundMemberStatus enum (backend/src/main/java/com/duing/domain/interview/entity/RoundMemberStatus.java)
export type InterviewRoundMemberStatus = 'INVITED' | 'RESPONDED' | 'NO_AVAILABLE_SLOT' | 'ASSIGNED' | 'EXCLUDED';

// = RoundCandidateResponse (BE#2)
// backend: controller/dto/response/RoundCandidateResponse.java
// LocalDateTime → string, Long → number, enum → union literal
export type InterviewRoundCandidate = {
  applicationId: number;
  userId: number;
  userName: string;
  studentId: string;
  college: College;
  major: string;
  grade: Grade;
  status: ApplicationStatus;
  submittedAt: string;
};

// = RoundSummaryResponse (BE#6)
// backend: controller/dto/response/RoundSummaryResponse.java
export type InterviewRoundSummary = {
  roundId: number;
  title: string;
  status: InterviewRoundStatus;
  availabilityDeadline: string | null;
  location: string | null;
  totalMemberCount: number;
  respondedMemberCount: number;
};

// = RoundDetailResponse.Counts (nested record)
// backend: controller/dto/response/RoundDetailResponse.java — inner record Counts
export type InterviewRoundDetailCounts = {
  totalMemberCount: number;
  invitedCount: number;
  respondedCount: number;
  noAvailableSlotCount: number;
  assignedCount: number;
  excludedCount: number;
  unrespondedCount: number;
};

// = RoundDetailResponse.Member (nested record)
// backend: controller/dto/response/RoundDetailResponse.java — inner record Member
export type InterviewRoundDetailMember = {
  memberId: number;
  applicationId: number;
  userName: string;
  studentId: string;
  status: InterviewRoundMemberStatus;
  unresponded: boolean;
  alternativeAvailabilityText: string | null;
  selectedSlotCount: number;
  assignedSlotId: number | null;
};

// = RoundDetailResponse.Slot (nested record)
// backend: controller/dto/response/RoundDetailResponse.java — inner record Slot
export type InterviewRoundDetailSlot = {
  slotId: number;
  startTime: string;
  endTime: string;
  capacity: number;
  selectedCount: number;
  assignedCount: number;
};

// = RoundDetailResponse (BE#6 — counts·members·slots 중첩 포함)
// backend: controller/dto/response/RoundDetailResponse.java
export type InterviewRoundDetail = {
  roundId: number;
  title: string;
  status: InterviewRoundStatus;
  availabilityDeadline: string | null;
  location: string | null;
  requestSequence: number;
  deadlinePassed: boolean;
  counts: InterviewRoundDetailCounts;
  members: InterviewRoundDetailMember[];
  slots: InterviewRoundDetailSlot[];
};

// = CreateInterviewRoundRequest (BE#3)
// backend: controller/dto/request/CreateInterviewRoundRequest.java
// availabilityDeadline, location — DRAFT 중 생략 가능 (nullable)
export type CreateInterviewRoundPayload = {
  title: string;
  availabilityDeadline?: string;
  location?: string;
  applicationIds: number[];
};

// = CreateInterviewRoundResponse (BE#3)
// backend: controller/dto/response/CreateInterviewRoundResponse.java
export type CreateInterviewRoundResult = {
  roundId: number;
};

// = CreateInterviewSlotsRequest.SlotItem (nested record)
// backend: controller/dto/request/CreateInterviewSlotsRequest.java
export type CreateRoundSlotItem = {
  startTime: string;
  endTime: string;
  capacity: number;
};

// = CreateInterviewSlotsRequest (BE#4)
// backend: controller/dto/request/CreateInterviewSlotsRequest.java
export type CreateRoundSlotsPayload = {
  slots: CreateRoundSlotItem[];
};

// = CreateInterviewSlotsResponse (BE#4)
// backend: controller/dto/response/CreateInterviewSlotsResponse.java
// reinvitedMemberCount: int (백엔드) → number (TS)
export type CreateRoundSlotsResult = {
  createdSlotIds: number[];
  reinvitedMemberCount: number;
};

// = UpdateInterviewRoundRequest (BE#12 — 부분 수정, null/undefined = 무변경)
// backend: controller/dto/request/UpdateInterviewRoundRequest.java
export type UpdateInterviewRoundPayload = {
  title?: string;
  location?: string;
  availabilityDeadline?: string;
};

// = AvailabilityRequestResponse (BE#5)
// backend: controller/dto/response/AvailabilityRequestResponse.java
// notifiedMemberCount: int (백엔드) → number (TS)
export type AvailabilityRequestResult = {
  notifiedMemberCount: number;
};

// = AutoAssignResponse (BE#11 assignment — controller/dto/response/AutoAssignResponse.java)
// Note: interview.ts 의 구 AutoAssignResult(old 면접 관리 — Task 5 철거 예정)와 구분을 위해
// RoundAutoAssignResult 로 명명. Task 5 철거 후 AutoAssignResult 로 rename 가능.
export type RoundAutoAssignResult = {
  assignedMemberCount: number;
  unassignedMemberCount: number;
};

// = ConfirmRoundResponse (BE#11 assignment — controller/dto/response/ConfirmRoundResponse.java)
export type RoundConfirmResult = {
  assignedMemberCount: number;
  excludedMemberCount: number;
};

// = UnresolvedMembersResponse.UnrespondedMember (nested record)
// backend: controller/dto/response/UnresolvedMembersResponse.java
export type UnrespondedMember = {
  applicationId: number;
  applicantName: string;
  memberStatus: InterviewRoundMemberStatus;
};

// = UnresolvedMembersResponse.RespondedUnassignedMember (nested record)
export type RespondedUnassignedMember = {
  applicationId: number;
  applicantName: string;
  selectedSlotIds: number[];
};

// = UnresolvedMembersResponse (BE#11 — 409 data payload)
// backend: controller/dto/response/UnresolvedMembersResponse.java
// code 리터럴은 백엔드 CODE 상수 1:1
export type UnresolvedMembersPayload = {
  code: 'INTERVIEW_ROUND_HAS_UNRESOLVED_MEMBERS';
  unresponded: UnrespondedMember[];
  respondedUnassigned: RespondedUnassignedMember[];
};

/**
 * 확정 409 payload 타입 가드.
 * ApiError.payload 가 UnresolvedMembersPayload 인지 code 리터럴 + 배열 존재로 판별한다.
 * `as` 단언 없이 `in` 연산자 narrowing 으로 unknown 을 좁힌다.
 */
export function isUnresolvedMembersPayload(value: unknown): value is UnresolvedMembersPayload {
  if (typeof value !== 'object' || value === null) return false;
  if (!('code' in value) || value.code !== 'INTERVIEW_ROUND_HAS_UNRESOLVED_MEMBERS') return false;
  if (!('unresponded' in value) || !Array.isArray(value.unresponded)) return false;
  if (!('respondedUnassigned' in value) || !Array.isArray(value.respondedUnassigned)) return false;
  return true;
}

// = UpdateInterviewSlotRequest (BE#11 slot — controller/dto/request/UpdateInterviewSlotRequest.java)
export type UpdateInterviewSlotPayload = {
  startTime?: string;
  endTime?: string;
  capacity?: number;
};
