'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAdminClubMemberHistoryQuery } from '@duing/hooks';
import { Pagination } from '../../../../../notices/_components/Pagination';
import { AdminClubMemberHistoryTable } from '../_components/AdminClubMemberHistoryTable';

const PAGE_SIZE = 20;

type Props = {
  clubId: number;
};

export function AdminClubMemberHistoryPage({ clubId }: Props) {
  const [page, setPage] = useState(0);

  const historyQuery = useAdminClubMemberHistoryQuery(clubId, { page, size: PAGE_SIZE });

  const items = historyQuery.data?.content ?? [];
  const totalPages = historyQuery.data?.totalPages ?? 0;

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6 flex items-center gap-3">
        <Link href="/admin/clubs" className="text-[13px] text-charcoal-2 hover:text-ink">
          ← 동아리 목록
        </Link>
        <h1 className="text-[22px] font-bold text-ink">동아리 권한 변경 이력</h1>
        <span className="text-[13px] text-charcoal-3">(동아리 ID: {clubId})</span>
      </header>

      {historyQuery.isLoading && (
        <p className="py-12 text-center text-charcoal-3 text-[13px]">불러오는 중…</p>
      )}
      {historyQuery.isError && (
        <p className="py-12 text-center text-coral text-[13px]">이력을 불러오지 못했습니다.</p>
      )}
      {historyQuery.isSuccess && <AdminClubMemberHistoryTable items={items} />}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </main>
  );
}
