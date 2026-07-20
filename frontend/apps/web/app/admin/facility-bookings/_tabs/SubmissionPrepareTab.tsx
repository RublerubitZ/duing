'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCreateSubmissionBatchMutation, useSubmissionCandidatesQuery } from '@duing/hooks';
import type { SubmissionCandidateBooking, SubmissionCandidatesParams } from '@duing/types';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { toRoute } from '../../../_lib/route';
import { EmptyState } from '../_components/EmptyState';
import { ViewModeToggle, type SubmissionViewMode } from '../_components/ViewModeToggle';
import { BatchCreateDialog } from '../submission/_components/BatchCreateDialog';
import { SubmissionClubGroupList } from '../submission/_components/SubmissionClubGroupList';
import { SubmissionDetailSheet } from '../submission/_components/SubmissionDetailSheet';
import { SubmissionSummaryCards, type SummaryFilter } from '../submission/_components/SubmissionSummaryCards';
import { SubmissionTimetable } from '../submission/_components/SubmissionTimetable';
import { buildFacilitySections, deriveSelectedIds } from '../submission/_lib/submissionSections';

const MAX_PERIOD_DAYS = 31;

type SubmissionStatusFilter = 'ALL' | 'NEED' | 'SUBMITTED';

const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** 기본 조회 기간 = 이번 달 1일~말일(≤31일이라 항상 유효) — 월간 제출 업무 단위(스펙 v3). */
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

/** 서버 메시지 우선(제출 중복·상태 위반 등 사용자 안내형), 없으면 폴백. */
function submissionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return '제출 목록을 만들지 못했어요. 잠시 후 다시 시도해주세요.';
}

function matchesFilter(booking: SubmissionCandidateBooking, filter: SummaryFilter): boolean {
  if (filter === 'APPROVED') return booking.status === 'APPROVED';
  if (filter === 'NEED') return booking.selectable;
  if (filter === 'SUBMITTED') return booking.submitted;
  if (filter === 'CONFIRMED') return booking.status === 'CONFIRMED';
  return true;
}

/**
 * 학교 제출 준비 탭(스펙 v3 §7.2) — 승인된 예약이 자동 유입되는 준비 큐.
 * 전 시설을 시설별 섹션으로 표시하고, 제출 필요 예약은 기본 전체 선택(선택 = selectable − excluded 파생).
 * 운영자는 제외만 하고 시설 단위 "제출 목록 만들기"를 수행한다.
 */
