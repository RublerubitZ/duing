'use client';

import { useState } from 'react';
import type { NoticeCategory } from '@duing/types';
import { useNoticeListQuery } from '@duing/hooks';
import { ExploreNav } from '../_components/ExploreNav';
import { NoticeCard } from './_components/NoticeCard';
import { NoticeFilterBar } from './_components/NoticeFilterBar';
import { NoticeEmptyState } from './_components/NoticeEmptyState';
import { Pagination } from './_components/Pagination';

const PAGE_SIZE = 12;

export default function NoticesPage() {
  const [category, setCategory] = useState<NoticeCategory | 'ALL'>('ALL');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);

  const listQuery = useNoticeListQuery({
    category: category === 'ALL' ? undefined : category,
    keyword: keyword || undefined,
    page,
    size: PAGE_SIZE,
  });

  const items = listQuery.data?.content ?? [];
  const totalPages = listQuery.data?.totalPages ?? 0;
  const hasFilter = category !== 'ALL' || keyword.length > 0;

  return (
    <>
      <ExploreNav active="공지" />
      <main className="max-w-layout mx-auto px-10 py-10">
        <header className="mb-8">
          <h1 className="text-[22px] font-bold text-ink">공지</h1>
          <p className="mt-1 text-[13.5px] text-charcoal-2">
            축제·박람회·지원사업·공모전 등 총동연 공지를 모아봅니다.
          </p>
        </header>

        <NoticeFilterBar
          selectedCategory={category}
          keyword={keywordInput}
          onCategoryChange={(next) => { setCategory(next); setPage(0); }}
          onKeywordChange={setKeywordInput}
          onKeywordSubmit={() => { setKeyword(keywordInput); setPage(0); }}
        />

        <section className="mt-8">
          {listQuery.isLoading && (
            <p className="py-12 text-center text-charcoal-3 text-[13px]">불러오는 중…</p>
          )}
          {listQuery.isError && (
            <p className="py-12 text-center text-red-500 text-[13px]">공지를 불러오지 못했습니다.</p>
          )}
          {listQuery.isSuccess && items.length === 0 && (
            <NoticeEmptyState hasFilter={hasFilter} />
          )}
          {listQuery.isSuccess && items.length > 0 && (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {items.map((notice) => (
                <li key={notice.id}>
                  <NoticeCard notice={notice} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </main>
    </>
  );
}
