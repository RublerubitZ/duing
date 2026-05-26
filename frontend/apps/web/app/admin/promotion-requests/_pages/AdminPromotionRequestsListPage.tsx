'use client';

import { useState } from 'react';
import type { PromotionRequestStatus } from '@duing/types';
import { useAdminPromotionRequestListQuery } from '@duing/hooks';
import { AdminPromotionRequestsFilterBar } from '../_components/AdminPromotionRequestsFilterBar';
import { AdminPromotionRequestsTable } from '../_components/AdminPromotionRequestsTable';
import { Pagination } from '../../../notices/_components/Pagination';
import { PROMOTION_REQUEST_STATUS_LABEL } from '../_lib/promotionRequestLabels';

const PAGE_SIZE = 20;

const STATUS_TABS: (PromotionRequestStatus | 'ALL')[] = [
  'ALL',
  'PENDING',
  'ACCEPTED',
  'REJECTED',
];

export function AdminPromotionRequestsListPage() {
  const [statusFilter, setStatusFilter] = useState<PromotionRequestStatus | 'ALL'>('ALL');
  const [clubIdInput, setClubIdInput] = useState('');
  const [page, setPage] = useState(0);

  const parsedClubId =
    clubIdInput.trim() !== '' ? Number(clubIdInput) : undefined;

  const listQuery = useAdminPromotionRequestListQuery({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    clubId: parsedClubId,
    page,
    size: PAGE_SIZE,
  });

  const items = listQuery.data?.content ?? [];
  const totalPages = listQuery.data?.totalPages ?? 0;

  const handleStatusTabChange = (next: PromotionRequestStatus | 'ALL') => {
    setStatusFilter(next);
    setPage(0);
  };

  const handleClubIdInputChange = (next: string) => {
    setClubIdInput(next);
    setPage(0);
  };

  return (
    <main className="max-w-layout mx-auto px-10 py-10">
      <header className="mb-6">
        <h1 className="text-[22px] font-bold text-ink">홍보 요청 관리</h1>
        <p className="mt-1 text-[13.5px] text-charcoal-2">
          접수된 동아리 홍보 요청을 확인하고 처리합니다.
        </p>
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
            {tab === 'ALL' ? '전체' : PROMOTION_REQUEST_STATUS_LABEL[tab]}
          </button>
        ))}
      </div>

      <div className="mb-5">
        <AdminPromotionRequestsFilterBar
          status={statusFilter}
          clubIdInput={clubIdInput}
          onStatusChange={handleStatusTabChange}
          onClubIdInputChange={handleClubIdInputChange}
        />
      </div>

      {listQuery.isLoading && (
        <p className="py-12 text-center text-charcoal-3 text-[13px]">불러오는 중…</p>
      )}
      {listQuery.isError && (
        <p className="py-12 text-center text-coral text-[13px]">목록을 불러오지 못했습니다.</p>
      )}
      {listQuery.isSuccess && <AdminPromotionRequestsTable items={items} />}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </main>
  );
}
