'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFavoriteListQuery } from '@duing/hooks';
import { HomeNav } from '@/app/_components/HomeNav';
import { cn } from '@/app/_lib/cn';
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
  const favoriteList = favoriteListQuery.data;
  const totalPages = favoriteList?.totalPages ?? 0;
  // 다시 받는 중에는 판단하지 않는다(옛 캐시로 튕기지 않게) — 무효 표시만 된 옛 쪽 캐시가 먼저 나와 지금 페이지가 범위 밖처럼 보일 수 있다.
  // 이전 쪽 자리표시·재시도 대기 중 멈춤('paused')도 받는 중이다 — 그래서 isFetching 이 아니라 fetchStatus 로 본다.
  const settledTotalPages = favoriteListQuery.fetchStatus !== 'idle' ? 0 : totalPages;
  // 실패한 뒤 진짜 목록 없이 다시 받는 중 — 이 마운트가 이 쪽 키에서 결과(실패)를 받은 뒤다. 쪽을 옮기면 기준이 새 쪽으로 잡혀
  // (isFetchedAfterMount 거짓) 처음 조회·쪽 이동과 갈린다. 2쪽 이후의 실패면 다시 받는 동안 data 가 이전 쪽 자리표시라 그것도 본다(#1756).
  // isFetching 이 아니라 fetchStatus — 재시도 대기 뒤 탭이 가려져 있으면 멈추고('paused') 그동안 isFetching 은 거짓이다.
  const isRetrying =
    favoriteListQuery.fetchStatus !== 'idle' &&
    favoriteListQuery.isFetchedAfterMount &&
    (favoriteList === undefined || favoriteListQuery.isPlaceholderData);
  // 이전 쪽 자리표시가 빈 쪽이면(보정으로 옮긴 쪽의 캐시가 이미 지워졌다) 빈 격자 대신 로딩으로 둔다.
  const isEmptyPlaceholder = favoriteListQuery.isPlaceholderData && favoriteList?.content.length === 0;

  // 이 화면의 하트로 마지막 페이지의 마지막 찜을 풀면 지금 페이지가 사라진다 — 페이지 버튼은 총 1쪽이면 그려지지 않아 빈 쪽에
  // 갇히므로 마지막 유효 페이지로 옮긴다(FaqSearchMissPanel 전례). 판단할 값이 없는 동안(데이터 없음·다시 받는 중 = 0)은 건드리지 않는다.
  useEffect(() => {
    if (settledTotalPages > 0 && page >= settledTotalPages) setPage(settledTotalPages - 1);
  }, [settledTotalPages, page]);

  // 정적 HTML·하이드레이션 프레임은 조회가 꺼져 있다 — 그대로 두면 "아직 찜한 동아리가 없어요"가 실린다(#1500). 하이드레이션 전에는 로딩으로 둔다.
  // isLoading 이 아니라 isPending — 데이터 없이 받는 중도 아닌 조회(꺼진 조회)가 아래 실패 분기로 떨어지지 않게.
  if (!hydrated || (!isRetrying && (favoriteListQuery.isPending || isEmptyPlaceholder))) {
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

  // 받은 목록 없이 조회가 끝났다 = 실패(첫 조회, 또는 페이지를 바꾼 직후 — 새 페이지엔 아직 데이터가 없다). "없어요"는 거짓이다(#1579).
  // 실패 뒤 다시 받는 동안에도 이 안내를 두고 버튼만 잠근다 — 누른 버튼이 사라지면 포커스가 문서로 빠진다(#1756).
  if (isRetrying || favoriteList === undefined) {
    return (
      <div className="duing min-h-dvh bg-cream">
        <HomeNav slimOnMobile />
        <main className="mx-auto max-w-4xl px-6 py-10">
          <h1 className="mb-4 text-2xl font-bold">찜한 동아리</h1>
          <ListLoadError
            message="찜한 동아리를 불러오지 못했어요."
            onRetry={() => void favoriteListQuery.refetch()}
            isRetrying={isRetrying}
          />
          {/* 쪽을 옮긴 직후의 실패엔 페이지 버튼이 없다 — 돌아갈 길을 둔다. 다시 받는 중에도 누를 수 있다. */}
          {page > 0 && (
            <div className="mt-3 text-center">
              <button type="button" onClick={() => setPage(0)} className="btn btn-ghost btn-sm">
                첫 페이지로
              </button>
            </div>
          )}
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
        <ul
          // 쪽을 옮기는 동안은 이전 쪽이 남는다 — 흐림으로 갱신 중임을 알린다. 각 카드는 자기 clubId 로 동작해 잠그지 않는다(ClubExplorePage 전례).
          aria-busy={favoriteListQuery.isPlaceholderData}
          className={cn(
            'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 transition-opacity',
            favoriteListQuery.isPlaceholderData && 'opacity-60',
          )}
        >
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
