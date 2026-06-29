// 공개 활동 피드 — 홈 히어로의 실시간 활동 토스트용. 백엔드 PublicActivityType(6종)과 1:1 매칭.
export type PublicActivityType =
  | 'RECRUIT_OPEN'
  | 'NOTICE_CREATED'
  | 'INTERVIEW_CREATED'
  | 'INTERVIEW_RESULT'
  | 'EVENT_CREATED'
  | 'FEE_OPEN';

export type PublicActivityItem = {
  type: PublicActivityType;
  clubId: number;
  clubName: string;
  // 이벤트 발생 시각(ISO 8601, 백엔드가 절대시각 Instant 로 직렬화).
  occurredAt: string;
};

export type PublicActivityFeed = {
  items: PublicActivityItem[];
};

export type PublicActivityListParams = {
  limit?: number;
};
