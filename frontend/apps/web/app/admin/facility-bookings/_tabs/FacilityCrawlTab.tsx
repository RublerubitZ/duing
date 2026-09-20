'use client';

import { useMemo, useState } from 'react';
import type { AdminCrawlGroupBy, AdminCrawlReservationGroup } from '@duing/types';
import { useAdminCrawlReservationsQuery, useFacilityListQuery } from '@duing/hooks';

import { ConsoleCard } from '../../_components/ConsoleCard';
import { EmptyState } from '../../_components/EmptyState';
import { ErrorState } from '../../_components/ErrorState';
import { Skeleton } from '@/components/loading/Skeleton';
import {
  contextDateLabel,
  crawledAtLabel,
  foldReservationContexts,
  nextYearMonth,
  seoulYearMonth,
} from '../_lib/crawlGrouping';

const PAGE_SIZE = 10;

const GROUP_BY_OPTIONS: { value: AdminCrawlGroupBy; label: string }[] = [
  { value: 'CLUB', label: '동아리별' },
  { value: 'FACILITY', label: '시설별' },
  { value: 'FACILITY_DATE', label: '시설+날짜별' },
];

// 크롤 예약=차단, 기본 확보 시간=비차단(신청 가능) — 배지는 그 구분 표시다.
const CLASSIFICATION_META = {
  CRAWLED_RESERVATION: { label: '크롤 예약', className: 'bg-graysoft text-charcoal-2' },
  BASIC_SECURED_TIME: { label: '기본 확보 시간', className: 'bg-sage-mist text-ink border border-sage-soft' },
} as const;

/**
 * 크롤 예약 현황(전면 차단 설계 §3.6, 수정 1~4) — 시설 예약 관리의 5번째 탭(동아리 중심 보기 스펙 §3).
 * 학교 크롤 원본을 정리 기준 3종으로 열람하는 읽기 전용 화면. 페이징 단위가 그룹이라 같은 주체가
 * 페이지 간 갈라지지 않고, 동아리별 보기에도 미매칭 주체(학교 행사·부서·기관)가 반드시 함께 나온다.
 * 분류 전환은 동아리 관리의 "기본 확보 시간 대상" 토글이 담당한다(크롤 예약=차단, 기본 확보 시간=비차단).
 * 페이지 헤더·안내문은 부모 페이지의 타이틀·PurposeNote 가 담당한다.
 */
