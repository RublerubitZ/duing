import { Search } from '@/components/duing/Icon';

/**
 * 모바일 전용 검색 바.
 *
 * <p>시안에서는 히어로 카피 바로 아래, 배너 위에 놓인다. 그래서 히어로 다음 형제로 배치하되
 * {@code sticky top-0} 을 유지해, 처음에는 시안 위치에 그대로 있다가 그 지점을 지나 스크롤하면
 * 상단에 붙는다 — 스크롤 중에도 검색에 닿을 수 있는 기존 동작을 잃지 않는다.
 *
 * <p>구분선을 두지 않는 이유: 히어로 흐름 안에 있을 때 선이 보이면 시안과 어긋난다. 배경이
 * 페이지와 같은 크림이라 흐름 안에서는 크롬이 보이지 않고, 상단에 붙었을 때만 아래로 지나가는
 * 콘텐츠를 가린다(backdrop-blur 가 경계를 만든다).
 *
 * <p>데스크탑(md 이상)은 HomeHero 의 검색 폼이 담당하므로 숨긴다.
 */
export function HomeMobileSearchBar() {
  return (
        // pt-3 은 상단에 붙었을 때 알약이 화면 끝에 닿지 않게 하는 여백이다 — 흐름 안에서의
    // 간격은 히어로 카피의 아래 여백을 그만큼 줄여 시안과 같게 맞춰 뒀다.
    <div className="sticky top-0 z-40 bg-cream/95 px-4 pb-3 pt-3 backdrop-blur md:hidden">
      <form
        action="/clubs"
        method="get"
        className="mx-auto flex max-w-layout items-center gap-2 rounded-[10px] bg-paper py-1.5 pl-3.5 pr-1.5 shadow-1 ring-ink/40 focus-within:ring-2"
      >
        <input
          type="search"
          name="q"
          placeholder="찾으시는 동아리를 검색해주세요."
          aria-label="동아리 검색"
          className="min-w-0 flex-1 border-none bg-transparent py-1.5 text-[13px] tracking-tightest text-charcoal outline-none placeholder:text-charcoal-3"
        />
        <button
          type="submit"
          className="flex shrink-0 items-center gap-1.5 rounded-[10px] bg-ink-deep px-3.5 py-2 text-[13px] font-semibold tracking-tightest text-cream transition active:scale-95 motion-reduce:transition-none"
        >
          검색
          <Search className="h-[17px] w-[17px]" />
        </button>
      </form>
    </div>
  );
}
