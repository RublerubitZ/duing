export type EventKind = 'system' | 'deadline' | 'event';
export type EventSource = 'global' | 'recruitment' | 'clubEvent';
/** muted 는 색이 아니라 상태다 — 지난 일정을 회색으로 눕혀 진행 중인 일정과 한눈에 갈라 준다. */
export type AccentKey = 'ink' | 'coral' | 'warm' | 'berry' | 'sage' | 'sky' | 'muted';

export type AccentStyle = {
  dot: string;
  bg: string;
  fg: string;
};

export type CalEvent = {
  id: string;
  date: string;
  kind: EventKind;
  sourceType: EventSource;
  sourceId: number;
  sourceClubId?: number;
  title: string;
  time: string;
  place: string;
  club: string | null;
  accent: AccentKey;
  span?: number;
  description?: string;
  /**
   * 출처가 이미 끝나 더 이상 행동할 수 없는 일정(마감된 모집 등). 일정 자체는 달력에 남기되
   * 상세 모달이 지원 같은 행동 동선 대신 맥락 화면으로 보내도록 하는 근거다.
   */
  sourceClosed?: boolean;
};
