'use client';

import { useState } from 'react';
import type { ClubMember, ClubMemberRole } from '@duing/types';
import { GRADE_DISPLAY_NAME } from '@duing/types';
import {
  formatDateKst,
  useLeaveClubMutation,
  useRemoveMemberMutation,
  useUpdateMemberRoleMutation,
} from '@duing/hooks';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { RemoveMemberDialog } from './RemoveMemberDialog';

type MemberRowProps = {
  clubId: number;
  member: ClubMember;
  viewerRole: ClubMemberRole;
  viewerUserId: number;
  // 회장 인계는 부모(page)에서 단일 다이얼로그를 띄운다. 행은 트리거만 전달.
  onTransferLeader: (target: ClubMember) => void;
};

export function MemberRow({
  clubId, member, viewerRole, viewerUserId, onTransferLeader,
}: MemberRowProps) {
  const updateRole = useUpdateMemberRoleMutation(clubId);
  const removeMember = useRemoveMemberMutation(clubId);
  const leaveClub = useLeaveClubMutation(clubId);

  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSelf = member.userId === viewerUserId;
  const isLeader = member.role === 'LEADER';
  const isLeaderViewer = viewerRole === 'LEADER';

  async function changeRole(nextRole: 'OFFICER' | 'MEMBER') {
    const verb = nextRole === 'OFFICER' ? 'OFFICER 로 승급' : 'MEMBER 로 강등';
    if (!confirm(`${member.name} 님을 ${verb}할까요?`)) return;
    setError(null);
    try {
      await updateRole.mutateAsync({ memberId: member.memberId, payload: { role: nextRole } });
    } catch (err) {
      setError(err instanceof Error ? err.message : '역할 변경 실패');
    }
  }

  async function doRemove() {
    setError(null);
    try {
      await removeMember.mutateAsync(member.memberId);
      setShowRemoveDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '강퇴 실패');
    }
  }

  async function confirmLeave() {
    setError(null);
    try {
      await leaveClub.mutateAsync();
      setShowLeaveConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '탈퇴 실패');
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 rounded-md border border-slate-100 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">
          {member.name}
          {isSelf && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">본인</span>}
        </p>
        <p className="text-xs text-slate-500">
          학번 {member.studentId} · 가입 {formatDateKst(member.joinedAt)}
        </p>
        <p className="text-xs text-slate-500">
          {member.major} · {GRADE_DISPLAY_NAME[member.grade]}
          {member.phoneMasked && ` · ${member.phoneMasked}`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        {/* LEADER viewer, 본인 LEADER 행 */}
        {isLeaderViewer && isSelf && isLeader && (
          <button
            type="button"
            disabled
            title="회장 인계 후 가능"
            className="rounded-md px-3 py-2 text-[13px] sm:px-2 sm:py-1 sm:text-xs text-slate-300 cursor-not-allowed"
          >
            탈퇴
          </button>
        )}

        {/* LEADER viewer, 타인 OFFICER 행 */}
        {isLeaderViewer && !isSelf && member.role === 'OFFICER' && (
          <>
            <button
              type="button"
              onClick={() => changeRole('MEMBER')}
              className="rounded-md px-3 py-2 text-[13px] sm:px-2 sm:py-1 sm:text-xs text-slate-700 hover:bg-slate-100"
            >
              MEMBER 로 강등
            </button>
            <button
              type="button"
              onClick={() => onTransferLeader(member)}
              className="rounded-md px-3 py-2 text-[13px] sm:px-2 sm:py-1 sm:text-xs text-slate-700 hover:bg-slate-100"
            >
              회장 인계
            </button>
            <button
              type="button"
              onClick={() => setShowRemoveDialog(true)}
              className="rounded-md px-3 py-2 text-[13px] sm:px-2 sm:py-1 sm:text-xs text-rose-600 hover:bg-rose-50"
            >
              강퇴
            </button>
          </>
        )}

        {/* LEADER viewer, 타인 MEMBER 행 */}
        {isLeaderViewer && !isSelf && member.role === 'MEMBER' && (
          <>
            <button
              type="button"
              onClick={() => changeRole('OFFICER')}
              className="rounded-md px-3 py-2 text-[13px] sm:px-2 sm:py-1 sm:text-xs text-slate-700 hover:bg-slate-100"
            >
              OFFICER 로 승급
            </button>
            <button
              type="button"
              onClick={() => onTransferLeader(member)}
              className="rounded-md px-3 py-2 text-[13px] sm:px-2 sm:py-1 sm:text-xs text-slate-700 hover:bg-slate-100"
            >
              회장 인계
            </button>
            <button
              type="button"
              onClick={() => setShowRemoveDialog(true)}
              className="rounded-md px-3 py-2 text-[13px] sm:px-2 sm:py-1 sm:text-xs text-rose-600 hover:bg-rose-50"
            >
              강퇴
            </button>
          </>
        )}

        {/* OFFICER viewer, 본인 행: 탈퇴 가능 */}
        {viewerRole === 'OFFICER' && isSelf && (
          <button
            type="button"
            onClick={() => setShowLeaveConfirm(true)}
            className="rounded-md px-3 py-2 text-[13px] sm:px-2 sm:py-1 sm:text-xs text-rose-600 hover:bg-rose-50"
          >
            탈퇴
          </button>
        )}

        {/* OFFICER viewer, 타인 행 → 액션 없음 (읽기 전용). 의도된 빈 상태. */}
      </div>

      {error && <p className="ml-3 text-xs text-rose-600">{error}</p>}

      {showRemoveDialog && (
        <RemoveMemberDialog
          targetName={member.name}
          isPending={removeMember.isPending}
          onConfirm={doRemove}
          onCancel={() => setShowRemoveDialog(false)}
        />
      )}

      <ConfirmDialog
        open={showLeaveConfirm}
        title="동아리를 탈퇴할까요?"
        description="탈퇴하면 이 동아리에서 빠지며, 되돌리려면 다시 가입해야 합니다."
        confirmLabel="탈퇴"
        isPending={leaveClub.isPending}
        onConfirm={confirmLeave}
        onCancel={() => setShowLeaveConfirm(false)}
      />
    </div>
  );
}
