'use client';

import { useState } from 'react';
import type { ClubMember, ClubMemberRole } from '@duing/types';
import {
  useRemoveMemberMutation,
  useUpdateMemberGenerationMutation,
  useUpdateMemberRoleMutation,
} from '@duing/hooks';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { clubMemberRoleLabel } from '@/app/_lib/clubMemberRoleLabel';
import { runBulkMemberAction, type BulkMemberFailure } from '../_lib/runBulkMemberAction';

type ActionKey = 'promote' | 'demote' | 'generation' | 'remove';

type BulkSummary = {
  label: string;
  succeeded: number;
  failed: BulkMemberFailure[];
  // 승급/강등/탈퇴에서 제외된 회장 행(기존 단건 정책과 동일 — 요약에 표기).
  skippedLeaders: ClubMember[];
  // 이미 목표 역할이라 제외된 회원 — no-op PATCH 가 ROLE_CHANGED 감사 이력을 오염시키므로 보내지 않는다.
  skippedSameRole?: ClubMember[];
  skippedSameRoleLabel?: string;
};

type MemberBulkToolbarProps = {
  clubId: number;
  // MemberTable 과 동일한 선택 모델(Set)을 그대로 공유받는다.
  selectedIds: ReadonlySet<number>;
  // 이름 표시·회장 스킵 판정용. 화면에 보이는 전체 목록을 넘기면 선택분만 걸러 쓴다.
  members: ClubMember[];
  useGeneration: boolean;
  // 승급·강등·탈퇴는 회장 전용 — OFFICER 뷰어에겐 기수 변경만 노출한다(BE 도 OFFICER 403).
  viewerRole: ClubMemberRole;
  // 작업 1건이 끝날 때마다 부모가 목록을 갱신(invalidate)하도록 알린다.
  onDone: () => void;
};

