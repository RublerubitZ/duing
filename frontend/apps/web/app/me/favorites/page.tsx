'use client';

import Link from 'next/link';
import { useFavoriteListQuery } from '@duing/hooks';
import { HomeNav } from '@/app/_components/HomeNav';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { FavoriteClubCard } from './_components/FavoriteClubCard';

export default function MyFavoritesPage() {
  const favoriteListQuery = useFavoriteListQuery();

  if (favoriteListQuery.isLoading) {
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

  const favorites = favoriteListQuery.data?.content ?? [];

  if (favorites.length === 0) {
    return (
      <div className="duing min-h-dvh bg-cream">
        <HomeNav slimOnMobile />
        <main className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h1 className="mb-2 text-xl font-semibold">아직 찜한 동아리가 없어요</h1>
          <p className="mb-6 text-sm text-slate-500">
            관심 가는 동아리를 찜해두면 모집 시작·마감 임박을 알려드려요.
          </p>
          <Link
            href="/clubs"
            className="inline-flex h-10 items-center rounded-full bg-slate-900 px-5 text-sm text-white"
          >
            동아리 탐색 →
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
          {favorites.map((favorite) => (
            <FavoriteClubCard key={favorite.clubId} favorite={favorite} />
          ))}
        </ul>
      </main>
    </div>
  );
}