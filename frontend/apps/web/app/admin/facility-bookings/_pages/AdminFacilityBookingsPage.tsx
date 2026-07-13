'use client';

import { useState } from 'react';
import {
  useAdminFacilityBookingQueueQuery,
  useAdminFacilityBookingSummaryQuery,
  useFacilityUsageQuery,
} from '@duing/hooks';
import type { AdminBookingQueueParams } from '@duing/types';
import { Pagination } from '@/components/Pagination';
import { AdminBookingDetailModal } from '../_components/AdminBookingDetailModal';
import { AdminBookingQueueTable } from '../_components/AdminBookingQueueTable';
import { BookingSummaryCards, type AdminQueueTab } from '../_components/BookingSummaryCards';

const PAGE_SIZE = 20;

const TAB_LABELS: Record<AdminQueueTab, string> = {
  PENDING: '승인 대기',
  APPROVED: '반영 대기',
  CONFLICT_ATTENTION: '충돌·의심',
  CONFIRMED: '확정',
  ALL: '전체',
};

function statusParamOf(tab: AdminQueueTab): AdminBookingQueueParams['status'] {
  if (tab === 'PENDING' || tab === 'APPROVED' || tab === 'CONFIRMED') return tab;
  if (tab === 'CONFLICT_ATTENTION') return 'CONFLICT';
  return undefined;
}

export function AdminFacilityBookingsPage() {
  const [activeTab, setActiveTab] = useState<AdminQueueTab>('PENDING');
  const [facilityIdInput, setFacilityIdInput] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);

  const facilityId = facilityIdInput === '' ? undefined : Number(facilityIdInput);
  const baseParams: AdminBookingQueueParams = {
    facilityId,
    dateFrom: dateFrom === '' ? undefined : dateFrom,
    dateTo: dateTo === '' ? undefined : dateTo,
    page,
    size: PAGE_SIZE,
  };

  const summaryQuery = useAdminFacilityBookingSummaryQuery();
  const queueQuery = useAdminFacilityBookingQueueQuery({ ...baseParams, status: statusParamOf(activeTab) });
  // 충돌·의심 탭 전용 보조 쿼리 — APPROVED 중 conflictSuspected 를 병합(재량 결정 ②)
  const suspectedQuery = useAdminFacilityBookingQueueQuery(
    { ...baseParams, status: 'APPROVED' },
    { enabled: activeTab === 'CONFLICT_ATTENTION' },
  );
  const usageQuery = useFacilityUsageQuery();

  const selectTab = (tab: AdminQueueTab) => {
    setActiveTab(tab);
    setPage(0);
  };

  const conflictRows = queueQuery.data?.content ?? [];
  const suspectedRows =
    activeTab === 'CONFLICT_ATTENTION'
      ? (suspectedQuery.data?.content ?? []).filter((row) => row.conflictSuspected)
      : [];
  const rows = activeTab === 'CONFLICT_ATTENTION' ? [...conflictRows, ...suspectedRows] : conflictRows;
  const totalPages = queueQuery.data?.totalPages ?? 0;

  // 충돌·의심 탭은 보조 쿼리(APPROVED)를 병합하므로 로딩·에러 게이트에도 합류시킨다(Task 3 리뷰 반영).
  const isQueueLoading =
    queueQuery.isLoading || (activeTab === 'CONFLICT_ATTENTION' && suspectedQuery.isLoading);
  const isQueueError =
    queueQuery.isError || (activeTab === 'CONFLICT_ATTENTION' && suspectedQuery.isError);

  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-display text-xl text-ink-deep">시설 예약 관리</h1>
        <p className="mt-1 text-sm text-charcoal-3">대관 신청 승인·학교 반영 확인·충돌 처리를 한 곳에서 합니다.</p>
      </div>

      {summaryQuery.data && (
        <BookingSummaryCards counts={summaryQuery.data} activeTab={activeTab} onSelectTab={selectTab} />
      )}

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="큐 필터">
        {(Object.keys(TAB_LABELS) as AdminQueueTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => selectTab(tab)}
            className={`rounded-full border px-3 py-1.5 text-xs motion-safe:transition-colors ${
              activeTab === tab ? 'border-ink bg-ink text-cream' : 'border-line bg-paper text-charcoal-2 hover:border-sage'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
        <select
          aria-label="시설 필터"
          className="ml-auto rounded-md border border-line bg-paper px-2 py-1.5 text-xs"
          value={facilityIdInput}
          onChange={(event) => { setFacilityIdInput(event.target.value); setPage(0); }}
        >
          <option value="">전체 시설</option>
          {(usageQuery.data?.facilities ?? []).map((facility) => (
            <option key={facility.id} value={String(facility.id)}>{facility.roomName}</option>
          ))}
        </select>
        <input
          type="date" aria-label="시작일" value={dateFrom}
          onChange={(event) => { setDateFrom(event.target.value); setPage(0); }}
          className="rounded-md border border-line bg-paper px-2 py-1 text-xs"
        />
        <input
          type="date" aria-label="종료일" value={dateTo}
          onChange={(event) => { setDateTo(event.target.value); setPage(0); }}
          className="rounded-md border border-line bg-paper px-2 py-1 text-xs"
        />
      </div>

      {isQueueLoading && <p className="text-sm text-charcoal-3">불러오는 중…</p>}
      {!isQueueLoading && isQueueError && (
        <div role="alert" className="text-sm text-charcoal-2">
          <p>큐를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
          <button
            type="button"
            className="btn btn-ghost mt-2"
            onClick={() => {
              void queueQuery.refetch();
              if (activeTab === 'CONFLICT_ATTENTION') void suspectedQuery.refetch();
            }}
          >
            다시 시도
          </button>
        </div>
      )}
      {!isQueueLoading && !isQueueError && queueQuery.isSuccess && rows.length === 0 && (
        <p className="text-sm text-charcoal-3">해당 조건의 신청이 없어요.</p>
      )}
      {!isQueueLoading && !isQueueError && rows.length > 0 && (
        <AdminBookingQueueTable rows={rows} onSelect={setSelectedBookingId} />
      )}

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}

      {selectedBookingId !== null && (
        <AdminBookingDetailModal
          bookingId={selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
        />
      )}
    </section>
  );
}
