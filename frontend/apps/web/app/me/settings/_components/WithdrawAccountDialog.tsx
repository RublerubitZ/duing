'use client';

import { useEffect, useState } from 'react';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@duing/api';
import { useWithdrawAccountMutation } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { toRoute } from '@/app/_lib/route';

type Props = { open: boolean; onClose: () => void };

export function WithdrawAccountDialog({ open, onClose }: Props) {
  const router = useGuardedRouter();
  const queryClient = useQueryClient();
  const clearSession = useAuthStore((state) => state.clearSession);
  const { addToast } = useToast();
  const withdrawMutation = useWithdrawAccountMutation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const handleWithdraw = () => {
    setError(null);
    withdrawMutation.mutate(undefined, {
      onSuccess: async () => {
        await clearSession();
        queryClient.clear();
        addToast('탈퇴가 완료되었어요. 그동안 이용해 주셔서 감사합니다.');
        router.replace(toRoute('/'));
      },
      onError: (mutationError) => {
        // 회장은 인계 후에만 탈퇴 가능(409) 등 — 서버 메시지를 그대로 안내한다.
        setError(
          mutationError instanceof ApiError
            ? mutationError.message
            : '탈퇴에 실패했어요. 잠시 후 다시 시도해 주세요.',
        );
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>회원 탈퇴</DialogTitle>
        <DialogDescription className="text-[13.5px] leading-relaxed text-charcoal-2">
          정말 탈퇴하시겠어요? 계정과 활동 정보가 정리되며 되돌릴 수 없어요.
        </DialogDescription>
        {error && <p className="text-[12.5px] text-coral">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={withdrawMutation.isPending}
            className="btn btn-ghost btn-sm"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleWithdraw}
            disabled={withdrawMutation.isPending}
            className="btn btn-sm rounded-[10px] bg-coral text-white disabled:opacity-50"
          >
            {withdrawMutation.isPending && <ButtonSpinner />}탈퇴하기
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
