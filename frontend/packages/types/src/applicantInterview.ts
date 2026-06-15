// 지원자 면접 진행 — 백엔드 BE#7/8 DTO 1:1 수동 정의 (regen 보류 — FE#2 전례).
// 출처: backend/src/main/java/com/duing/domain/interview/controller/dto/response/ApplicantInterviewResponse.java
//       backend/src/main/java/com/duing/domain/interview/controller/dto/request/RespondInterviewAvailabilityRequest.java
// drift 방지: 백엔드 DTO 변경 시 본 파일도 직접 갱신 필요.

// = ApplicantInterviewPhase enum (backend/.../service/dto/query/ApplicantInterviewPhase.java)
export type ApplicantInterviewPhase =
  | 'NOT_APPLICABLE'
  | 'DOCUMENT_REVIEW'
  | 'WAITING_ROUND'
  | 'WAITING_NEXT_ROUND'
  | 'AVAILABILITY_REQUESTED'
  | 'AVAILABILITY_CLOSED'
  | 'RESPONDED'
  | 'NO_SLOT_REPORTED'
  | 'SCHEDULING'
  | 'SCHEDULED';

// = ApplicantInterviewResponse.SelectableSlot (nested record)
// backend: controller/dto/response/ApplicantInterviewResponse.java — inner record SelectableSlot
// Long → number, LocalDateTime → string, boolean → boolean
export type ApplicantInterviewSelectableSlot = {
  slotId: number;
  startTime: string;
  endTime: string;
  selected: boolean;
};

// = ApplicantInterviewResponse.ScheduledInterview (nested record)
// backend: controller/dto/response/ApplicantInterviewResponse.java — inner record ScheduledInterview
// LocalDateTime → string, nullable location
export type ApplicantInterviewScheduled = {
  startTime: string;
  endTime: string;
  location: string | null;
};

// = ApplicantInterviewResponse (BE#7)
// backend: controller/dto/response/ApplicantInterviewResponse.java
// LocalDateTime → string, nullable 필드 → | null
export type ApplicantInterviewView = {
  phase: ApplicantInterviewPhase;
  availabilityDeadline: string | null;
  slots: ApplicantInterviewSelectableSlot[] | null;
  myAlternativeText: string | null;
  scheduledInterview: ApplicantInterviewScheduled | null;
};

// = RespondInterviewAvailabilityRequest (BE#8)
// backend: controller/dto/request/RespondInterviewAvailabilityRequest.java
// XOR 계약: slotIds 경로와 noAvailableSlot 경로 중 하나만 — 위반은 서버가 400 으로 거부.
// 호출부가 discriminated union 으로 올바른 경로를 보장한다.
export type RespondAvailabilityPayload =
  | { slotIds: number[] }
  | { noAvailableSlot: true; alternativeText?: string };
