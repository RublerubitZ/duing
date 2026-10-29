// 운영자 대시보드 v1 뷰모델 — 백엔드 DTO가 아니라 FE에서 조합한 파생 타입.
// 라우팅 경로(href)는 담지 않는다(식별자만). 링크는 web 레이어에서 toRoute로 생성.
import type { BookingStatus } from './facility';

export type ActionItemType =
  | 'APPLICANTS_AWAITING_REVIEW'
  | 'INTERVIEW_ROUND_NEEDED'
  | 'INTERVIEW_ROUND_UNCONFIRMED'
  | 'INTERVIEW_RESPONSE_UNCOLLECTED'
  | 'INTERVIEW_RESULT_PENDING'
  | 'CLOSED_RECRUITMENT_UNDECIDED';

export type ActionItem = {
  type: ActionItemType;
  recruitmentId: number;
  recruitmentTitle: string;
  roundId?: number;
  roundTitle?: string;
  /** 검토 대기 인원, 미응답 인원 등 맥락 수치 */
  count?: number;
  /** 마감/기한까지 남은 일수. 음수면 경과 */
  daysLeft?: number;
  /** 가장 오래된 미처리 지원서부터 지난 KST 날짜 수 — APPLICANTS_AWAITING_REVIEW 에만, 미처리가 있을 때만 */
  pendingDays?: number;
};

export type TodayScheduleKind = 'INTERVIEW' | 'EVENT';

export type TodayScheduleItem = {
  kind: TodayScheduleKind;
  title: string;
  /** ISO datetime */
  startAt: string;
  endAt: string | null;
  location: string | null;
  /** INTERVIEW 딥링크용 */
  recruitmentId?: number;
  roundId?: number;
  /** INTERVIEW 슬롯 식별자 — 키 충돌 방지용 */
  slotId?: number;
  /** EVENT 식별자(v1 비링크) */
  eventId?: number;
};

export type ApplicantStatusTotals = {
  total: number;
  submitted: number;
  onHold: number;
  interviewPending: number;
  accepted: number;
  rejected: number;
  capacity: number;
};

// 운영 업무(모집 외) — 홈 업무 큐의 가입 요청·회비 연체·은행 입금 검토·시설 예약 결과. ActionItem 처럼 식별자·수치만 담고 href 는 web 이 만든다.
export type OperationItemType =
  | 'JOIN_REQUESTS_PENDING'
  | 'FEE_OVERDUE'
  | 'BANK_REVIEW_PENDING'
  | 'FACILITY_BOOKING_ATTENTION';

export type FacilityAttentionStatus = Extract<BookingStatus, 'REJECTED' | 'CONFLICT'>;

export type OperationItem =
  | { type: 'JOIN_REQUESTS_PENDING'; count: number; /** 가장 이른 대기 요청의 절대시각 */ oldestRequestedAt: string }
  | { type: 'FEE_OVERDUE'; /** 연체 청구 건수(인원 아님) */ count: number }
  | { type: 'BANK_REVIEW_PENDING'; count: number }
  | {
      type: 'FACILITY_BOOKING_ATTENTION';
      bookingId: number;
      roomName: string;
      /** yyyy-MM-dd */
      date: string;
      /** HH:mm:ss — 표시는 web bookingTimeLabel 경유 */
      startTime: string;
      endTime: string;
      status: FacilityAttentionStatus;
    };

export type DashboardTask =
  | { source: 'RECRUITMENT'; item: ActionItem }
  | { source: 'OPERATION'; item: OperationItem };

export type DashboardTaskGroupKey = 'NOW' | 'WAITING' | 'INFO';

export type DashboardTaskGroup = { key: DashboardTaskGroupKey; tasks: DashboardTask[] };