export function FacilityCrawlTab() {
  const currentMonth = useMemo(() => seoulYearMonth(new Date()), []);
  const [yearMonth, setYearMonth] = useState(currentMonth);
  const [groupBy, setGroupBy] = useState<AdminCrawlGroupBy>('CLUB');
  const [facilityId, setFacilityId] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(0);

  const facilitiesQuery = useFacilityListQuery();
  const reservationsQuery = useAdminCrawlReservationsQuery({
    yearMonth,
    facilityId,
    groupBy,
    page,
    size: PAGE_SIZE,
  });

  const monthOptions = [currentMonth, nextYearMonth(currentMonth)];
  const totalElements = reservationsQuery.data?.totalElements ?? 0;
  const totalPages = reservationsQuery.data?.totalPages ?? 0;
  const hasNext = page + 1 < totalPages;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="정리 기준" className="flex rounded-lg border border-line bg-paper p-0.5">
          {GROUP_BY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={groupBy === option.value}
              onClick={() => {
                setGroupBy(option.value);
                setPage(0);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                groupBy === option.value ? 'bg-ink text-cream' : 'text-charcoal-2 hover:bg-graysoft'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="조회 월" className="flex rounded-lg border border-line bg-paper p-0.5">
          {monthOptions.map((month) => (
            <button
              key={month}
              type="button"
              aria-pressed={yearMonth === month}
              onClick={() => {
                setYearMonth(month);
                setPage(0);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                yearMonth === month ? 'bg-ink text-cream' : 'text-charcoal-2 hover:bg-graysoft'
              }`}
            >
              {month === currentMonth ? `이번 달 (${month})` : `다음 달 (${month})`}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-charcoal-2">
          시설
          <select
            value={facilityId ?? ''}
            onChange={(event) => {
              setFacilityId(event.target.value === '' ? undefined : Number(event.target.value));
              setPage(0);
            }}
            className="rounded-md border border-line bg-paper px-2 py-1.5 text-xs"
          >
            <option value="">전체</option>
            {(facilitiesQuery.data ?? []).map((facility) => (
              <option key={facility.id} value={facility.id}>
                {facility.roomName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ConsoleCard>
        {reservationsQuery.isPending && (
          <div className="space-y-3 p-6" aria-label="크롤 예약 불러오는 중">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}
        {reservationsQuery.isError && (
          <ErrorState
            message="크롤 예약을 불러오지 못했어요."
            onRetry={() => void reservationsQuery.refetch()}
          />
        )}
        {reservationsQuery.data && reservationsQuery.data.content.length === 0 && (
          <EmptyState icon="🗓️" title="크롤 예약이 없어요" body="이 조건에 수집된 학교 예약이 없습니다." />
        )}
        {reservationsQuery.data && reservationsQuery.data.content.length > 0 && (
          <ul className="divide-y divide-line">
            {reservationsQuery.data.content.map((group) => (
              <CrawlGroupRow key={groupKeyOf(group)} group={group} />
            ))}
          </ul>
        )}
      </ConsoleCard>

      <footer className="flex items-center justify-between text-xs text-charcoal-3">
        <span>총 {totalElements}개 그룹</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            disabled={page === 0}
            className="rounded-md border border-line px-2 py-1 disabled:opacity-40"
          >
            이전
          </button>
          <span>
            {page + 1} / {Math.max(1, totalPages)}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={!hasNext}
            className="rounded-md border border-line px-2 py-1 disabled:opacity-40"
          >
            다음
          </button>
        </div>
      </footer>
    </div>
  );
}

function groupKeyOf(group: AdminCrawlReservationGroup): string {
  return [group.groupType, group.clubId ?? '', group.facilityId ?? '', group.reservationDate ?? '', group.title].join(':');
}

function CrawlGroupRow({ group }: { group: AdminCrawlReservationGroup }) {
  // 동아리별·미매칭 그룹은 제목이 곧 주체라 생략하고, 시설 축 그룹에서만 행마다 주체를 보여준다(수정 3 — 맥락은 주체·시설 단위).
  const showsOrganization = group.groupType === 'FACILITY' || group.groupType === 'FACILITY_DATE';
  // 주체가 그룹으로 고정된 경우(동아리별·미매칭)는 raw 표기 변형이 접기를 가르지 않도록 키에서 주체를 뺀다.
  const contexts = foldReservationContexts(group.reservations, { subjectFixedByGroup: !showsOrganization });
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold text-ink-deep">{group.title}</p>
        {group.groupType === 'CLUB' && (
          <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            매칭 동아리
          </span>
        )}
        {group.groupType === 'EXTERNAL' && (
          <span className="rounded-full bg-graysoft px-1.5 py-0.5 text-[10px] font-semibold text-charcoal-2">
            매칭 없음
          </span>
        )}
        {group.facilitySecuredTimeTarget === true && (
          <span className="rounded-full bg-emerald-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            기본 확보 대상
          </span>
        )}
        {group.groupType === 'FACILITY_DATE' && group.reservationDate !== undefined && (
          <span className="tabular-nums text-xs text-charcoal-3">{group.reservationDate}</span>
        )}
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {contexts.map((context) => {
          const meta = CLASSIFICATION_META[context.classification];
          return (
            <li
              key={`${context.organizationName}-${context.facilityId}-${context.startDate}-${context.startTime}-${context.endTime}-${context.classification}`}
              className="flex flex-wrap items-center gap-2 text-[13px]"
            >
              {showsOrganization && (
                <span className="font-semibold text-ink-deep">{context.organizationName}</span>
              )}
              <span className="text-charcoal-2">{context.facilityName ?? '알 수 없는 시설'}</span>
              <span className="tabular-nums text-charcoal-3">{contextDateLabel(context)}</span>
              <span className="tabular-nums font-semibold text-ink">
                {context.startTime}~{context.endTime}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>
                {meta.label}
              </span>
              {context.reservations.length > 1 && (
                <span className="text-[11px] text-charcoal-3">({context.reservations.length}건 연속)</span>
              )}
              <span className="text-[11px] text-charcoal-3">
                마지막 변경 {crawledAtLabel(context.reservations[0]?.crawledAt ?? '')}
              </span>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
