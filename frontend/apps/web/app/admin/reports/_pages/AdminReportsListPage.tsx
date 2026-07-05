'use client';

import { useState } from 'react';
import type { ReportStatus, ReportTargetType } from '@duing/types';
import { useAdminReportListQuery } from '@duing/hooks';
import { Pagination } from '@/components/Pagination';
import { AdminReportsFilterBar } from '../_components/AdminReportsFilterBar';
import { AdminReportsTable } from '../_components/AdminReportsTable';
import { REPORT_STATUS_LABEL } from '../_lib/reportLabels';

const PAGE_SIZE = 20;

const STATUS_TABS: (ReportStatus | 'ALL')[] = ['ALL', 'PENDING', 'RESOLVED', 'DISMISSED'];

export function AdminReportsListPage() {
  const [statusFilter, setStatusFilter] = useState<ReportStatus | 'ALL'>('ALL');
  const [targetTypeFilter, setTargetTypeFilter] = useState<ReportTargetType | 'ALL'>('ALL');
  const [page, setPage] = useState(0);

  const listQuery = useAdminReportListQuery({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    targetType: targetTypeFilter === 'ALL' ? undefined : targetTypeFilter,
    page,
    size: PAGE_SIZE,
  });

  const items = listQuery.data?.content ?? [];
  const totalPages = listQuery.data?.totalPages ?? 0;

  const handleStatusTabChange = (next: ReportStatus | 'ALL') => {
    setStatusFilter(next);
    setPage(0);
  };

  const handleTargetTypeChange = (next: ReportTargetType | 'ALL') => {
    setTargetTypeFilter(next);
    setPage(0);
  };

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6">
        <h1 className="text-[22px] font-bold text-ink">신고 관리</h1>
        <p className="mt-1 text-[13.5px] text-charcoal-2">접수된 신고를 확인하고 처리합니다.</p>
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
            {tab === 'ALL' ? '전체' : REPORT_STATUS_LABEL[tab]}
          </button>
        ))}
      </div>

      <div className="mb-5">
        <AdminReportsFilterBar
          status={statusFilter}
          targetType={targetTypeFilter}
          onStatusChange={handleStatusTabChange}
          onTargetTypeChange={handleTargetTypeChange}
        />
      </div>

      {listQuery.isLoading && (
        <p className="py-12 text-center text-charcoal-3 text-[13px]">불러오는 중…</p>
      )}
      {listQuery.isError && (
        <p className="py-12 text-center text-coral text-[13px]">목록을 불러오지 못했습니다.</p>
      )}
      {listQuery.isSuccess && (
        <AdminReportsTable items={items} />
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </main>
  );
}
