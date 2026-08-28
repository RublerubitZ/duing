import type { ClubCategory } from '@duing/types';

export type HomeCategoryMeta = {
  value: ClubCategory;
  label: string;
  /**
   * 목록 카드에서 동아리명 옆에 붙는 카테고리 라벨 색.
   *
   * <p>장식 틴트가 아니라 <b>본문 텍스트 색</b>이다 — 흰 카드(paper) 위에서 4.5:1 이상이어야 한다
   * (모바일 12px·데스크탑 16px 라 large-text 예외에 해당하지 않는다).
   * 값을 바꿀 때는 대비를 다시 재고 넣을 것. 현재 값은 전부 4.6:1 이상이다.
   */
  labelColor: string;
  /** 카테고리 타일 픽토그램 — 토스페이스 원본 SVG(public/tossface). 파일은 수정하지 않는다. */
  iconSrc: string;
};

/**
 * 홈 카테고리 메타 — ClubCategory enum 8개 값과 1:1. 라벨·색·픽토그램의 단일 출처다.
 * label/URL 은 탐색 페이지(`/clubs?category=…`) 와 정합.
 */
export const HOME_CATEGORIES: ReadonlyArray<HomeCategoryMeta> = [
  { value: 'ACADEMIC',  label: '학술', labelColor: '#1F4A36', iconSrc: '/tossface/u1F4DA.svg' },
  { value: 'CREATION',  label: '창작', labelColor: '#697C3D', iconSrc: '/tossface/u1F4A1.svg' },
  { value: 'ART',       label: '예술', labelColor: '#7D4F87', iconSrc: '/tossface/u1F3B6.svg' },
  { value: 'SPORTS',    label: '운동', labelColor: '#A56632', iconSrc: '/tossface/u1F4AA.svg' },
  { value: 'VOLUNTEER', label: '봉사', labelColor: '#936F2F', iconSrc: '/tossface/u1F91D.svg' },
  { value: 'RELIGION',  label: '종교', labelColor: '#A85E5E', iconSrc: '/tossface/u2764.svg' },
  { value: 'HOBBY',     label: '취미', labelColor: '#4D6B8A', iconSrc: '/tossface/u1FAE7.svg' },
  { value: 'OTHER',     label: '기타', labelColor: '#3E7A73', iconSrc: '/tossface/u1F4AC.svg' },
];

/** enum 으로 바로 찾는 조회용 맵 — 목록 카드처럼 순서가 아니라 값으로 접근하는 쪽이 쓴다. */
export const HOME_CATEGORY_BY_VALUE: Readonly<Record<ClubCategory, HomeCategoryMeta>> =
  Object.fromEntries(HOME_CATEGORIES.map((category) => [category.value, category])) as Record<
    ClubCategory,
    HomeCategoryMeta
  >;
