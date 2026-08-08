'use client';

import { use, useState } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { ClubMember } from '@duing/types';
import {
  useClubDetailQuery,
  useClubMembersQuery,
  useJoinRequestsQuery,
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
import { ClubInviteDialog } from './_components/ClubInviteDialog';
import { SuccessionRequestModal } from './_components/SuccessionRequestModal';
import { TransferLeaderDialog } from './_components/TransferLeaderDialog';
import {
  availableGenerations,
  EMPTY_MEMBER_FILTERS,
  filterMembers,
  normalizeMemberFilters,
  type MemberFilters,
} from './_lib/memberFilters';
import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
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
  // 헤더 배지용 대기 건수. 실패해도 배지만 빠지고 화면은 그대로다(로딩 게이트에 넣지 않는다).
  const { data: pendingJoinRequests } = useJoinRequestsQuery(
    isValidId ? currentClubId : undefined,
    'PENDING',
  );

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
  // 선택·벌크 툴바: 회장은 전체 액션, 임원(OFFICER)은 기수 일괄 변경만 —
  // 기수를 안 쓰는 동아리의 임원에겐 실행 가능한 벌크 액션이 없어 선택 UI 자체를 닫는다.
  const bulkEnabled = isLeader || useGeneration;
  const memberList = members ?? [];
  const pendingCount = pendingJoinRequests?.length ?? 0;
  const generations = availableGenerations(memberList);
  // 사라진 기수를 가리키는 필터는 렌더 시점에 무효화 — 상태를 되돌리지 않아도 화면과 목록이 어긋나지 않는다.
  const effectiveFilters = normalizeMemberFilters(filters, generations);

  const filtered = filterMembers(memberList, { query, filters: effectiveFilters, useGeneration });
  const filteredIds = new Set(filtered.map((member) => member.memberId));

  // 필터와 무관하게 전체 목록에서 파생 — 필터로 가려져도 패널은 유지되고, 명단에서 빠지면 자동 닫힘.
  const detailMember =
    detailMemberId === null
      ? null
      : memberList.find((member) => member.memberId === detailMemberId) ?? null;
  const detailOpen = detailMember !== null;

  // 필터(칩·기수)가 바뀌면 화면에서 사라진 회원의 선택을 조용히 남기지 않도록 교집합으로 정리한다.
  // 검색어에는 적용하지 않는다 — 타이핑 한 글자에 선택이 영구 소실되고, 검색어를 지워도 복구되지 않는다.
  // 검색 중 가려진 선택은 벌크 툴바가 filtered 와 교집합만 대상으로 삼아 실행되지 않는다.
  function handleFiltersChange(nextFilters: MemberFilters) {
    setFilters(nextFilters);
    // 검색어를 빼고 계산한다 — 검색어를 포함하면 칩 클릭 한 번에 "검색에 안 걸린 선택"까지 사라져
    // 위 규칙(검색어는 선택을 건드리지 않는다)이 다른 입구로 깨진다.
    const visibleByFilters = new Set(
      filterMembers(memberList, { query: '', filters: nextFilters, useGeneration }).map(
        (member) => member.memberId,
      ),
    );
    setSelectedIds((prev) => new Set([...prev].filter((id) => visibleByFilters.has(id))));
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
      // 벌크 툴바 사용 가능 시 하단 여백: 선택하면 나타나는 fixed 툴바가 콘텐츠를 가리지 않도록 자리 확보(레이아웃 점프 회피).
      className={cn('mx-auto max-w-6xl space-y-6 px-6 py-10', bulkEnabled && 'pb-28')}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">회원 관리</h1>
          <p className="mt-1 text-sm text-charcoal-3">
            {useGeneration
              ? '회원을 검색·필터하고 기수를 정리할 수 있습니다. 역할 변경·탈퇴·회장 인계는 회장 전용입니다.'
              : '회원을 검색·필터할 수 있습니다. 역할 변경·탈퇴·회장 인계는 회장 전용입니다.'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* 가입 요청 처리·부원 초대는 운영진(LEADER/OFFICER) 공통 권한이다. 모집과 무관한
              부원 초대 링크가 실기능으로 추가돼 초대 진입점을 복원했다(스펙 2026-08-08 §7). */}
          <ClubInviteDialog clubId={currentClubId} useGeneration={useGeneration} />
          <Link
            href={toRoute(`/manage/clubs/${currentClubId}/members/requests`)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-charcoal-2 hover:border-ink hover:text-ink"
          >
            가입 요청
            {pendingCount > 0 && (
              <span className="rounded-full bg-coral px-1.5 py-0.5 text-xs font-semibold text-paper">
                {pendingCount}
              </span>
            )}
          </Link>
          {/* 명단 다운로드는 운영진(LEADER/OFFICER) 공통 — 이 페이지는 managedClub 이 없으면 notFound 다. */}
          <MemberCsvDownloadPopover
            clubId={currentClubId}
            clubName={managedClub.clubName}
            memberIds={filteredIds}
            useGeneration={useGeneration}
          />
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
          filters={effectiveFilters}
          onQueryChange={setQuery}
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
            selectable={bulkEnabled}
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

      {bulkEnabled && (
        <MemberBulkToolbar
          clubId={currentClubId}
          selectedIds={selectedIds}
          members={filtered}
          useGeneration={useGeneration}
          viewerRole={viewerRole}
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
