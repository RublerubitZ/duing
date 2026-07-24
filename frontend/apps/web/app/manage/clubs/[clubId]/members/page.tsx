'use client';

import { use, useState } from 'react';
import { notFound } from 'next/navigation';
import type { ClubMember } from '@duing/types';
import {
  useClubDetailQuery,
  useClubMembersQuery,
  useManagedClubsQuery,
  useMeQuery,
  useTransferLeaderMutation,
} from '@duing/hooks';
import { MemberKpis } from './_components/MemberKpis';
import { MemberFilterChips } from './_components/MemberFilterChips';
import { MemberTable } from './_components/MemberTable';
import { MemberDetailPanel } from './_components/MemberDetailPanel';
import { MemberBulkToolbar } from './_components/MemberBulkToolbar';
import { MemberCsvDownloadPopover } from './_components/MemberCsvDownloadPopover';
import { SuccessionRequestModal } from './_components/SuccessionRequestModal';
import { TransferLeaderDialog } from './_components/TransferLeaderDialog';
import {
  availableGenerations,
  EMPTY_MEMBER_FILTERS,
  filterMembers,
  type MemberFilters,
} from './_lib/memberFilters';
import { cn } from '@/app/_lib/cn';
import { LoadingGate } from '@/components/loading/LoadingGate';

