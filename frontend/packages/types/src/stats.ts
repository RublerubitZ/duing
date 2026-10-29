export type StatsSummary = {
  total: number;
  submitted: number;
  onHold: number;
  interviewPending: number;
  accepted: number;
  rejected: number;
  capacity: number;
  ratio: number;
  /** 가장 오래된 미처리(SUBMITTED) 지원서의 제출 시각. 미처리가 없으면 null, 필드가 없으면 옛 백엔드. */
  oldestPendingSubmittedAt?: string | null;
};

export type StatsDailyPoint = {
  date: string; // ISO yyyy-MM-dd
  submittedCount: number;
};

export type StatsFunnel = {
  submitted: number;
  interviewEntered: number | null;
  accepted: number;
};