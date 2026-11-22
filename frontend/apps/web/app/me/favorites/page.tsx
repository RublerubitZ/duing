'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFavoriteListQuery } from '@duing/hooks';
import { HomeNav } from '@/app/_components/HomeNav';
import { useHydrated } from '@/app/_lib/useHydrated';
import { ListLoadError } from '@/app/me/_components/ListLoadError';
import { Pagination } from '@/components/Pagination';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { FavoriteClubCard } from './_components/FavoriteClubCard';

// 마이페이지·설정의 찜 숫자 조회(0, 20)와 같은 크기 — 첫 페이지 캐시를 함께 쓴다.
const PAGE_SIZE = 20;

export default function MyFavoritesPage() {
  // 페이지는 컴포넌트 상태다(MyInquiriesPage 와 같음) — 주소에 두지 않는다.
  const [page, setPage] = useState(0);
  const favoriteListQuery = useFavoriteListQuery(page, PAGE_SIZE);
  const hydrated = useHydrated();
  const totalPages = favoriteListQuery.data?.totalPages ?? 0;

  // 이 화면의 하트로 마지막 페이지의 마지막 찜을 풀면 지금 페이지가 사라진다 — 페이지 버튼은 총 1쪽이면 그려지지 않아 빈 쪽에
  // 갇히므로 마지막 유효 페이지로 옮긴다(FaqSearchMissPanel 전례). 데이터가 없는 동안(totalPages 0)은 건드리지 않는다.
  useEffect(() => {
    if (totalPages > 0 && page >= totalPages) setPage(totalPages - 1);
  }, [totalPages, page]);

  // 정적 HTML·하이드레이션 프레임은 조회가 꺼져 있다 — 그대로 두면 "아직 찜한 동아리가 없어요"가 실린다(#1500). 하이드레이션 전에는 로딩으로 둔다.
  // isLoading 이 아니라 isPending — 데이터 없이 받는 중도 아닌 조회(꺼진 조회)가 아래 실패 분기로 떨어지지 않게.
  if (!hydrated || favoriteListQuery.isPending) {
    // PC 에는 이 페이지들만 상단바가 없었다. 레이아웃이 아니라 페이지에서 감싼다 —
    // MyPage 의 100dvh 래퍼와 충돌하기 때문(SettingsPage 패턴).
    return (
      <div className="duing min-h-dvh bg-cream">
        <HomeNav slimOnMobile />
        <main className="mx-auto max-w-4xl px-6 py-10">
          <ListRowsSkeleton rows={4} rowClassName="h-[96px] rounded-xl" label="찜한 동아리 불러오는 중" />
        </main>
      </div>
    );
  }

  const favoriteList = favoriteListQuery.data;

  // 받은 목록 없이 조회가 끝났다 = 실패(첫 조회, 또는 페이지를 바꾼 직후 — 새 페이지엔 아직 데이터가 없다). "없어요"는 거짓이다(#1579).
  if (favoriteList === undefined) {
    return (
      <div className="duing min-h-dvh bg-cream">
        <HomeNav slimOnMobile />
        <main className="mx-auto max-w-4xl px-6 py-10">
          <h1 className="mb-4 text-2xl font-bold">찜한 동아리</h1>
          <ListLoadError message="찜한 동아리를 불러오지 못했어요." onRetry={() => void favoriteListQuery.refetch()} />
        </main>
      </div>
    );
  }

  // 빈 판정은 전체 수로 — 찜을 풀어 지금 페이지가 범위 밖이 된 한 프레임(이 쪽은 비었지만 전체는 남음)에 거짓 빈 안내를 그리지 않는다.
  if (favoriteList.totalElements === 0) {
    return (
      <div className="duing min-h-dvh bg-cream">
        <HomeNav slimOnMobile />
        <main className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h1 className="mb-2 text-xl font-semibold">아직 찜한 동아리가 없어요</h1>
          <p className="mb-6 text-sm text-charcoal-3">
            관심 가는 동아리를 찜해두면 모집 시작·마감 임박을 알려드려요.
          </p>
          <Link
            href="/clubs"
            className="btn btn-primary h-10 rounded-full py-0"
          >
            동아리 탐색
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="duing min-h-dvh bg-cream">
      <HomeNav slimOnMobile />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-4 text-2xl font-bold">찜한 동아리</h1>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {favoriteList.content.map((favorite) => (
            <FavoriteClubCard key={favorite.clubId} favorite={favorite} />
          ))}
        </ul>
        {/* 목록이 화면의 첫 내용이라 페이지를 바꾸면 화면 맨 위로 간다(paginationScroll). 총 1쪽이면 그리지 않는다. */}
        <Pagination page={page} totalPages={favoriteList.totalPages} onChange={setPage} ariaLabel="찜한 동아리 페이지" />
      </main>
    </div>
  );
}
