'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCreateSubmissionBatchMutation, useSubmissionCandidatesQuery } from '@duing/hooks';
import type { SubmissionCandidateBooking, SubmissionCandidatesParams } from '@duing/types';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { toRoute } from '../../../_lib/route';
import { ConsoleCard } from '../_components/ConsoleCard';
import { EmptyState } from '../_components/EmptyState';
import { ViewModeToggle, type SubmissionViewMode } from '../_components/ViewModeToggle';
import { currentMonthRange } from '../_lib/submissionPeriod';
import {
  BatchBulkCreateDialog,
  type BulkCreateFacilityGroup,
} from '../submission/_components/BatchBulkCreateDialog';
import {
  BatchBulkCreateResultDialog,
  type BulkCreateOutcome,
} from '../submission/_components/BatchBulkCreateResultDialog';
import { SubmissionClubGroupList } from '../submission/_components/SubmissionClubGroupList';
import { SubmissionDetailSheet } from '../submission/_components/SubmissionDetailSheet';
import { SubmissionSummaryCards, type SummaryFilter } from '../submission/_components/SubmissionSummaryCards';
import { SubmissionTimetable } from '../submission/_components/SubmissionTimetable';
import { buildFacilitySections, deriveSelectedIds } from '../submission/_lib/submissionSections';

const MAX_PERIOD_DAYS = 31;

