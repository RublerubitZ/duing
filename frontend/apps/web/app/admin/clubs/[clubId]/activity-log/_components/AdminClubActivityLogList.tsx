'use client';

import { useState } from 'react';

import { useAdminClubActivityEventsQuery } from '@duing/hooks';
import { formatDateTimeKst } from '@duing/hooks/datetime';
import type { AdminClubActivityEventType } from '@duing/types';

import { Pagination } from '@/components/Pagination';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { ConsoleCard } from '@/app/admin/_components/ConsoleCard';
import { EmptyState } from '@/app/admin/_components/EmptyState';
import { ErrorState } from '@/app/admin/_components/ErrorState';
import { FeeFilterChips } from '@/app/admin/fees/_components/FeeFilterChips';
import { activityActorLabel, activityDetailSummary, activityEventLabel } from '../_lib/activityLabels';

const PAGE_SIZE = 20;

type ActivityGroup = 'STATUS' | 'LINK';

/** 유형그룹 → 서버 types. 부원 초대와 모집 링크는 같은 이벤트라 행 라벨로 갈린다(칩으로는 가르지 않는다). */
const GROUP_TYPES: Record<ActivityGroup, AdminClubActivityEventType[]> = {
  STATUS: ['CLUB_STATUS_CHANGED', 'CLUB_CLOSED'],
  LINK: ['JOIN_LINK_CREATED', 'JOIN_LINK_REGENERATED', 'JOIN_LINK_REVOKED'],
};

const GROUP_OPTIONS: { label: string; value?: ActivityGroup }[] = [
  { label: '전체', value: undefined },
  { label: '상태', value: 'STATUS' },
  { label: '가입 링크', value: 'LINK' },
];

/**
 * 동아리 활동 이력 목록. 표가 아니라 행 나열이다 — 사유·detail 요약 길이가 제각각이라 열에 가두면 잘린다(회비 감사 로그 선례).
 * 재발급은 같은 트랜잭션의 "폐기" 행과 함께 두 행으로 보인다(기록 구조 그대로).
 */
export function AdminClubActivityLogList({ clubId }: { clubId: number }) {
  const [group, setGroup] = useState<ActivityGroup | undefined>(undefined);
  const [page, setPage] = useState(0);

  const eventsQuery = useAdminClubActivityEventsQuery(clubId, {
    // 모듈 상수를 그대로 넘겨 배열 참조가 렌더마다 바뀌지 않게 한다(React Query 키 안정).
    types: group === undefined ? undefined : GROUP_TYPES[group],
    page,
    size: PAGE_SIZE,
  });

  const events = eventsQuery.data?.content ?? [];

  return (
    <div className="flex flex-col gap-3">
      <FeeFilterChips
        ariaLabel="이벤트 유형 필터"
        options={GROUP_OPTIONS}
        value={group}
        onChange={(next) => {
          setGroup(next);
          setPage(0);
        }}
      />

      {eventsQuery.isLoading && (
        <ListRowsSkeleton rows={6} rowClassName="h-14 rounded-md" label="활동 이력 조회 중" />
      )}

      {eventsQuery.isError && (
        <ConsoleCard>
          <ErrorState message="활동 이력을 불러오지 못했어요." onRetry={() => void eventsQuery.refetch()} />
        </ConsoleCard>
      )}

      {eventsQuery.isSuccess && (
        <div
          aria-busy={eventsQuery.isPlaceholderData}
          className={eventsQuery.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
        >
          {events.length === 0 ? (
            <ConsoleCard>
              <EmptyState
                icon="🗒️"
                title="기록된 활동이 없습니다"
                body={'선택한 유형에 기록된 활동이 없어요.\n활동 이력은 계측 배포 이후의 변경부터 기록됩니다.'}
              />
            </ConsoleCard>
          ) : (
            <ConsoleCard>
              <ul aria-label="동아리 활동 이력">
                {events.map((event) => {
                  const note = [activityDetailSummary(event), event.reason ? `사유: ${event.reason}` : '']
                    .filter((part) => part !== '')
                    .join(' · ');
                  return (
                    <li key={event.eventId} className="border-t border-line px-4 py-3 first:border-t-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                        <time
                          dateTime={event.createdAt}
                          className="whitespace-nowrap tabular-nums text-charcoal-3"
                        >
                          {formatDateTimeKst(event.createdAt)}
                        </time>
                        <span className="pill-outline inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold">
                          {activityEventLabel(event)}
                        </span>
                        <span className="text-charcoal">{activityActorLabel(event)}</span>
                      </div>
                      {note !== '' && (
                        <p className="mt-1 text-[12.5px] leading-snug text-charcoal-2">{note}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <Pagination
                page={page}
                totalPages={eventsQuery.data?.totalPages ?? 0}
                onChange={setPage}
                ariaLabel="활동 이력 페이지"
                totalElements={eventsQuery.data?.totalElements}
                pageSize={PAGE_SIZE}
                className="py-3"
              />
            </ConsoleCard>
          )}
        </div>
      )}
    </div>
  );
}
