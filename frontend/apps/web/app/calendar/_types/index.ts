export type EventKind = 'deadline' | 'fair' | 'show' | 'meet' | 'volunteer' | 'notice';
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
  title: string;
  time: string;
  place: string;
  club: string | null;
  accent: AccentKey;
  span?: number;
  description?: string;
  contact?: string;
};
