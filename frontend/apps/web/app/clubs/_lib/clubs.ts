import type { ClubSummaryRecruitment } from '@duing/types';

export const DIVISIONS = ['문화예술', '사회', '스포츠레저', '전시창작', '종교', '학술'] as const;
export type Division = (typeof DIVISIONS)[number];

export type ClubScope = '중앙' | '학과';

export type ClubCat =
  | '학술' | '운동' | '음악' | '공연' | '봉사'
  | '창작' | '예술' | 'IT' | '창업' | '친목';

export type Club = {
  id: number;
  name: string;
  /** 한줄 소개 — 미작성이면 null. 카드에서는 플레이스홀더 없이 빈 공간으로 둔다. */
  tagline: string | null;
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

/** 분과 표시 라벨 — 값이 이미 "…분과" 로 끝나면 그대로, 아니면 "분과" 를 붙인다. */
export const formatDivisionLabel = (division: string): string =>
  division.endsWith('분과') ? division : `${division}분과`;

export const CAT_COLORS: Record<
  ClubCat,
  { bg: string; fg: string; text: string; bgValue: string; fgValue: string; emoji: string; num: string }
> = {
  // text: 탐색 카드의 pill 없는 카테고리 텍스트용 — fg 와 달리 카테고리끼리 색이 겹치지 않게 배정
  // (fg 는 파스텔 배경 위 조합이라 학술·창작·친목이 전부 잉크로 겹친다). 색상값은 기존 pill 팔레트 재사용.
  '학술': { bg: 'bg-sage-mist', fg: 'text-ink',       text: 'text-ink',       bgValue: 'var(--sage-mist)',  fgValue: 'var(--ink)',      emoji: '📚', num: '01' },
  '운동': { bg: 'bg-[#FBEFD7]', fg: 'text-[#8E6620]', text: 'text-[#8E6620]', bgValue: '#FBEFD7',           fgValue: '#8E6620',         emoji: '⚽',  num: '02' },
  '음악': { bg: 'bg-[#F6DCE3]', fg: 'text-[#7E2A45]', text: 'text-[#7E2A45]', bgValue: '#F6DCE3',           fgValue: '#7E2A45',         emoji: '🎵', num: '03' },
  '공연': { bg: 'bg-[#FCE2D9]', fg: 'text-[#9A3F23]', text: 'text-[#9A3F23]', bgValue: '#FCE2D9',           fgValue: '#9A3F23',         emoji: '🎭', num: '04' },
  '봉사': { bg: 'bg-[#DDE8F1]', fg: 'text-[#2F557A]', text: 'text-[#2F557A]', bgValue: '#DDE8F1',           fgValue: '#2F557A',         emoji: '🤝', num: '05' },
  '창작': { bg: 'bg-sage-tint', fg: 'text-ink',       text: 'text-[#7E2A45]', bgValue: 'var(--sage-tint)',  fgValue: 'var(--ink)',      emoji: '🎨', num: '06' },
  // 예술: 홈 카테고리(homeCategories)·인기 동아리(FeaturedClubs) 의 ART 액센트(#7d4f87) 와 맞춘다.
  '예술': { bg: 'bg-[#EFE2F1]', fg: 'text-[#7d4f87]', text: 'text-[#7d4f87]', bgValue: '#EFE2F1',           fgValue: '#7d4f87',         emoji: '🎭', num: '07' },
  'IT':   { bg: 'bg-[#E3E9E1]', fg: 'text-ink-deep',  text: 'text-ink-deep',  bgValue: '#E3E9E1',           fgValue: 'var(--ink-deep)', emoji: '💻', num: '08' },
  '창업': { bg: 'bg-[#FBEFD7]', fg: 'text-[#8E6620]', text: 'text-[#8E6620]', bgValue: '#FBEFD7',           fgValue: '#8E6620',         emoji: '🚀', num: '09' },
  '친목': { bg: 'bg-sage-mist', fg: 'text-ink',       text: 'text-[#9A3F23]', bgValue: 'var(--sage-mist)',  fgValue: 'var(--ink)',      emoji: '🍻', num: '10' },
};
