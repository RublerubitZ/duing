'use client';

import { useState } from 'react';

import { ApiError } from '@duing/api';
import { useLeaveClubMutation } from '@duing/hooks';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/app/_components/toast/ToastProvider';

type Props = {
  club: { clubId: number; clubName: string };
  onClose: () => void;
};

export function LeaveClubDialog({ club, onClose }: Props) {
  const { addToast } = useToast();
  const leaveMutation = useLeaveClubMutation(club.clubId);
  const [confirmName, setConfirmName] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  const isPending = leaveMutation.isPending;
  const nameMatches = confirmName.trim() === club.clubName.trim();
  const showNameMismatch = confirmName.length > 0 && !nameMatches;

  const handleLeave = () => {
    if (!nameMatches || isPending) return;
    setServerError(null);
    leaveMutation.mutate(undefined, {
      onSuccess: () => {
        addToast('동아리를 탈퇴했어요.');
        onClose();
      },
      onError: (mutationError) => {
        // 회장 탈퇴 거부(409) 등 — 서버 메시지를 그대로 안내한다.
        setServerError(
          mutationError instanceof ApiError
            ? mutationError.message
            : '탈퇴에 실패했어요. 잠시 후 다시 시도해 주세요.',
        );
      },
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !isPending) onClose();
      }}
    >
      <DialogContent aria-describedby="leave-club-confirm-desc">
        <DialogTitle>동아리를 탈퇴하시겠어요?</DialogTitle>
        <div id="leave-club-confirm-desc" className="space-y-2 text-[13.5px] leading-relaxed text-charcoal-2">
          <p>동아리를 탈퇴하면 동아리 공지, 일정, 회비 내역 등의 구성원 전용 정보를 더 이상 확인할 수 없습니다.</p>
          <p>이미 납부한 회비는 환불되지 않으며, 탈퇴 후에는 동아리 정책에 따라 다시 가입 신청이 필요할 수 있습니다.</p>
          <p>
            정말 탈퇴하려면 아래에 동아리명{' '}
            <span className="font-semibold text-ink">&quot;{club.clubName}&quot;</span> 을(를) 입력해주세요.
          </p>
        </div>
        <input
          type="text"
          value={confirmName}
          onChange={(event) => setConfirmName(event.target.value)}
          disabled={isPending}
          placeholder="동아리명을 정확히 입력하세요"
          aria-label="탈퇴 확인 동아리명 입력"
          className="w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px] text-ink outline-none focus:border-ink disabled:opacity-50"
        />
        {serverError ? (
          <p className="text-[12.5px] text-coral">{serverError}</p>
        ) : showNameMismatch ? (
          <p className="text-[12.5px] text-coral">동아리명이 일치하지 않습니다.</p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={handleLeave}
            disabled={!nameMatches || isPending}
            className="btn btn-sm rounded-[10px] bg-coral text-white disabled:opacity-50"
          >
            {isPending ? '처리 중…' : '동아리 탈퇴'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
