import type { CSSProperties } from 'react';
import { cn } from '@/app/_lib/cn';

import type { Scope, SortKey } from './exploreParams';

// 탐색 화면의 컨트롤·행 클래스와 선택지 — 실제 화면(ClubExplorePage)과 서버 기본 목록(ClubExploreFallback)이 같은
// 값을 쓰게 한곳에 둔다. 서버 기본 목록이 교체 순간 카드·컨트롤을 움직이지 않으려면 실제 화면과 바이트까지 같아야
// 해서다. 서버 컴포넌트가 import 하므로 React·DOM 에 의존하지 않는다(React 는 타입만, document 는 typeof 로 가드한
// 클라이언트 전용 함수에서만 읽는다).

/** 데스크탑 스코프 세그먼트 — 화면 순서와 선택 시 힌트. 라벨은 SCOPE_CLUB_LABEL('전체' 는 그대로). */
export const SCOPE_SEGMENTS: ReadonlyArray<{ key: Scope; hint: string }> = [
  { key: '전체', hint: '모든 동아리' },
  { key: '중앙', hint: '5개 분과' },
  { key: '학과', hint: '단과대 산하' },
];

export const SCOPE_SEGMENT_CLASS = (on: boolean): string =>
  `inline-flex items-center gap-2.5 px-[18px] py-2.5 rounded-[12px] text-sm font-bold border-[1.5px] ${on ? 'bg-ink text-white border-ink' : 'bg-paper text-charcoal-2 border-line'}`;

/** 모바일 카테고리 레일 탭 — 레일 높이를 정한다. */
export const CATEGORY_TAB_CLASS = (on: boolean): string =>
  cn(
    'shrink-0 whitespace-nowrap border-b-[2.5px] py-[11px] text-[14px] font-semibold transition-colors',
    on ? 'border-ink text-ink' : 'border-transparent text-charcoal-3',
  );

/** 찜한 동아리 필터 칩 — 데스크탑 카운트 행의 높이를 정한다(모바일 필터 시트에서도 쓴다). */
export const FAVORITE_CHIP_CLASS = (on: boolean): string =>
  cn(
    'tap-pill inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold',
    on ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-charcoal-2',
  );

/** 모바일 '필터' 버튼 — 모바일 카드 위 행의 높이를 정한다. */
export const FILTER_BUTTON_CLASS =
  'tap-pill inline-flex items-center gap-1.5 rounded-full border border-ink bg-ink px-3 py-1.5 text-[12.5px] font-bold text-white';

export const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'RECOMMENDED', label: '추천순' },
  { value: 'DEADLINE_SOON', label: '마감 임박순' },
  { value: 'ALPHABETICAL', label: '가나다순' },
];

export const SORT_SELECT_CLASS = {
  desktop: 'px-3.5 py-2 bg-paper rounded-[10px] border border-line text-[13.5px] font-semibold text-charcoal-2',
  mobile: 'appearance-none bg-transparent pr-4 text-[12.5px] font-semibold text-charcoal-2',
};

/** 카드 바로 위 행(데스크탑 카운트·찜·정렬 / 모바일 모집 중 카운트·필터·정렬) — 이 여백이 곧 첫 카드 위치다. */
export const LIST_TOOLBAR_CLASS = {
  desktop: 'flex items-center justify-between mb-4',
  mobile: 'flex items-center justify-between px-4 pb-6 pt-4 sm:px-6',
};

/** 데스크탑 카드 그리드 — 카드 최소 210px 를 지키며 컨테이너 폭에 따라 열 수만 줄인다(auto-fill+minmax). */
export const CARD_GRID_CLASS = 'grid grid-cols-[repeat(auto-fill,minmax(min(210px,100%),1fr))] gap-[18px]';

/**
 * 서버 목록(Suspense fallback) 표시 속성 — ClubExploreFallback 최상위에 단다. 실제 화면은 마운트 순간 이것이 문서에
 * 있으면, 첫 화면에서 이미 떠오른 서버 카드를 바꿔 끼우는 교체로 보고 스태거를 다시 재생하지 않는다.
 */
export const SERVER_LIST_ATTRIBUTE = 'data-explore-server-list';

/** 마운트 순간 서버 목록이 문서에 있는지 — 클라이언트에서만 부른다(서버에는 문서가 없어 거짓). */
export function isServerExploreListOnScreen(): boolean {
  return typeof document !== 'undefined' && document.querySelector(`[${SERVER_LIST_ATTRIBUTE}]`) !== null;
}

/**
 * 스태거 재생 시간(ms) — 마지막 카드 지연(8번째부터 280ms) + 재생 200ms = 480ms 에 여유를 둔 값.
 * globals.css 의 .enter-stagger 지연·길이를 바꾸면 함께 바꾼다.
 */
export const STAGGER_WINDOW_MS = 600;

/** 카드 순번을 CSS 쪽 지연 계산(`--i`)으로 넘긴다. 커스텀 프로퍼티는 CSSProperties 에 없어 별도 타입이 필요하다. */
export function staggerStyle(index: number): CSSProperties {
  const style: CSSProperties & { '--i': number } = { '--i': index };
  return style;
}
