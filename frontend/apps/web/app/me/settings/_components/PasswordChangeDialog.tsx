'use client';

import { useEffect, useState } from 'react';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@duing/api';
import { useChangePasswordMutation } from '@duing/hooks';
import { passwordSchema } from '@duing/schemas';
import { useAuthStore } from '@duing/stores';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { toRoute } from '@/app/_lib/route';

type Props = { open: boolean; onClose: () => void };

export function PasswordChangeDialog({ open, onClose }: Props) {
  const router = useGuardedRouter();
  const queryClient = useQueryClient();
  const clearSession = useAuthStore((state) => state.clearSession);
  const { addToast } = useToast();
  const changeMutation = useChangePasswordMutation();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
    }
  }, [open]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentPassword) {
      setError('현재 비밀번호를 입력해 주세요.');
      return;
    }
    if (!passwordSchema.safeParse(newPassword).success) {
      setError('새 비밀번호는 8~20자이며 영문/숫자/특수문자 중 2종 이상이어야 해요.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 서로 일치하지 않아요.');
      return;
    }
    setError(null);
    changeMutation.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: async () => {
          // 변경 후 모든 토큰이 무효화되므로 세션을 정리하고 재로그인으로 보낸다.
          await clearSession();
          queryClient.clear();
          addToast('비밀번호가 변경되었어요. 다시 로그인해 주세요.');
          router.replace(toRoute('/login'));
        },
        onError: (mutationError) => {
          setError(
            mutationError instanceof ApiError
              ? mutationError.message
              : '변경에 실패했어요. 잠시 후 다시 시도해 주세요.',
          );
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>비밀번호 변경</DialogTitle>
        <DialogDescription className="text-[12.5px]">
          변경하면 보안을 위해 다시 로그인해야 해요.
        </DialogDescription>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-charcoal-2">현재 비밀번호</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-deep focus:border-sage focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-charcoal-2">새 비밀번호</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-deep focus:border-sage focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-charcoal-2">새 비밀번호 확인</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-deep focus:border-sage focus:outline-none"
            />
          </label>
          {error && <p className="text-[12.5px] text-coral">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={changeMutation.isPending}
              className="btn btn-ghost btn-sm"
            >
              취소
            </button>
            <button type="submit" disabled={changeMutation.isPending} className="btn btn-primary btn-sm">
              {changeMutation.isPending && <ButtonSpinner />}변경하기
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
