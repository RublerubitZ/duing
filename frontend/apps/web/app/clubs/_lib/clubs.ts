import type { ClubSummaryRecruitment } from '@duing/types';

export const DIVISIONS = ['문화예술', '사회', '전시창작', '종교', '학술'] as const;
export type Division = (typeof DIVISIONS)[number];

export type ClubScope = '중앙' | '학과';

export type ClubCat =
  | '학술' | '운동' | '음악' | '공연' | '봉사'
  | '문화' | 'IT' | '창업' | '친목';

export type Club = {
  id: number;
  name: string;
  tag: string;
  cat: ClubCat;
  scope: ClubScope;
  division: string | null;
  color: string;
  logoUrl: string | null;
  /** 활성 또는 가장 최근 마감 모집 1건. null 이면 카드에 "모집 없음" 표시. */
  activeRecruitment: ClubSummaryRecruitment | null;
};

export const isDivision = (value: string | null | undefined): value is Division =>
  value !== null && value !== undefined && (DIVISIONS as readonly string[]).includes(value);

export const CAT_COLORS: Record<
  ClubCat,
  { pill: string; bg: string; fg: string; bgValue: string; fgValue: string; emoji: string; num: string }
> = {
  '학술': { pill: 'pill',            bg: 'bg-sage-mist', fg: 'text-ink',       bgValue: 'var(--sage-mist)',  fgValue: 'var(--ink)',      emoji: '📚', num: '01' },
  '운동': { pill: 'pill pill-warm',  bg: 'bg-[#FBEFD7]', fg: 'text-[#8E6620]', bgValue: '#FBEFD7',           fgValue: '#8E6620',         emoji: '⚽',  num: '02' },
  '음악': { pill: 'pill pill-berry', bg: 'bg-[#F6DCE3]', fg: 'text-[#7E2A45]', bgValue: '#F6DCE3',           fgValue: '#7E2A45',         emoji: '🎵', num: '03' },
  '공연': { pill: 'pill pill-coral', bg: 'bg-[#FCE2D9]', fg: 'text-[#9A3F23]', bgValue: '#FCE2D9',           fgValue: '#9A3F23',         emoji: '🎭', num: '04' },
  '봉사': { pill: 'pill pill-sky',   bg: 'bg-[#DDE8F1]', fg: 'text-[#2F557A]', bgValue: '#DDE8F1',           fgValue: '#2F557A',         emoji: '🤝', num: '05' },
  '문화': { pill: 'pill',            bg: 'bg-sage-tint', fg: 'text-ink',       bgValue: 'var(--sage-tint)',  fgValue: 'var(--ink)',      emoji: '🎨', num: '06' },
  'IT':   { pill: 'pill',            bg: 'bg-[#E3E9E1]', fg: 'text-ink-deep',  bgValue: '#E3E9E1',           fgValue: 'var(--ink-deep)', emoji: '💻', num: '07' },
  '창업': { pill: 'pill pill-warm',  bg: 'bg-[#FBEFD7]', fg: 'text-[#8E6620]', bgValue: '#FBEFD7',           fgValue: '#8E6620',         emoji: '🚀', num: '08' },
  '친목': { pill: 'pill',            bg: 'bg-sage-mist', fg: 'text-ink',       bgValue: 'var(--sage-mist)',  fgValue: 'var(--ink)',      emoji: '🍻', num: '09' },
};