export default function ClubMembersPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const currentClubId = Number(clubIdParam);
  const isValidId = !isNaN(currentClubId);

  const { data: me, isLoading: isMeLoading } = useMeQuery();
  const { data: managedClubs, isLoading: isManagedLoading } = useManagedClubsQuery();
  const { data: members, isLoading: isMembersLoading } = useClubMembersQuery(
    isValidId ? currentClubId : undefined,
  );
  const { data: clubDetail, isLoading: isDetailLoading } = useClubDetailQuery(
    isValidId ? currentClubId : undefined,
  );
  const transferLeader = useTransferLeaderMutation(currentClubId);

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<MemberFilters>(EMPTY_MEMBER_FILTERS);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(() => new Set());
  // 상세 패널은 id 만 들고 렌더 시 전체 목록에서 파생한다 — 뮤테이션 invalidate 후 최신값을 반영하고,
  // 명단에서 사라지면(탈퇴 등 refetch) find 미스로 자동 닫힌다. 객체 스냅샷을 잡으면 스테일 데이터가 남는다.
  const [detailMemberId, setDetailMemberId] = useState<number | null>(null);
  const [transferTarget, setTransferTarget] = useState<ClubMember | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [successionOpen, setSuccessionOpen] = useState(false);

  if (isMeLoading || isManagedLoading || isMembersLoading || isDetailLoading) {
    return <LoadingGate label="멤버 목록 불러오는 중" />;
  }

  const managedClub = managedClubs?.find((club) => club.clubId === currentClubId);
  if (!managedClub || !me) {
    notFound();
  }

  const viewerRole = managedClub.myRole;
  const isLeader = viewerRole === 'LEADER';
  const useGeneration = clubDetail?.useGeneration ?? false;
  const memberList = members ?? [];
  const generations = availableGenerations(memberList);

  const filtered = filterMembers(memberList, { query, filters, useGeneration });
  const filteredIds = new Set(filtered.map((member) => member.memberId));

  // 필터와 무관하게 전체 목록에서 파생 — 필터로 가려져도 패널은 유지되고, 명단에서 빠지면 자동 닫힘.
  const detailMember =
    detailMemberId === null
      ? null
      : memberList.find((member) => member.memberId === detailMemberId) ?? null;
  const detailOpen = detailMember !== null;

  // 검색·필터가 바뀌면 화면에서 사라진 회원의 선택을 조용히 남기지 않도록 교집합으로 정리한다.
  function pruneSelection(nextQuery: string, nextFilters: MemberFilters) {
    const visible = new Set(
      filterMembers(memberList, { query: nextQuery, filters: nextFilters, useGeneration }).map(
        (member) => member.memberId,
      ),
    );
    setSelectedIds((prev) => new Set([...prev].filter((id) => visible.has(id))));
  }

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery);
    pruneSelection(nextQuery, filters);
  }

  function handleFiltersChange(nextFilters: MemberFilters) {
    setFilters(nextFilters);
    pruneSelection(query, nextFilters);
  }

  function toggleSelect(memberId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      const everyVisibleSelected =
        filtered.length > 0 && filtered.every((member) => prev.has(member.memberId));
      const next = new Set(prev);
      if (everyVisibleSelected) {
        filtered.forEach((member) => next.delete(member.memberId));
      } else {
        filtered.forEach((member) => next.add(member.memberId));
      }
      return next;
    });
  }

  function openDetail(member: ClubMember) {
    setDetailMemberId(member.memberId);
  }

  async function doTransfer() {
    if (!transferTarget) return;
    setTransferError(null);
    try {
      await transferLeader.mutateAsync(transferTarget.memberId);
      setTransferTarget(null);
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : '회장 인계 실패');
    }
  }

  return (
    <div
      // isLeader 시 하단 여백: 선택하면 나타나는 fixed 벌크 툴바가 콘텐츠를 가리지 않도록 자리 확보(레이아웃 점프 회피).
      className={cn('mx-auto max-w-6xl space-y-6 px-6 py-10', isLeader && 'pb-28')}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">회원 관리</h1>
          <p className="mt-1 text-sm text-charcoal-3">
            회원을 검색·필터하고, 회장은 역할 변경·탈퇴·회장 인계를 할 수 있습니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isLeader && (
            <MemberCsvDownloadPopover
              clubId={currentClubId}
              clubName={managedClub.clubName}
              memberIds={filteredIds}
              useGeneration={useGeneration}
            />
          )}
          {viewerRole === 'OFFICER' && (
            <button
              type="button"
              onClick={() => setSuccessionOpen(true)}
              className="shrink-0 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-charcoal-2 hover:border-ink hover:text-ink"
            >
              회장 승계 요청
            </button>
          )}
        </div>
      </header>

      <MemberKpis members={memberList} useGeneration={useGeneration} />

      <div className="space-y-3">
        <MemberFilterChips
          query={query}
          filters={filters}
          onQueryChange={handleQueryChange}
          onChange={handleFiltersChange}
          useGeneration={useGeneration}
          generations={generations}
        />
        <p className="text-sm font-medium text-charcoal-2">결과 {filtered.length}명</p>
      </div>

      <div
        className={
          detailOpen
            ? 'gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start'
            : undefined
        }
      >
        <div className="min-w-0">
          <MemberTable
            members={filtered}
            useGeneration={useGeneration}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
            onOpenDetail={openDetail}
            query={query}
            selectable={isLeader}
          />
        </div>
        <div className="lg:sticky lg:top-4">
          <MemberDetailPanel
            member={detailMember}
            clubId={currentClubId}
            useGeneration={useGeneration}
            viewerRole={viewerRole}
            viewerUserId={me.id}
            open={detailOpen}
            onClose={() => setDetailMemberId(null)}
            onTransferLeader={(target) => {
              setDetailMemberId(null);
              setTransferTarget(target);
            }}
          />
        </div>
      </div>

      {isLeader && (
        <MemberBulkToolbar
          clubId={currentClubId}
          selectedIds={selectedIds}
          members={filtered}
          useGeneration={useGeneration}
          onDone={() => setSelectedIds(new Set())}
        />
      )}

      {transferError && <p className="text-sm text-coral">{transferError}</p>}

      {transferTarget && (
        <TransferLeaderDialog
          target={transferTarget}
          clubName={managedClub.clubName}
          isPending={transferLeader.isPending}
          onConfirm={doTransfer}
          onCancel={() => {
            setTransferTarget(null);
            setTransferError(null);
          }}
        />
      )}

      {successionOpen && (
        <SuccessionRequestModal
          clubId={currentClubId}
          clubName={managedClub.clubName}
          onClose={() => setSuccessionOpen(false)}
        />
      )}
    </div>
  );
}
