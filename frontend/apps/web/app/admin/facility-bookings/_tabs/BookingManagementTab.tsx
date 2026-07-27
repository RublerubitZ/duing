'use client';

import { useEffect, useState } from 'react';
import {
  useAdminFacilityBookingQueueQuery,
  useAdminFacilityBookingSummaryQuery,
  useFacilityUsageQuery,
} from '@duing/hooks';
import type { AdminBookingQueueParams } from '@duing/types';
import { Pagination } from '@/components/Pagination';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { AdminBookingDetailModal } from '../_components/AdminBookingDetailModal';
import { AdminBookingQueueTable } from '../_components/AdminBookingQueueTable';
import { BookingSummaryCards, type AdminQueueTab } from '../_components/BookingSummaryCards';
import { ConsoleCard } from '../../_components/ConsoleCard';
import { EmptyState } from '../../_components/EmptyState';
import { conflictCardCount } from '../_lib/adminBookingDisplay';

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

export function BookingManagementTab() {
  const [activeTab, setActiveTab] = useState<AdminQueueTab>('PENDING');
  const [facilityIdInput, setFacilityIdInput] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  // 모달 대상 + 이웃 스냅샷(개편 스펙 §3) — 열람·탐색 시점의 큐 기준으로 고정한다.
  // 파생 계산이면 액션 성공 → refetch 로 행이 큐에서 빠지는 즉시 이전/다음이 죽어 연속 검토 동선이 끊긴다.
  const [selectedBooking, setSelectedBooking] = useState<{
    bookingId: number;
    previous: number | null;
    next: number | null;
  } | null>(null);

  const facilityId = facilityIdInput === '' ? undefined : Number(facilityIdInput);
  const hasQueueFilter = facilityIdInput !== '' || dateFrom !== '' || dateTo !== '';
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

  // 필터 칩 건수 병기(개편 스펙 §2) — 큐 필터와 의미가 일치하는 지표만 표기한다.
  // 확정은 summary 가 이달 기준이라 큐 전체 건수와 어긋나고, 전체는 표기 실익이 없다.
  const chipCountOf = (tab: AdminQueueTab): number | undefined => {
    const summaryCounts = summaryQuery.data;
    if (summaryCounts === undefined) return undefined;
    if (tab === 'PENDING') return summaryCounts.pendingCount;
    if (tab === 'APPROVED') return summaryCounts.approvedWaitingCount;
    if (tab === 'CONFLICT_ATTENTION') return conflictCardCount(summaryCounts);
    return undefined;
  };

  const conflictRows = queueQuery.data?.content ?? [];
  const suspectedRows =
    activeTab === 'CONFLICT_ATTENTION'
      ? (suspectedQuery.data?.content ?? []).filter((row) => row.conflictSuspected)
      : [];
  const rows = activeTab === 'CONFLICT_ATTENTION' ? [...conflictRows, ...suspectedRows] : conflictRows;
  // 충돌·의심 탭은 두 쿼리를 같은 page 로 병합하므로 페이지 수도 둘 중 큰 값이어야 한다.
  // CONFLICT 쪽만 쓰면 CONFLICT 0건일 때 totalPages 가 0 이 되어 APPROVED 2페이지째 의심 예약에 도달할 수 없다.
  // (의심 여부는 BE 파생 필드라 서버 필터가 없어 클라이언트 필터 — 일부 페이지는 의심 행이 없을 수 있으나 누락은 없다.)
  const totalPages =
    activeTab === 'CONFLICT_ATTENTION'
      ? Math.max(queueQuery.data?.totalPages ?? 0, suspectedQuery.data?.totalPages ?? 0)
      : (queueQuery.data?.totalPages ?? 0);

  // 충돌·의심 탭은 보조 쿼리(APPROVED)를 병합하므로 로딩·에러 게이트에도 합류시킨다(Task 3 리뷰 반영).
  const isQueueLoading =
    queueQuery.isLoading || (activeTab === 'CONFLICT_ATTENTION' && suspectedQuery.isLoading);
  const isQueueError =
    queueQuery.isError || (activeTab === 'CONFLICT_ATTENTION' && suspectedQuery.isError);

  const openBooking = (bookingId: number) => {
    const rowIndex = rows.findIndex((row) => row.bookingId === bookingId);
    setSelectedBooking({
      bookingId,
      previous: rowIndex > 0 ? (rows[rowIndex - 1]?.bookingId ?? null) : null,
      next: rowIndex !== -1 ? (rows[rowIndex + 1]?.bookingId ?? null) : null,
    });
  };

  // 마지막 페이지의 유일 항목이 액션으로 상태 전이되면 refetch 결과 totalPages 가 줄어
  // 현재 page 가 범위 밖(빈 목록·Pagination 소실)이 된다. 데이터 변화에 맞춰 page 를 클램프.
  // (레포의 useEffect 금지는 데이터 패칭 한정 — PR3 selectionInvalid 전례를 따른 상태 조정)
  // 클램프도 병합된 페이지 수를 기준으로 해야 한다 — CONFLICT 쪽만 보면 의심 예약 2페이지째로 이동하는 즉시 0 으로 되돌린다.
  // 보조 쿼리가 아직 안 왔는데 클램프하면 병합 전 값으로 page 를 되돌리므로, 병합 대상이 모두 도착한 뒤에만 판단한다.
  const mergedDataReady =
    queueQuery.data !== undefined &&
    (activeTab !== 'CONFLICT_ATTENTION' || suspectedQuery.data !== undefined);
  const loadedTotalPages = mergedDataReady ? totalPages : undefined;
  useEffect(() => {
    if (loadedTotalPages === undefined) return;
    if (loadedTotalPages === 0 && page !== 0) setPage(0);
    else if (loadedTotalPages > 0 && page >= loadedTotalPages) setPage(loadedTotalPages - 1);
  }, [loadedTotalPages, page]);

  return (
    <section className="space-y-4">
      {summaryQuery.data && (
        <BookingSummaryCards counts={summaryQuery.data} activeTab={activeTab} onSelectTab={selectTab} />
      )}
      {summaryQuery.isError && (
        <div role="alert" className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal-2">
          <span>대시보드 수치를 불러오지 못했어요.</span>
          <button type="button" className="btn btn-ghost btn-sm ml-2" onClick={() => void summaryQuery.refetch()}>
            다시 시도
          </button>
        </div>
      )}

      {/* 목업 CCard — 툴바·테이블·페이지네이션을 한 카드가 감싼다. */}
      <ConsoleCard>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-[18px] py-3">
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="큐 필터">
            {(Object.keys(TAB_LABELS) as AdminQueueTab[]).map((tab) => {
              const chipCount = chipCountOf(tab);
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => selectTab(tab)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold motion-safe:transition-colors ${
                    activeTab === tab
                      ? 'border-ink bg-ink text-cream'
                      : 'border-line bg-paper text-charcoal-2 hover:border-sage'
                  }`}
                >
                  {TAB_LABELS[tab]}
                  {/* 공백 텍스트 노드는 접근성 이름을 '승인 대기 7'로 띄어 읽히게 한다. */}
                  {chipCount !== undefined && <> <span className="tabular-nums">{chipCount}</span></>}
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              aria-label="시설 필터"
              className="rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] font-semibold text-charcoal"
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
              className="rounded-[10px] border border-line bg-paper px-3 py-[7px] text-[13px] text-charcoal"
            />
            <input
              type="date" aria-label="종료일" value={dateTo}
              onChange={(event) => { setDateTo(event.target.value); setPage(0); }}
              className="rounded-[10px] border border-line bg-paper px-3 py-[7px] text-[13px] text-charcoal"
            />
          </div>
        </div>

        {isQueueLoading && <LoadingGate className="min-h-0 py-8" label="예약 신청 목록 불러오는 중" />}
        {!isQueueLoading && isQueueError && (
          <div role="alert" className="px-[18px] py-8 text-sm text-charcoal-2">
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
          // 시설·기간 필터가 있을 때만 본문·초기화 버튼 노출 — 탭별 상태와 무관한 안내 문구를 만들지 않는다.
          <EmptyState
            title="해당 조건의 신청이 없어요"
            body={hasQueueFilter ? '시설·기간 필터를 넓혀보세요.' : undefined}
            action={
              hasQueueFilter ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setFacilityIdInput('');
                    setDateFrom('');
                    setDateTo('');
                    setPage(0);
                  }}
                >
                  필터 초기화
                </button>
              ) : undefined
            }
          />
        )}
        {!isQueueLoading && !isQueueError && rows.length > 0 && (
          <AdminBookingQueueTable rows={rows} onSelect={openBooking} />
        )}

        {totalPages > 1 && (
          <div className="border-t border-line px-[18px] pb-4">
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              // 충돌·의심 탭은 두 쿼리 병합이라 총계가 부정확 — 범위 표기를 생략한다(개편 스펙 §2).
              totalElements={activeTab === 'CONFLICT_ATTENTION' ? undefined : queueQuery.data?.totalElements}
              pageSize={PAGE_SIZE}
            />
          </div>
        )}
      </ConsoleCard>

      {selectedBooking !== null && (
        // key=bookingId — 이전/다음 이동 시 리마운트로 액션·충돌 패널 등 모달 내부 상태를 초기화한다.
        <AdminBookingDetailModal
          key={selectedBooking.bookingId}
          bookingId={selectedBooking.bookingId}
          neighborIds={{ previous: selectedBooking.previous, next: selectedBooking.next }}
          onNavigate={openBooking}
          onClose={() => setSelectedBooking(null)}
        />
      )}
    </section>
  );
}