export function MemberBulkToolbar({
  clubId,
  selectedIds,
  members,
  useGeneration,
  viewerRole,
  onDone,
}: MemberBulkToolbarProps) {
  const isLeaderViewer = viewerRole === 'LEADER';
  const updateRole = useUpdateMemberRoleMutation(clubId);
  const updateGeneration = useUpdateMemberGenerationMutation(clubId);
  const removeMember = useRemoveMemberMutation(clubId);

  const [running, setRunning] = useState<ActionKey | null>(null);
  const [summary, setSummary] = useState<BulkSummary | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showGenerationDialog, setShowGenerationDialog] = useState(false);
  const [generationValue, setGenerationValue] = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);

  // 선택된 회원을 목록 순서대로 유지 — 순차 호출 순서가 화면 순서와 일치한다.
  const selectedMembers = members.filter((member) => selectedIds.has(member.memberId));
  const nameFor = (id: number) => members.find((member) => member.memberId === id)?.name ?? `#${id}`;

  if (selectedMembers.length === 0 && summary === null) return null;

  function partitionByLeader() {
    const actionable = selectedMembers.filter((member) => member.role !== 'LEADER');
    const skippedLeaders = selectedMembers.filter((member) => member.role === 'LEADER');
    return { actionable, skippedLeaders };
  }

  async function runRoleChange(action: 'promote' | 'demote') {
    const { actionable, skippedLeaders } = partitionByLeader();
    const nextRole = action === 'promote' ? 'OFFICER' : 'MEMBER';
    const label = action === 'promote' ? `${clubMemberRoleLabel('OFFICER')} 승급` : `${clubMemberRoleLabel('MEMBER')} 강등`;
    // 이미 목표 역할인 회원은 제외 — 동일 role PATCH 도 BE 가 ROLE_CHANGED 이력을 남겨 감사 로그를 오염시킨다.
    const targets = actionable.filter((member) => member.role !== nextRole);
    const skippedSameRole = actionable.filter((member) => member.role === nextRole);
    setRunning(action);
    const result = await runBulkMemberAction(
      targets.map((member) => member.memberId),
      async (id) => {
        await updateRole.mutateAsync({ memberId: id, payload: { role: nextRole } });
      },
    );
    setRunning(null);
    setSummary({
      label,
      ...result,
      skippedLeaders,
      skippedSameRole,
      skippedSameRoleLabel: clubMemberRoleLabel(nextRole),
    });
    onDone();
  }

  function onClickRemove() {
    const { actionable, skippedLeaders } = partitionByLeader();
    // 대상이 회장뿐이면 확인 다이얼로그 없이 바로 스킵 요약만 보여준다.
    if (actionable.length === 0) {
      setSummary({ label: '탈퇴 처리', succeeded: 0, failed: [], skippedLeaders });
      return;
    }
    setShowRemoveConfirm(true);
  }

  async function confirmRemove() {
    const { actionable, skippedLeaders } = partitionByLeader();
    setRunning('remove');
    const result = await runBulkMemberAction(
      actionable.map((member) => member.memberId),
      async (id) => {
        await removeMember.mutateAsync(id);
      },
    );
    setRunning(null);
    setShowRemoveConfirm(false);
    setSummary({ label: '탈퇴 처리', ...result, skippedLeaders });
    onDone();
  }

  function onClickGeneration() {
    setGenerationValue('');
    setGenerationError(null);
    setShowGenerationDialog(true);
  }

  async function confirmGeneration() {
    const trimmed = generationValue.trim();
    if (!/^\d+$/.test(trimmed) || Number(trimmed) < 1) {
      setGenerationError('기수는 1 이상의 정수여야 해요');
      return;
    }
    setGenerationError(null);
    const nextGeneration = Number(trimmed);
    setRunning('generation');
    // 기수 변경은 회장을 제외하지 않는다 — 선택된 전원에게 적용.
    const result = await runBulkMemberAction(
      selectedMembers.map((member) => member.memberId),
      async (id) => {
        await updateGeneration.mutateAsync({ memberId: id, payload: { generation: nextGeneration } });
      },
    );
    setRunning(null);
    setShowGenerationDialog(false);
    setSummary({ label: `기수 ${nextGeneration}기로 변경`, ...result, skippedLeaders: [] });
    onDone();
  }

  const actionable = selectedMembers.filter((member) => member.role !== 'LEADER');
  const removeCount = actionable.length;

  return (
    <div
      role="region"
      aria-label="회원 일괄 작업"
      data-bottom-bar
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:px-6">
        {summary && (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col gap-1 rounded-md border border-line bg-graysoft/40 px-3 py-2 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-charcoal">
                {summary.label} — {summary.succeeded}명 처리
                {summary.failed.length > 0 && (
                  <span className="text-rose-600">, {summary.failed.length}명 실패</span>
                )}
              </p>
              <button
                type="button"
                onClick={() => setSummary(null)}
                aria-label="결과 닫기"
                className="rounded px-2 py-0.5 text-xs text-charcoal-2 hover:bg-graysoft"
              >
                닫기
              </button>
            </div>
            {summary.skippedLeaders.length > 0 && (
              <p className="text-xs text-charcoal-2">
                회장 {summary.skippedLeaders.map((member) => member.name).join(', ')} 님은 이 작업 대상이 아니라 제외했어요.
              </p>
            )}
            {summary.skippedSameRole && summary.skippedSameRole.length > 0 && (
              <p className="text-xs text-charcoal-2">
                이미 {summary.skippedSameRoleLabel} {summary.skippedSameRole.length}명은 제외했어요.
              </p>
            )}
            {summary.failed.length > 0 && (
              <ul className="list-disc pl-4 text-xs text-rose-600">
                {summary.failed.map((failure) => (
                  <li key={failure.id}>
                    {nameFor(failure.id)}: {failure.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {selectedMembers.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="text-sm font-medium text-slate-700">
              선택 <span className="font-bold text-slate-900">{selectedMembers.length}</span>명
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              {isLeaderViewer && (
                <>
                  <button
                    type="button"
                    onClick={() => runRoleChange('promote')}
                    disabled={running !== null}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-line px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 sm:py-1.5 sm:text-xs"
                  >
                    {running === 'promote' && <ButtonSpinner />}
                    {clubMemberRoleLabel('OFFICER')} 승급
                  </button>
                  <button
                    type="button"
                    onClick={() => runRoleChange('demote')}
                    disabled={running !== null}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-line px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 sm:py-1.5 sm:text-xs"
                  >
                    {running === 'demote' && <ButtonSpinner />}
                    {clubMemberRoleLabel('MEMBER')} 강등
                  </button>
                </>
              )}
              {useGeneration && (
                <button
                  type="button"
                  onClick={onClickGeneration}
                  disabled={running !== null}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-line px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 sm:py-1.5 sm:text-xs"
                >
                  {running === 'generation' && <ButtonSpinner />}
                  기수 변경
                </button>
              )}
              {isLeaderViewer && (
                <button
                  type="button"
                  onClick={onClickRemove}
                  disabled={running !== null}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-rose-200 px-3 py-2 text-[13px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 sm:py-1.5 sm:text-xs"
                >
                  {running === 'remove' && <ButtonSpinner />}
                  탈퇴
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 공통 규칙(실패 시 모달 유지 + 모달 안 오류)의 의도적 예외.
          일괄 처리는 단일 요청 실패가 아니라 부분 성공 결과(성공 N·실패 M·제외 목록)를 돌려주므로,
          모달을 닫고 목록 위 결과 패널에서 알린다. 단일 오류 문구로는 이 구조를 담을 수 없다. */}
      <ConfirmDialog
        open={showRemoveConfirm}
        title="선택한 회원을 탈퇴 처리할까요?"
        description={`${removeCount}명을 동아리에서 탈퇴 처리합니다. 되돌릴 수 없어요.`}
        confirmLabel="탈퇴"
        isPending={running === 'remove'}
        onConfirm={confirmRemove}
        onCancel={() => setShowRemoveConfirm(false)}
      />

      <Dialog
        open={showGenerationDialog}
        onOpenChange={(open) => {
          if (!open && running !== 'generation') setShowGenerationDialog(false);
        }}
      >
        <DialogContent
          className="max-w-sm"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (running === 'generation') event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>기수 일괄 변경</DialogTitle>
            <DialogDescription>
              선택한 {selectedMembers.length}명의 기수를 입력한 값으로 한 번에 바꿉니다.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={generationValue}
              disabled={running === 'generation'}
              onChange={(event) => setGenerationValue(event.target.value)}
              placeholder="예: 12"
              aria-label="기수"
              className="w-24 rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm text-charcoal focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <span className="text-sm text-charcoal-2">기</span>
          </div>
          {generationError && (
            <p role="alert" className="text-xs text-rose-600">
              {generationError}
            </p>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={() => setShowGenerationDialog(false)}
              disabled={running === 'generation'}
              className="btn btn-ghost btn-sm"
            >
              취소
            </button>
            <button
              type="button"
              onClick={confirmGeneration}
              disabled={running === 'generation'}
              className="btn btn-sm bg-ink text-paper transition-colors hover:bg-ink-deep disabled:opacity-50"
            >
              {running === 'generation' && <ButtonSpinner />}
              변경
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