type SubmissionStatusFilter = 'ALL' | 'NEED' | 'SUBMITTED';

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
  // 일괄 생성(개편 스펙 §4) — 선택 요약 바 하나로 시설별 배치를 순차 생성한다.
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkOutcomes, setBulkOutcomes] = useState<BulkCreateOutcome[] | null>(null);
  const createMutation = useCreateSubmissionBatchMutation();

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
  // 선택 요약 바·일괄 생성용 파생 — 배치=단일 시설 제약이라 시설별로 분해해 둔다.
  const selectedFacilityGroups: BulkCreateFacilityGroup[] = sections
    .map((section) => ({
      facilityId: section.facilityId,
      facilityName: section.facilityName,
      bookingIds: deriveSelectedIds(section.bookings, excludedIds),
    }))
    .filter((group) => group.bookingIds.length > 0);
  const selectedTotalCount = selectedFacilityGroups.reduce((sum, group) => sum + group.bookingIds.length, 0);
  const visibleSelectableIds = visibleBookings
    .filter((booking) => booking.selectable)
    .map((booking) => booking.bookingId);

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

  // 시설별 순차 생성(개편 스펙 §4) — 부분 실패를 시설 단위로 보고한다. 성공한 시설의 예약은
  // 재조회 후 selectable 에서 빠지고 실패한 시설의 예약은 기본 선택으로 남아 바로 재시도할 수 있다.
  const handleBulkCreate = async (
    groups: BulkCreateFacilityGroup[],
    memoByFacilityId: ReadonlyMap<number, string>,
  ) => {
    if (groups.length === 0) return;
    setBulkSubmitting(true);
    const outcomes: BulkCreateOutcome[] = [];
    for (const group of groups) {
      const memo = (memoByFacilityId.get(group.facilityId) ?? '').trim();
      try {
        const createdBatch = await createMutation.mutateAsync({
          bookingIds: group.bookingIds,
          memo: memo === '' ? undefined : memo,
        });
        outcomes.push({
          facilityId: group.facilityId,
          facilityName: group.facilityName,
          bookingCount: group.bookingIds.length,
          batch: createdBatch,
          errorMessage: null,
        });
      } catch (error) {
        outcomes.push({
          facilityId: group.facilityId,
          facilityName: group.facilityName,
          bookingCount: group.bookingIds.length,
          batch: null,
          errorMessage: submissionErrorMessage(error),
        });
      }
    }
    setBulkSubmitting(false);
    setBulkDialogOpen(false);
    setBulkOutcomes(outcomes);
  };

  return (
    <div className="space-y-4">
      {candidatesQuery.data && candidatesParams !== null && (
        <SubmissionSummaryCards
          counts={candidatesQuery.data.summary}
          activeFilter={summaryFilter}
          onSelectFilter={setSummaryFilter}
        />
      )}

      {periodInvalid && (
        <div role="alert" className="rounded-[12px] border border-line bg-paper px-4 py-3 text-sm text-charcoal-2">
          조회 기간을 확인해주세요 — 종료일이 시작일보다 앞설 수 없고, 시작일부터 최대 31일까지 조회할 수 있어요.
        </div>
      )}

      {/* 목업 CCard — 선택 툴바(A) + 필터 행(B) + 시설별 그룹(B)을 한 카드가 감싼다. */}
      <ConsoleCard>
        {/* selection toolbar(목업 A) — Primary 는 '제출 목록 만들기' 하나, 나머지는 ghost. */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-[18px] py-3">
          <p className="flex items-center gap-2 text-[13px] font-bold tabular-nums text-ink-deep">
            <span
              aria-hidden
              className={`flex h-5 w-5 items-center justify-center rounded-[6px] border-[1.5px] ${
                selectedTotalCount > 0 ? 'border-ink-deep bg-ink-deep' : 'border-line bg-paper'
              }`}
            >
              {selectedTotalCount > 0 && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3 text-paper"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </span>
            {`${selectedTotalCount}건 선택됨${
              selectedFacilityGroups.length > 0 ? ` · 시설 ${selectedFacilityGroups.length}곳` : ''
            }`}
          </p>
          <div className="flex gap-1">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExcludedIds(new Set())}>
              전체 선택
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setExcludedIds(new Set(visibleSelectableIds))}
            >
              전체 해제
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <ViewModeToggle view={view} onChange={setView} />
            <button
              type="button"
              className="btn btn-primary btn-sm bg-ink-deep hover:bg-ink"
              disabled={selectedTotalCount === 0}
              onClick={() => setBulkDialogOpen(true)}
            >
              제출 목록 만들기
              {selectedFacilityGroups.length > 1 ? ` (${selectedFacilityGroups.length}개 시설)` : ''}
            </button>
          </div>
        </div>

        {/* 필터 행(목업 B) — 조회 기간·동아리 검색·제출 상태. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-[18px] py-3">
          <input
            type="date" aria-label="시작일" value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="rounded-[10px] border border-line bg-paper px-3 py-[7px] text-[13px] text-charcoal"
          />
          <span aria-hidden className="text-xs text-charcoal-3">–</span>
          <input
            type="date" aria-label="종료일" value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="rounded-[10px] border border-line bg-paper px-3 py-[7px] text-[13px] text-charcoal"
          />
          <input
            type="search" aria-label="동아리 검색" value={clubKeyword} placeholder="동아리 검색"
            onChange={(event) => setClubKeyword(event.target.value)}
            className="rounded-[10px] bg-graysoft px-3.5 py-2 text-[13px] text-charcoal placeholder:text-charcoal-3"
          />
          <select
            aria-label="제출 상태"
            className="rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] font-semibold text-charcoal"
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
        </div>

        {candidatesParams !== null && (
          <>
            {candidatesQuery.isLoading && <LoadingGate className="min-h-0 py-8" label="예약 목록 불러오는 중" />}
            {!candidatesQuery.isLoading && candidatesQuery.isError && (
              <div role="alert" className="px-[18px] py-8 text-sm text-charcoal-2">
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
                  body={'예약을 승인하면 여기에 자동으로 표시돼요.\n대기 중인 신청은 예약 검토 탭에서 처리할 수 있어요.'}
                  action={
                    <Link href={toRoute('/admin/facility-bookings?tab=review')} className="btn btn-secondary btn-sm">
                      예약 검토로 이동
                    </Link>
                  }
                />
              )
            )}
            {!candidatesQuery.isLoading && candidatesQuery.isSuccess && sections.length > 0 && (
              <ul>
                {sections.map((section, sectionIndex) => {
                  const sectionSelectedCount = deriveSelectedIds(section.bookings, excludedIds).length;
                  const sectionNeedCount = section.bookings.filter((booking) => booking.selectable).length;
                  return (
                    <li
                      key={section.facilityId}
                      className={sectionIndex < sections.length - 1 ? 'border-b-8 border-graysoft' : ''}
                    >
                      {/* 시설 그룹 헤더(목업 B) — sage-tint 밴드, 배치=시설 단위 제약의 시각화. */}
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-sage-tint px-[18px] py-[13px]">
                        <h2 className="text-[14.5px] font-extrabold text-ink-deep">{section.facilityName}</h2>
                        <p className="text-xs text-charcoal-3">
                          학교에 제출할 예약 {sectionNeedCount}건 · 선택 {sectionSelectedCount}건
                        </p>
                      </div>
                      <div className={view === 'list' ? 'px-2 py-2' : 'px-[18px] py-3'}>
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
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </ConsoleCard>

      <SubmissionDetailSheet
        booking={detailBooking}
        facilityName={detailBooking?.facilityName ?? (detailBooking !== null ? `시설 ${detailBooking.facilityId}` : '')}
        onClose={() => setDetailBooking(null)}
      />
      {bulkDialogOpen && (
        <BatchBulkCreateDialog
          groups={selectedFacilityGroups}
          isPending={bulkSubmitting}
          onClose={() => {
            if (!bulkSubmitting) setBulkDialogOpen(false);
          }}
          onConfirm={(groups, memoByFacilityId) => void handleBulkCreate(groups, memoByFacilityId)}
        />
      )}
      {bulkOutcomes !== null && (
        <BatchBulkCreateResultDialog outcomes={bulkOutcomes} onClose={() => setBulkOutcomes(null)} />
      )}
    </div>
  );
}