export function SubmissionPrepareTab() {
  const defaultRange = currentMonthRange();
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [clubKeyword, setClubKeyword] = useState('');
  const [view, setView] = useState<SubmissionViewMode>('list');
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>('ALL');
  // v3 선택 모델 — 제외 집합만 상태로 두고 선택은 파생한다(기본 전체 선택·신규 유입 자동 선택).
  const [excludedIds, setExcludedIds] = useState<ReadonlySet<number>>(new Set());
  const [detailBooking, setDetailBooking] = useState<SubmissionCandidateBooking | null>(null);
  // 학교 제출 Dialog 는 시설 단위 — 열린 섹션의 시설 정보만 상태로 둔다.
  const [dialogSection, setDialogSection] = useState<{ facilityId: number; facilityName: string } | null>(null);
  const createMutation = useCreateSubmissionBatchMutation();
  const { addToast } = useToast();

  // startDate/endDate 가 빈 값이면 periodDayCount 가 NaN 을 반환 — 범위 비교(NaN >= 1)는 항상 false 라 아래 한 식으로 NaN·역순·초과·0일을 함께 차단한다.
  const periodDays = periodDayCount(startDate, endDate);
  const periodInvalid = !(periodDays >= 1 && periodDays <= MAX_PERIOD_DAYS);
  // 전 시설 조회 — facilityId 는 생략(BE §5.1 v3).
  const candidatesParams: SubmissionCandidatesParams | null =
    periodInvalid ? null : { startDate, endDate };
  const candidatesQuery = useSubmissionCandidatesQuery(candidatesParams);

  const allBookings = candidatesQuery.data?.bookings ?? [];
  const keyword = clubKeyword.trim();
  // 동아리명 부분 검색·제출 상태 필터는 클라이언트 가공(31일 상한 소량).
  // clubName 이 null 인 예약은 그룹 라벨이 `동아리 {clubId}` 로 합성되므로(SubmissionClubGroupList),
  // 검색도 같은 폴백 문자열로 매칭해야 라벨 그대로 검색된다.
  const searchedBookings =
    keyword === ''
      ? allBookings
      : allBookings.filter((booking) => (booking.clubName ?? `동아리 ${booking.clubId}`).includes(keyword));
  const visibleBookings = searchedBookings.filter((booking) => matchesFilter(booking, summaryFilter));
  const sections = buildFacilitySections(visibleBookings);
  const selectedIdSet = new Set(deriveSelectedIds(visibleBookings, excludedIds));

  // 제출 상태 셀렉트는 필터의 3값(전체/학교에 제출할 예약/제출 목록에 담긴 예약)만 표현 — 카드 확장값(APPROVED/CONFIRMED)일 땐 '전체' 표시.
  const statusFilterValue: SubmissionStatusFilter =
    summaryFilter === 'NEED' || summaryFilter === 'SUBMITTED' ? summaryFilter : 'ALL';

  // 화면에서 사라진 예약(기간·검색·필터 변경, 재조회)은 excluded 에서도 정리한다 — 세션 상태 누적 방지.
  // (레포의 useEffect 금지는 데이터 패칭 한정 — 페이지 클램프 전례와 같은 상태 정리 용도)
  const visibleSelectableKey = visibleBookings
    .filter((booking) => booking.selectable)
    .map((booking) => booking.bookingId)
    .sort((left, right) => left - right)
    .join(',');
  useEffect(() => {
    setExcludedIds((previous) => {
      const visibleIds = new Set(
        visibleSelectableKey === '' ? [] : visibleSelectableKey.split(',').map(Number),
      );
      const next = new Set([...previous].filter((bookingId) => visibleIds.has(bookingId)));
      return next.size === previous.size ? previous : next;
    });
  }, [visibleSelectableKey]);

  // 재사용 컴포넌트의 선택 콜백을 제외 모델로 반전 연결한다.
  const toggleSelect = (bookingId: number) =>
    setExcludedIds((previous) => {
      const next = new Set(previous);
      if (next.has(bookingId)) next.delete(bookingId);
      else next.add(bookingId);
      return next;
    });
  const toggleMany = (bookingIds: number[], nextSelected: boolean) =>
    setExcludedIds((previous) => {
      const next = new Set(previous);
      for (const bookingId of bookingIds) {
        if (nextSelected) next.delete(bookingId);
        else next.add(bookingId);
      }
      return next;
    });

  const handleSubmitConfirm = async (memo: string) => {
    if (dialogSection === null) return;
    const sectionBookings = visibleBookings.filter((booking) => booking.facilityId === dialogSection.facilityId);
    const bookingIds = deriveSelectedIds(sectionBookings, excludedIds);
    if (bookingIds.length === 0) return;
    try {
      await createMutation.mutateAsync({
        bookingIds,
        memo: memo.trim() === '' ? undefined : memo.trim(),
      });
      setDialogSection(null);
      // excluded 정리는 별도 불필요 — 제출된 예약은 재조회 후 selectable 에서 빠지고, 화면 기준
      // 프루닝 이펙트가 잔재를 정리한다(세션 상태 누적 방지 규약).
      addToast("제출 목록이 만들어졌어요. 학교 제출 후 '제출 목록' 탭에서 완료 처리해 주세요.");
    } catch (error) {
      addToast(submissionErrorMessage(error), { variant: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date" aria-label="시작일" value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          className="rounded-md border border-line bg-paper px-2 py-1 text-xs"
        />
        <input
          type="date" aria-label="종료일" value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
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
        <ViewModeToggle view={view} onChange={setView} className="ml-auto" />
      </div>

      {periodInvalid && (
        <div role="alert" className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal-2">
          조회 기간을 확인해주세요 — 종료일이 시작일보다 앞설 수 없고, 시작일부터 최대 31일까지 조회할 수 있어요.
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
            summaryFilter !== 'ALL' || keyword !== '' ? (
              <EmptyState icon="🔍" title="조건에 맞는 예약이 없어요" body="검색어나 필터를 바꿔보세요." />
            ) : (
              <EmptyState
                icon="✅"
                title="학교에 제출할 예약이 없어요"
                body={'예약을 승인하면 여기에 자동으로 표시돼요.\n대기 중인 신청은 예약 관리 탭에서 처리할 수 있어요.'}
                action={
                  <Link href={toRoute('/admin/facility-bookings?tab=pending')} className="btn btn-secondary btn-sm">
                    예약 관리로 이동
                  </Link>
                }
              />
            )
          )}
          {!candidatesQuery.isLoading && candidatesQuery.isSuccess && sections.length > 0 && (
            <ul className="space-y-6">
              {sections.map((section) => {
                const sectionSelectedCount = deriveSelectedIds(section.bookings, excludedIds).length;
                const sectionNeedCount = section.bookings.filter((booking) => booking.selectable).length;
                return (
                  <li key={section.facilityId} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="font-medium text-ink-deep">{section.facilityName}</h2>
                        <p className="text-xs text-charcoal-3">학교에 제출할 예약 {sectionNeedCount}건</p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={sectionSelectedCount === 0}
                        onClick={() =>
                          setDialogSection({ facilityId: section.facilityId, facilityName: section.facilityName })
                        }
                      >
                        제출 목록 만들기 ({sectionSelectedCount}건)
                      </button>
                    </div>
                    {view === 'list' ? (
                      <SubmissionClubGroupList
                        bookings={section.bookings}
                        selection={selectedIdSet}
                        onToggleSelect={toggleSelect}
                        onToggleMany={toggleMany}
                        onShowDetail={setDetailBooking}
                      />
                    ) : (
                      <SubmissionTimetable
                        bookings={section.bookings}
                        facilityName={section.facilityName}
                        selection={selectedIdSet}
                        onToggleSelect={toggleSelect}
                        onShowDetail={setDetailBooking}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <SubmissionDetailSheet
        booking={detailBooking}
        facilityName={detailBooking?.facilityName ?? (detailBooking !== null ? `시설 ${detailBooking.facilityId}` : '')}
        onClose={() => setDetailBooking(null)}
      />
      <BatchCreateDialog
        open={dialogSection !== null}
        facilityName={dialogSection?.facilityName ?? ''}
        selectedCount={
          dialogSection === null
            ? 0
            : deriveSelectedIds(
                visibleBookings.filter((booking) => booking.facilityId === dialogSection.facilityId),
                excludedIds,
              ).length
        }
        isPending={createMutation.isPending}
        onClose={() => setDialogSection(null)}
        onConfirm={(memo) => void handleSubmitConfirm(memo)}
      />
    </div>
  );
}
