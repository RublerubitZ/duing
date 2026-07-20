'use client';

import { useState } from 'react';
import {
  useCreateSubmissionBatchMutation,
  useFacilityUsageQuery,
  useSubmissionCandidatesQuery,
} from '@duing/hooks';
import type { SubmissionCandidateBooking, SubmissionCandidatesParams } from '@duing/types';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { BatchCreateDialog } from '../_components/BatchCreateDialog';
import { SubmissionClubGroupList } from '../_components/SubmissionClubGroupList';
import { SubmissionDetailSheet } from '../_components/SubmissionDetailSheet';
import { SubmissionSummaryCards, type SummaryFilter } from '../_components/SubmissionSummaryCards';
import { SubmissionTimetable } from '../_components/SubmissionTimetable';

const MAX_PERIOD_DAYS = 31;

type SubmissionTab = 'submit' | 'history';
type ViewMode = 'list' | 'timetable';
type SubmissionStatusFilter = 'ALL' | 'NEED' | 'SUBMITTED';

const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** 기본 조회 기간 = 이번 달 1일~말일(≤31일이라 항상 유효) — 월간 제출 업무 단위(스펙 v2). */
function currentMonthRange(): { startDate: string; endDate: string } {
  const today = new Date();
  return {
    startDate: toIso(new Date(today.getFullYear(), today.getMonth(), 1)),
    endDate: toIso(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  };
}

function periodDayCount(startDate: string, endDate: string): number {
  const diffMs = new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime();
  return Math.round(diffMs / 86_400_000) + 1;
}

function matchesFilter(booking: SubmissionCandidateBooking, filter: SummaryFilter): boolean {
  if (filter === 'APPROVED') return booking.status === 'APPROVED';
  if (filter === 'NEED') return booking.selectable;
  if (filter === 'SUBMITTED') return booking.submitted;
  if (filter === 'CONFIRMED') return booking.status === 'CONFIRMED';
  return true;
}

export function AdminSubmissionPage() {
  const defaultRange = currentMonthRange();
  const [activeTab, setActiveTab] = useState<SubmissionTab>('submit');
  const [facilityIdInput, setFacilityIdInput] = useState('');
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [clubKeyword, setClubKeyword] = useState('');
  const [view, setView] = useState<ViewMode>('list');
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>('ALL');
  const [selection, setSelection] = useState<ReadonlySet<number>>(new Set());
  const [detailBooking, setDetailBooking] = useState<SubmissionCandidateBooking | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { addToast } = useToast();
  const usageQuery = useFacilityUsageQuery();
  const facilityId = facilityIdInput === '' ? undefined : Number(facilityIdInput);
  const facilityName =
    (usageQuery.data?.facilities ?? []).find((facility) => facility.id === facilityId)?.roomName ?? '';

  // startDate/endDate 가 빈 값이면 periodDayCount 가 NaN 을 반환 — 범위 비교(NaN >= 1)는 항상 false 라 아래 한 식으로 NaN·역순·초과·0일을 함께 차단한다.
  const periodDays = periodDayCount(startDate, endDate);
  const periodInvalid = !(periodDays >= 1 && periodDays <= MAX_PERIOD_DAYS);
  const candidatesParams: SubmissionCandidatesParams | null =
    facilityId !== undefined && !periodInvalid ? { facilityId, startDate, endDate } : null;
  const candidatesQuery = useSubmissionCandidatesQuery(candidatesParams);
  const createMutation = useCreateSubmissionBatchMutation();

  const allBookings = candidatesQuery.data?.bookings ?? [];
  const keyword = clubKeyword.trim();
  // 동아리명 부분 검색·제출 여부 필터는 클라이언트 가공(스펙 v2 — 단일 시설·31일 상한 소량).
  // clubName 이 null 인 예약은 그룹 라벨이 `동아리 {clubId}` 로 합성되므로(SubmissionClubGroupList),
  // 검색도 같은 폴백 문자열로 매칭해야 라벨 그대로 검색된다.
  const searchedBookings =
    keyword === ''
      ? allBookings
      : allBookings.filter((booking) => (booking.clubName ?? `동아리 ${booking.clubId}`).includes(keyword));
  const visibleBookings = searchedBookings.filter((booking) => matchesFilter(booking, summaryFilter));
  const selectableIdSet = new Set(
    visibleBookings.filter((booking) => booking.selectable).map((booking) => booking.bookingId),
  );
  const selectedIds = [...selection].filter((bookingId) => selectableIdSet.has(bookingId));

  // 제출 여부 셀렉트는 필터의 3값(전체/제출 필요/제출함)만 표현 — 카드 확장값(APPROVED/CONFIRMED)일 땐 '전체' 표시.
  const statusFilterValue: SubmissionStatusFilter =
    summaryFilter === 'NEED' || summaryFilter === 'SUBMITTED' ? summaryFilter : 'ALL';

  const resetSelection = () => setSelection(new Set());
  const toggleSelect = (bookingId: number) =>
    setSelection((previous) => {
      const next = new Set(previous);
      if (next.has(bookingId)) next.delete(bookingId);
      else next.add(bookingId);
      return next;
    });
  const toggleMany = (bookingIds: number[], nextSelected: boolean) =>
    setSelection((previous) => {
      const next = new Set(previous);
      for (const bookingId of bookingIds) {
        if (nextSelected) next.add(bookingId);
        else next.delete(bookingId);
      }
      return next;
    });

  const handleCreateConfirm = async (memo: string) => {
    if (selectedIds.length === 0) return;
    try {
      await createMutation.mutateAsync({
        bookingIds: selectedIds,
        memo: memo.trim() === '' ? undefined : memo.trim(),
      });
      setDialogOpen(false);
      resetSelection();
      // v2: CSV 자동 다운로드 없음 — 토스트만. 다운로드는 Batch 상세(PR-4)에서 선택 수행.
      addToast('선택한 예약이 제출 목록에 담겼어요.');
    } catch (error) {
      addToast(submissionErrorMessage(error), { variant: 'error' });
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-display text-xl text-ink-deep">학교 제출</h1>
        <p className="mt-1 text-sm text-charcoal-3">승인 완료된 예약을 모아 학교에 제출할 목록을 만들고 관리해요. 실제 제출은 담당자가 직접 진행해요.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="학교 제출 탭">
        {([['submit', '제출 준비'], ['history', '제출 이력']] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-full border px-3 py-1.5 text-xs motion-safe:transition-colors ${
              activeTab === tab ? 'border-ink bg-ink text-cream' : 'border-line bg-paper text-charcoal-2 hover:border-sage'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'history' && (
        <p className="text-sm text-charcoal-3">제출 이력은 준비 중이에요. 만든 제출 목록을 곧 이 탭에서 확인할 수 있어요.</p>
      )}

      {activeTab === 'submit' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="시설 선택"
              className="rounded-md border border-line bg-paper px-2 py-1.5 text-xs"
              value={facilityIdInput}
              onChange={(event) => { setFacilityIdInput(event.target.value); resetSelection(); }}
            >
              <option value="">시설을 선택하세요</option>
              {(usageQuery.data?.facilities ?? []).map((facility) => (
                <option key={facility.id} value={String(facility.id)}>{facility.roomName}</option>
              ))}
            </select>
            <input
              type="date" aria-label="시작일" value={startDate}
              onChange={(event) => { setStartDate(event.target.value); resetSelection(); }}
              className="rounded-md border border-line bg-paper px-2 py-1 text-xs"
            />
            <input
              type="date" aria-label="종료일" value={endDate}
              onChange={(event) => { setEndDate(event.target.value); resetSelection(); }}
              className="rounded-md border border-line bg-paper px-2 py-1 text-xs"
            />
            <input
              type="search" aria-label="동아리 검색" value={clubKeyword} placeholder="동아리 검색"
              onChange={(event) => setClubKeyword(event.target.value)}
              className="rounded-md border border-line bg-paper px-2 py-1.5 text-xs"
            />
            <select
              aria-label="제출 상태"
              className="rounded-md border border-line bg-paper px-2 py-1.5 text-xs"
              value={statusFilterValue}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSummaryFilter(nextValue === 'NEED' || nextValue === 'SUBMITTED' ? nextValue : 'ALL');
              }}
            >
              <option value="ALL">전체</option>
              <option value="NEED">학교에 제출할 예약</option>
              <option value="SUBMITTED">제출 목록에 담긴 예약</option>
            </select>
            <div className="ml-auto flex items-center gap-2" role="tablist" aria-label="보기 전환">
              {([['list', '목록'], ['timetable', '시간표']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={view === mode}
                  onClick={() => setView(mode)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs motion-safe:transition-colors ${
                    view === mode ? 'border-ink bg-ink text-cream' : 'border-line bg-paper text-charcoal-2 hover:border-sage'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {facilityId === undefined && (
            <p className="py-10 text-center text-sm text-charcoal-3">시설을 선택하면 학교에 제출할 예약을 확인할 수 있어요.</p>
          )}
          {facilityId !== undefined && periodInvalid && (
            <div role="alert" className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal-2">
              조회 기간을 확인해주세요 — 시작일부터 최대 31일까지 조회할 수 있어요.
            </div>
          )}

          {candidatesParams !== null && (
            <>
              {candidatesQuery.data && (
                <SubmissionSummaryCards
                  counts={candidatesQuery.data.summary}
                  activeFilter={summaryFilter}
                  onSelectFilter={setSummaryFilter}
                />
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    toggleMany([...selectableIdSet], !(selectableIdSet.size > 0 && selectedIds.length === selectableIdSet.size))
                  }
                >
                  {selectableIdSet.size > 0 && selectedIds.length === selectableIdSet.size ? '전체 해제' : '전체 선택'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={selectedIds.length === 0}
                  onClick={() => setDialogOpen(true)}
                >
                  선택 {selectedIds.length}건 · 제출 목록 만들기
                </button>
              </div>

              {candidatesQuery.isLoading && <LoadingGate className="min-h-0 py-8" label="예약 목록 불러오는 중" />}
              {!candidatesQuery.isLoading && candidatesQuery.isError && (
                <div role="alert" className="text-sm text-charcoal-2">
                  <p>예약 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
                  <button type="button" className="btn btn-ghost mt-2" onClick={() => void candidatesQuery.refetch()}>
                    다시 시도
                  </button>
                </div>
              )}
              {!candidatesQuery.isLoading && candidatesQuery.isSuccess && visibleBookings.length === 0 && (
                <p className="text-sm text-charcoal-3">
                  {summaryFilter !== 'ALL' || keyword !== ''
                    ? '조건에 맞는 예약이 없어요. 검색어나 필터를 바꿔보세요.'
                    : '이 기간에는 학교에 제출할 예약이 없어요.'}
                </p>
              )}
              {!candidatesQuery.isLoading && candidatesQuery.isSuccess && visibleBookings.length > 0 && (
                view === 'list' ? (
                  <SubmissionClubGroupList
                    bookings={visibleBookings}
                    selection={selection}
                    onToggleSelect={toggleSelect}
                    onToggleMany={toggleMany}
                    onShowDetail={setDetailBooking}
                  />
                ) : (
                  <SubmissionTimetable
                    bookings={visibleBookings}
                    facilityName={facilityName}
                    selection={selection}
                    onToggleSelect={toggleSelect}
                    onShowDetail={setDetailBooking}
                  />
                )
              )}
            </>
          )}

          <SubmissionDetailSheet booking={detailBooking} facilityName={facilityName} onClose={() => setDetailBooking(null)} />
          <BatchCreateDialog
            open={dialogOpen}
            selectedCount={selectedIds.length}
            isPending={createMutation.isPending}
            onClose={() => setDialogOpen(false)}
            onConfirm={(memo) => void handleCreateConfirm(memo)}
          />
        </>
      )}
    </section>
  );
}

/** 서버 메시지 우선 표출 — AdminUsersPage.forceLogoutErrorMessage 의 추출 방식을 열어 동일하게 맞춘다. */
function submissionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return '제출 목록을 만들지 못했어요. 잠시 후 다시 시도해주세요.';
}
