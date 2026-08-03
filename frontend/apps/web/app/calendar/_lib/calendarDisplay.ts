import type { AccentKey, AccentStyle, EventKind } from '../_types';

// 캘린더 화면의 표시 상수 — 그리드·상세 패널·Upcoming(카드/타임라인)이 공유한다.
// 값은 CalendarPage 에서 그대로 옮겨온 것이며 변경하지 않는다.

export const ACCENT: Record<AccentKey, AccentStyle> = {
  ink:    { dot: 'var(--ink)',      bg: 'var(--sage-mist)', fg: 'var(--ink-deep)' },
  coral:  { dot: '#D97757',         bg: '#FCE2D9',          fg: '#9A3F23'         },
  warm:   { dot: '#E8B968',         bg: '#FBEFD7',          fg: '#8E6620'         },
  berry:  { dot: '#B65672',         bg: '#F6DCE3',          fg: '#7E2A45'         },
  sage:   { dot: 'var(--sage)',     bg: 'var(--sage-tint)', fg: 'var(--ink-deep)' },
  sky:    { dot: '#6A95B8',         bg: '#DDE8F1',          fg: '#2F557A'         },
};

export const KIND_LABEL: Record<EventKind, string> = {
  system:   '행사·일정',
  deadline: '모집 마감',
  event:    '동아리 일정',
};

export const KIND_ORDER: EventKind[] = ['system', 'deadline', 'event'];

export const KIND_ACCENT: Record<EventKind, AccentKey> = {
  system:   'warm',
  deadline: 'coral',
  event:    'sage',
};
