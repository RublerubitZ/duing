'use client';

import { use, useState } from 'react';
import { notFound } from 'next/navigation';
import type { ClubMember } from '@duing/types';
import {
  useClubMembersQuery,
  useManagedClubsQuery,
  useMeQuery,
  useTransferLeaderMutation,
} from '@duing/hooks';
import { MemberSection } from './_components/MemberSection';
import { TransferLeaderDialog } from './_components/TransferLeaderDialog';

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
  const transferLeader = useTransferLeaderMutation(currentClubId);

  const [transferTarget, setTransferTarget] = useState<ClubMember | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  if (isMeLoading || isManagedLoading || isMembersLoading) {
    return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  }

  const managedClub = managedClubs?.find((club) => club.clubId === currentClubId);
  if (!managedClub || !me) {
    notFound();
  }

  const leaders = members?.filter((m) => m.role === 'LEADER') ?? [];
  const officers = members?.filter((m) => m.role === 'OFFICER') ?? [];
  const regulars = members?.filter((m) => m.role === 'MEMBER') ?? [];

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
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <header>
        <h1 className="text-xl font-bold">멤버 관리</h1>
        <p className="mt-1 text-sm text-slate-500">
          역할별 멤버를 확인하고, 회장은 역할 변경·강퇴·인계를 할 수 있습니다.
        </p>
      </header>

      <MemberSection
        title="회장"
        members={leaders}
        clubId={currentClubId}
        viewerRole={managedClub.myRole}
        viewerUserId={me.id}
        onTransferLeader={setTransferTarget}
      />
      <MemberSection
        title="운영진"
        members={officers}
        clubId={currentClubId}
        viewerRole={managedClub.myRole}
        viewerUserId={me.id}
        onTransferLeader={setTransferTarget}
      />
      <MemberSection
        title="일반 멤버"
        members={regulars}
        clubId={currentClubId}
        viewerRole={managedClub.myRole}
        viewerUserId={me.id}
        onTransferLeader={setTransferTarget}
      />

      {transferError && <p className="text-sm text-rose-600">{transferError}</p>}

      {transferTarget && (
        <TransferLeaderDialog
          target={transferTarget}
          clubName={managedClub.clubName}
          isPending={transferLeader.isPending}
          onConfirm={doTransfer}
          onCancel={() => { setTransferTarget(null); setTransferError(null); }}
        />
      )}
    </div>
  );
}