// 운영자 대시보드 v1 뷰모델 — 백엔드 DTO가 아니라 FE에서 조합한 파생 타입.
// 라우팅 경로(href)는 담지 않는다(식별자만). 링크는 web 레이어에서 toRoute로 생성.

export type ActionItemType =
  | 'APPLICANTS_AWAITING_REVIEW'
  | 'INTERVIEW_ROUND_NEEDED'
  | 'INTERVIEW_ROUND_UNCONFIRMED'
  | 'INTERVIEW_RESPONSE_UNCOLLECTED'
  | 'INTERVIEW_RESULT_PENDING';

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
