import type { CSSProperties } from 'react';
import { cn } from '@/app/_lib/cn';

// FAQ 화면의 검색줄·칩·목록 래퍼 클래스 — 실제 화면(FaqPage)과 서버 기본 목록(FaqPageFallback)이 같은 값을 쓰게 한곳에
// 둔다. 서버 기본 목록이 교체 순간 행을 밀지 않으려면 첫 행 위가 실제 화면과 바이트까지 같아야 해서다. 서버 컴포넌트가
// import 하므로 React·DOM 에 의존하지 않는다(React 는 타입만).

/** 검색줄 컨테이너 — 입력과 검색 버튼을 한 줄에 담는다. */
export const FAQ_SEARCH_BAR_CLASS =
  'mb-5 flex items-center gap-2 rounded-[14px] border border-line bg-paper px-4 py-2.5 focus-within:border-ink md:max-w-[420px]';

export const FAQ_SEARCH_INPUT_CLASS = 'min-w-0 flex-1 border-none bg-transparent text-sm outline-none';

export const FAQ_SEARCH_INPUT_STYLE: CSSProperties = { fontFamily: 'inherit' };

export const FAQ_SEARCH_BUTTON_CLASS = 'btn btn-primary btn-sm';

/** 카테고리 칩 줄 — 모바일 가로 스크롤, 데스크탑 wrap */
export const FAQ_CHIP_ROW_CLASS = 'mb-6 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible';

export const FAQ_CHIP_CLASS = (selected: boolean): string =>
  cn(
    'shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-semibold',
    selected ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-charcoal-2',
  );

/** 행 목록 래퍼 — 실제 화면은 갱신 중 딤 클래스를 cn 으로 덧붙인다. */
export const FAQ_LIST_CLASS = 'flex flex-col gap-3';
