// 탐색(/clubs) 로딩 스켈레톤 — Suspense fallback(초기 HTML, 프리렌더 직후)과
// ClubExplorePage 의 React Query 로딩 상태 양쪽에서 쓴다. 서버 렌더 가능한 순수 마크업이라
// 'use client' 가 필요 없다. 색은 기존 토큰(bg-paper·border-line·bg-graysoft)만 사용한다.

const DESKTOP_CARD_COUNT = 8;
const MOBILE_ROW_COUNT = 6;

function SkeletonBar({ className }: { className: string }) {
  return <div className={`rounded-full bg-graysoft ${className}`} />;
}

type ClubListSkeletonItemsProps = {
  /** grid = 데스크탑 ClubCard 그리드 근사, list = 모바일 ClubListItem 행 근사 */
  variant: 'grid' | 'list';
};

/**
 * 카드 영역 부분 스켈레톤 — 호출부(데스크탑 그리드 / 모바일 리스트)가 이미 반응형 breakpoint 로
 * 분기돼 있으므로(ClubExplorePage 의 `hidden md:block` / `md:hidden` 패턴), 이 컴포넌트는 그 안에서
 * 쓰일 variant 하나만 렌더한다 — 두 변형을 항상 함께 렌더하면 숨겨진 쪽이 중복으로 쌓인다.
 */
export function ClubListSkeletonItems({ variant }: ClubListSkeletonItemsProps) {
  if (variant === 'grid') {
    return (
      // 실제 카드 그리드(ClubExplorePage)와 동일한 auto-fill 트랙 — 열 수 불일치로 스켈레톤→실카드 점프 방지.
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(210px,100%),1fr))] gap-[18px]">
        {Array.from({ length: DESKTOP_CARD_COUNT }).map((_, index) => (
          <div
            key={index}
            data-testid="club-explore-skeleton-desktop-card"
            className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-paper p-[18px]"
          >
            <div className="h-16 w-16 rounded-[16px] bg-graysoft" />
            <SkeletonBar className="h-4 w-3/4" />
            <SkeletonBar className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: MOBILE_ROW_COUNT }).map((_, index) => (
        <div
          key={index}
          data-testid="club-explore-skeleton-mobile-row"
          className="flex items-center gap-3 rounded-2xl border border-line bg-paper p-3.5"
        >
          <div className="h-14 w-14 shrink-0 rounded-2xl bg-graysoft" />
          <div className="flex-1 space-y-2">
            <SkeletonBar className="h-4 w-2/3" />
            <SkeletonBar className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 전체 스켈레톤 — `<Suspense fallback>` 전용. 초기 HTML(프리렌더·하이드레이션 전)에 콘텐츠 영역이
 * 통째로 백지가 되는 문제를 막는다. ClubExplorePage 실제 컨테이너의 패딩/최대폭을 근사한다
 * (픽셀 퍼펙트 불필요) — 상단 검색/필터 스트립 자리 + 카드 영역(ClubListSkeletonItems 재사용).
 */
export function ClubExploreSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="동아리 목록 불러오는 중" className="animate-pulse motion-reduce:animate-none">
      {/* 데스크탑 (md+) */}
      <div className="hidden md:block">
        <section className="bg-cream pt-page-top pb-7">
          <div className="max-w-layout mx-auto space-y-4 px-4 sm:px-6 md:px-10">
            <SkeletonBar className="h-8 w-72" />
            <div className="h-12 w-[360px] rounded-[14px] bg-graysoft" />
          </div>
        </section>
        <section className="pt-6 pb-20">
          <div className="max-w-layout mx-auto grid grid-cols-[256px_1fr] gap-8 px-4 sm:px-6 md:px-10">
            <div className="h-[420px] rounded-[18px] border border-line bg-paper" />
            <ClubListSkeletonItems variant="grid" />
          </div>
        </section>
      </div>

      {/* 모바일 (<md) */}
      <div className="md:hidden">
        {/* 본문(ClubExplorePage)이 제목 블록과 sticky 검색 바를 분리해 두었다.
            구조뿐 아니라 높이도 본문 실측에 맞춰야 로딩이 끝나는 순간 검색창이 튀지 않는다 —
            제목 섹션 내부 50.2px(아이브로우 16.5 + mt-1 4 + h1 29.7), 검색 폼 46px. */}
        <section className="bg-cream px-4 pt-page-top pb-4 sm:px-6">
          <SkeletonBar className="h-4 w-16" />
          <SkeletonBar className="mt-1.5 h-7 w-32" />
        </section>
        <div className="sticky top-0 z-40 border-b border-line bg-cream/95 px-4 py-2.5 backdrop-blur sm:px-6">
          <div className="h-[46px] w-full rounded-[14px] bg-graysoft" />
        </div>
        <div className="px-4 pb-8 pt-4 sm:px-6">
          <ClubListSkeletonItems variant="list" />
        </div>
      </div>
    </div>
  );
}
