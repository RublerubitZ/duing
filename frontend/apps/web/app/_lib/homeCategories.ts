import type { ClubCategory } from '@duing/types';

export type HomeCategoryMeta = {
  value: ClubCategory;
  label: string;
  index: string;
  accent: string;
  fallbackBg: string;
  imageSrc: string;
  /**
   * 카테고리 타일 픽토그램 — 시안이 쓰는 토스페이스 원본 SVG 경로(public/tossface).
   * 웹폰트로 얹지 않는 이유는 그쪽 라이선스가 아니라 무게다 — 컬러 이모지 폰트라 여기 8개를
   * 폰트로 받으면 서브셋 6개, 약 5.9MB 다(같은 그림이 SVG 로는 합계 9KB).
   * 파일은 원본 그대로 두고 수정하지 않는다 — public/tossface/README.txt 참고.
   */
  iconSrc: string;
};

/**
 * 홈 Categories 섹션 메타. ClubCategory enum 의 8개 값과 1:1 매핑.
 * label/URL 은 탐색 페이지(`/clubs?category=…`) 와 정합.
 * 이미지는 기존 8장(`/public/categories/cat-0X-*.png`) 을 의미 가까운 enum 으로 임시 매핑.
 */
export const HOME_CATEGORIES: ReadonlyArray<HomeCategoryMeta> = [
  { value: 'ACADEMIC',  label: '학술', index: '01', accent: '#5b7e4d', fallbackBg: '#1e2e1a', imageSrc: '/categories/cat-01-academic.png', iconSrc: '/tossface/u1F4DA.svg' },
  { value: 'CREATION',  label: '창작', index: '02', accent: '#6b7e3e', fallbackBg: '#1e2614', imageSrc: '/categories/cat-07-culture.png', iconSrc: '/tossface/u1F4A1.svg' },
  { value: 'ART',       label: '예술', index: '03', accent: '#7d4f87', fallbackBg: '#221428', imageSrc: '/categories/cat-02-music.png', iconSrc: '/tossface/u1F3B6.svg' },
  { value: 'SPORTS',    label: '운동', index: '04', accent: '#c47a3b', fallbackBg: '#2e1e0e', imageSrc: '/categories/cat-03-sport.png', iconSrc: '/tossface/u1F4AA.svg' },
  { value: 'VOLUNTEER', label: '봉사', index: '05', accent: '#b88b3b', fallbackBg: '#28200e', imageSrc: '/categories/cat-06-volunteer.png', iconSrc: '/tossface/u1F91D.svg' },
  { value: 'RELIGION',  label: '종교', index: '06', accent: '#a85e5e', fallbackBg: '#281414', imageSrc: '/categories/cat-05-perform.png', iconSrc: '/tossface/u2764.svg' },
  { value: 'HOBBY',     label: '취미', index: '07', accent: '#4d6b8a', fallbackBg: '#121e2a', imageSrc: '/categories/cat-04-it.png', iconSrc: '/tossface/u1FAE7.svg' },
  { value: 'OTHER',     label: '기타', index: '08', accent: '#3e7a73', fallbackBg: '#0e2422', imageSrc: '/categories/cat-08-startup.png', iconSrc: '/tossface/u1F4AC.svg' },
];
