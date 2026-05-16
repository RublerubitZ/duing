'use client';

import { useState } from 'react';
import type { ClubSearchParams } from '@duing/types';
import { useClubListQuery } from '@duing/hooks';
import { ClubCard } from './_components/ClubCard';
import { ClubFilters } from './_components/ClubFilters';

export default function HomePage() {
  const [params, setParams] = useState<ClubSearchParams>({ page: 0, size: 20 });
  const query = useClubListQuery(params);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Du-ing</h1>
        <p className="mt-2 text-slate-600">대구대학교 동아리를 탐색하고 지원하세요.</p>
      </header>

      <section className="mb-8">
        <ClubFilters
          value={params}
          onChange={(next) => setParams({ ...next, page: 0, size: params.size ?? 20 })}
        />
      </section>

      <section>
        {query.isLoading && <p className="text-sm text-slate-500">불러오는 중…</p>}
        {query.error && (
          <p className="text-sm text-rose-600">
            {query.error instanceof Error ? query.error.message : '오류가 발생했습니다.'}
          </p>
        )}
        {query.data && (
          <>
            <p className="mb-3 text-sm text-slate-500">총 {query.data.totalElements}개</p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {query.data.content.map((club) => (
                <li key={club.id}>
                  <ClubCard club={club} />
                </li>
              ))}
            </ul>
            {query.data.totalPages > 1 && (
              <Pagination
                page={params.page ?? 0}
                totalPages={query.data.totalPages}
                onPage={(page) => setParams({ ...params, page })}
              />
            )}
          </>
        )}
      </section>
    </main>
  );
}

type PaginationProps = {
  page: number;
  totalPages: number;
  onPage(page: number): void;
};

function Pagination({ page, totalPages, onPage }: PaginationProps) {
  return (
    <nav className="mt-6 flex justify-center gap-2">
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
        className="rounded-md border px-3 py-1 text-sm disabled:opacity-40"
      >
        이전
      </button>
      <span className="px-3 py-1 text-sm text-slate-600">
        {page + 1} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page + 1 >= totalPages}
        onClick={() => onPage(page + 1)}
        className="rounded-md border px-3 py-1 text-sm disabled:opacity-40"
      >
        다음
      </button>
    </nav>
  );
}