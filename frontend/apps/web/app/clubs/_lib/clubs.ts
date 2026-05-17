export const DIVISIONS = ['문화예술', '사회', '전시창작', '종교', '학술'] as const;
export type Division = (typeof DIVISIONS)[number];

export type ClubScope = '중앙' | '과';

export type ClubCat =
  | '학술' | '운동' | '음악' | '공연' | '봉사'
  | '문화' | 'IT' | '창업' | '친목';

/**
 * UI 카드 상태. 백엔드 ClubSummary.status(PENDING/ACTIVE/INACTIVE) 와는 별개로
 * 모집 상태(open/upcoming/closed)를 표시한다. 현재는 단순 매핑이며,
 * 추후 Recruitment 도메인이 카드 응답에 포함되면 정확한 값으로 대체된다.
 */
export type ClubStatus = 'open' | 'upcoming' | 'closed';

export type Club = {
  id: number;
  name: string;
  tag: string;
  cat: ClubCat;
  scope: ClubScope;
  division: Division | null;
  status: ClubStatus;
  gen: string;
  spots: string;
  deadline: string;
  openDate?: string;
  color: string;
  logoUrl: string | null;
};

export const isDivision = (value: string | null | undefined): value is Division =>
  value !== null && value !== undefined && (DIVISIONS as readonly string[]).includes(value);

export const CAT_COLORS: Record<
  ClubCat,
  { pill: string; bg: string; fg: string; emoji: string; num: string }
> = {
  '학술': { pill: 'pill',            bg: 'bg-sage-mist', fg: 'text-ink',       emoji: '📚', num: '01' },
  '운동': { pill: 'pill pill-warm',  bg: 'bg-[#FBEFD7]', fg: 'text-[#8E6620]', emoji: '⚽', num: '02' },
  '음악': { pill: 'pill pill-berry', bg: 'bg-[#F6DCE3]', fg: 'text-[#7E2A45]', emoji: '🎵', num: '03' },
  '공연': { pill: 'pill pill-coral', bg: 'bg-[#FCE2D9]', fg: 'text-[#9A3F23]', emoji: '🎭', num: '04' },
  '봉사': { pill: 'pill pill-sky',   bg: 'bg-[#DDE8F1]', fg: 'text-[#2F557A]', emoji: '🤝', num: '05' },
  '문화': { pill: 'pill',            bg: 'bg-sage-tint', fg: 'text-ink',       emoji: '🎨', num: '06' },
  'IT':   { pill: 'pill',            bg: 'bg-[#E3E9E1]', fg: 'text-ink-deep',  emoji: '💻', num: '07' },
  '창업': { pill: 'pill pill-warm',  bg: 'bg-[#FBEFD7]', fg: 'text-[#8E6620]', emoji: '🚀', num: '08' },
  '친목': { pill: 'pill',            bg: 'bg-sage-mist', fg: 'text-ink',       emoji: '🍻', num: '09' },
};