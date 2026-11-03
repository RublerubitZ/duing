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
  /**
   * 지금 이 모집을 삭제할 수 있는지 — 서버 삭제 가드와 같은 판정(마감됨·지원서 0건·처리되지 않은 가입 요청 없음).
   * 지원서는 탈퇴한 지원자 것도 세므로 total 이 0 이어도 false 일 수 있다. 필드가 없으면 옛 백엔드.
   */
  deletable?: boolean;
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