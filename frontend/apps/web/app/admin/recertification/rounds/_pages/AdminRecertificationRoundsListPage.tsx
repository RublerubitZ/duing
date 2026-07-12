'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { RoundStatus } from '@duing/types';
import { useAdminRecertificationRoundListQuery } from '@duing/hooks';
import { Pagination } from '@/components/Pagination';
import { toRoute } from '../../../../_lib/route';
import { AdminRecertificationRoundsFilterBar } from '../_components/AdminRecertificationRoundsFilterBar';
import { AdminRecertificationRoundsTable } from '../_components/AdminRecertificationRoundsTable';
import { ROUND_STATUS_LABEL } from '../_lib/recertificationRoundLabels';

const PAGE_SIZE = 20;

const STATUS_TABS: (RoundStatus | 'ALL')[] = ['ALL', 'OPEN', 'CLOSED'];

export function AdminRecertificationRoundsListPage() {
  const [statusFilter, setStatusFilter] = useState<RoundStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(0);

  const listQuery = useAdminRecertificationRoundListQuery({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    page,
    size: PAGE_SIZE,
  });

  const items = listQuery.data?.content ?? [];
  const totalPages = listQuery.data?.totalPages ?? 0;

  const handleStatusTabChange = (next: RoundStatus | 'ALL') => {
    setStatusFilter(next);
    setPage(0);
  };

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-ink">재인증 라운드 관리</h1>
          <p className="mt-1 text-[13.5px] text-charcoal-2">
            재인증 라운드를 개설하고 진행 상태를 관리합니다.
          </p>
        </div>
        <Link
          href={toRoute('/admin/recertification/rounds/new')}
          className="px-4 py-2 rounded-md bg-ink text-paper text-[13px] font-semibold hover:opacity-90"
        >
          라운드 개설
        </Link>
      </header>

      <div className="mb-4 flex gap-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => handleStatusTabChange(tab)}
            className={`px-3 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
              statusFilter === tab
                ? 'bg-ink text-paper'
                : 'text-charcoal-2 hover:bg-graysoft'
            }`}
          >
            {tab === 'ALL' ? '전체' : ROUND_STATUS_LABEL[tab]}
          </button>
        ))}
      </div>

      <div className="mb-5">
        <AdminRecertificationRoundsFilterBar
          status={statusFilter}
          onStatusChange={handleStatusTabChange}
        />
      </div>

      {listQuery.isLoading && (
        <p className="py-12 text-center text-charcoal-3 text-[13px]">불러오는 중…</p>
      )}
      {listQuery.isError && (
        <p className="py-12 text-center text-coral text-[13px]">목록을 불러오지 못했습니다.</p>
      )}
      {listQuery.isSuccess && <AdminRecertificationRoundsTable items={items} />}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </main>
  );
}
