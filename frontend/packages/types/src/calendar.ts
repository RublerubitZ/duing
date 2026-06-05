export type EventKind = 'system' | 'deadline' | 'event';
export type EventSource = 'global' | 'recruitment' | 'clubEvent';
export type AccentKey = 'ink' | 'coral' | 'warm' | 'berry' | 'sage' | 'sky';

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
};
