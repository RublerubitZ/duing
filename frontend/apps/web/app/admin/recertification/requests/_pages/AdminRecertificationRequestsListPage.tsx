'use client';

import { useState } from 'react';
import type { RecertificationStatus } from '@duing/types';
import {
  useAdminRecertificationRequestListQuery,
  useAdminRecertificationRoundListQuery,
} from '@duing/hooks';
import { Pagination } from '@/components/Pagination';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { AdminRecertificationRequestsFilterBar } from '../_components/AdminRecertificationRequestsFilterBar';
import { AdminRecertificationRequestsTable } from '../_components/AdminRecertificationRequestsTable';
import { RECERTIFICATION_STATUS_LABEL } from '../_lib/recertificationRequestLabels';

const PAGE_SIZE = 20;

const STATUS_TABS: (RecertificationStatus | 'ALL')[] = [
  'ALL',
  'PENDING',
  'APPROVED',
  'REJECTED',
];

export function AdminRecertificationRequestsListPage() {
  const [statusFilter, setStatusFilter] = useState<RecertificationStatus | 'ALL'>('ALL');
  const [roundIdInput, setRoundIdInput] = useState('');
  const [page, setPage] = useState(0);

  const parsedRoundId =
    roundIdInput.trim() !== '' ? Number(roundIdInput) : undefined;

  const roundsQuery = useAdminRecertificationRoundListQuery({ size: 100 });
  const rounds = roundsQuery.data?.content ?? [];

  const listQuery = useAdminRecertificationRequestListQuery({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    roundId: parsedRoundId,
    page,
    size: PAGE_SIZE,
  });

  const items = listQuery.data?.content ?? [];
  const totalPages = listQuery.data?.totalPages ?? 0;

  const handleStatusTabChange = (next: RecertificationStatus | 'ALL') => {
    setStatusFilter(next);
    setPage(0);
  };

  const handleRoundIdChange = (next: string) => {
    setRoundIdInput(next);
    setPage(0);
  };

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6">
        <h1 className="text-[22px] font-bold text-ink">재인증 요청 관리</h1>
        <p className="mt-1 text-[13.5px] text-charcoal-2">
          접수된 동아리 재인증 요청을 확인하고 처리합니다.
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
            {tab === 'ALL' ? '전체' : RECERTIFICATION_STATUS_LABEL[tab]}
          </button>
        ))}
      </div>

      <div className="mb-5">
        <AdminRecertificationRequestsFilterBar
          status={statusFilter}
          roundId={roundIdInput}
          rounds={rounds}
          onStatusChange={handleStatusTabChange}
          onRoundIdChange={handleRoundIdChange}
        />
      </div>

      {listQuery.isLoading && <LoadingGate label="재인증 요청 목록 불러오는 중" />}
      {listQuery.isError && (
        <p className="py-12 text-center text-coral text-[13px]">목록을 불러오지 못했습니다.</p>
      )}
      {listQuery.isSuccess && <AdminRecertificationRequestsTable items={items} />}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </main>
  );
}
