import { Search } from '@/components/duing/Icon';

/**
 * 모바일 전용 상단 고정 검색 바 (#3).
 *
 * HomeNav(로고·알림·계정 줄) 바로 아래에 sticky 로 붙어, 스크롤해도 검색란이 항상 보인다.
 * 데스크탑(md 이상)은 HomeHero 의 검색 폼이 담당하므로 숨긴다.
 */
export function HomeMobileSearchBar() {
  return (
    // sticky 라 본문이 바 뒤로 지나가 가를 여백이 없고, bg-cream/95 가 페이지 배경과 거의 같은
    // 색이라 하단 헤어라인이 유일한 경계다(하단 탭바의 상단선과 같은 이유로 남긴다).
    <div className="sticky top-0 z-40 border-b border-line bg-cream/95 px-4 py-2.5 backdrop-blur md:hidden">
      <form
        action="/clubs"
        method="get"
        className="mx-auto flex max-w-layout items-center gap-2.5 rounded-xl bg-paper px-3.5 py-2.5 shadow-1 ring-ink/40 focus-within:ring-2"
      >
        <Search className="shrink-0 text-charcoal-3" />
        <input
          type="search"
          name="q"
          placeholder="동아리 이름·키워드 검색"
          aria-label="동아리 검색"
          className="min-w-0 flex-1 border-none bg-transparent text-[15px] text-charcoal outline-none"
        />
      </form>
    </div>
  );
}
