import type { ClubCategory } from '@duing/types';

export type HomeCategoryMeta = {
  value: ClubCategory;
  label: string;
  index: string;
  accent: string;
  fallbackBg: string;
  imageSrc: string;
  /**
   * 카테고리 타일 픽토그램. 이미지 파일이 아니라 유니코드 이모지 문자를 그대로 쓴다 —
   * 디자인의 픽토그램이 전부 표준 이모지라, 같은 그림을 SVG 20여 개로 커밋할 이유가 없다.
   * 렌더 모양은 OS 이모지 폰트를 따른다.
   */
  emoji: string;
};

/**
 * 홈 Categories 섹션 메타. ClubCategory enum 의 8개 값과 1:1 매핑.
 * label/URL 은 탐색 페이지(`/clubs?category=…`) 와 정합.
 * 이미지는 기존 8장(`/public/categories/cat-0X-*.png`) 을 의미 가까운 enum 으로 임시 매핑.
 */
export const HOME_CATEGORIES: ReadonlyArray<HomeCategoryMeta> = [
  { value: 'ACADEMIC',  label: '학술', index: '01', accent: '#5b7e4d', fallbackBg: '#1e2e1a', imageSrc: '/categories/cat-01-academic.png', emoji: '📚' },
  { value: 'CREATION',  label: '창작', index: '02', accent: '#6b7e3e', fallbackBg: '#1e2614', imageSrc: '/categories/cat-07-culture.png', emoji: '💡' },
  { value: 'ART',       label: '예술', index: '03', accent: '#7d4f87', fallbackBg: '#221428', imageSrc: '/categories/cat-02-music.png', emoji: '🎶' },
  { value: 'SPORTS',    label: '운동', index: '04', accent: '#c47a3b', fallbackBg: '#2e1e0e', imageSrc: '/categories/cat-03-sport.png', emoji: '💪' },
  { value: 'VOLUNTEER', label: '봉사', index: '05', accent: '#b88b3b', fallbackBg: '#28200e', imageSrc: '/categories/cat-06-volunteer.png', emoji: '🤝' },
  { value: 'RELIGION',  label: '종교', index: '06', accent: '#a85e5e', fallbackBg: '#281414', imageSrc: '/categories/cat-05-perform.png', emoji: '❤️' },
  { value: 'HOBBY',     label: '취미', index: '07', accent: '#4d6b8a', fallbackBg: '#121e2a', imageSrc: '/categories/cat-04-it.png', emoji: '🫧' },
  { value: 'OTHER',     label: '기타', index: '08', accent: '#3e7a73', fallbackBg: '#0e2422', imageSrc: '/categories/cat-08-startup.png', emoji: '💬' },
];
