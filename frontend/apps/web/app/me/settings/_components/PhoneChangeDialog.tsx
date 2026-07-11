'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@duing/api';
import { useChangePhoneMutation } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { PhoneVerificationField } from '@/app/_components/PhoneVerificationField';
import { usePhoneChangeVerification } from '@/app/_lib/use-phone-verification';
import { toRoute } from '@/app/_lib/route';

type Props = { open: boolean; onClose: () => void };

export function PhoneChangeDialog({ open, onClose }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const clearSession = useAuthStore((state) => state.clearSession);
  const { addToast } = useToast();
  const changePhoneMutation = useChangePhoneMutation();

  const [newPhone, setNewPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const verification = usePhoneChangeVerification(newPhone);

  // 다시 열 때 이전 인증 상태·입력이 남지 않도록 초기화한다.
  useEffect(() => {
    if (open) {
      setNewPhone('');
      setCurrentPassword('');
      setError(null);
      verification.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleChangePhone() {
    if (!verification.verificationToken) return;
    setError(null);
    changePhoneMutation.mutate(
      { verificationToken: verification.verificationToken, currentPassword },
      {
        onSuccess: async () => {
          // 번호(복구 수단) 변경 후 모든 토큰이 무효화되므로 세션을 정리하고 재로그인으로 보낸다.
          await clearSession();
          queryClient.clear();
          addToast('전화번호가 변경되었어요. 다시 로그인해 주세요.');
          router.replace(toRoute('/login'));
        },
        onError: (mutationError) => {
          if (mutationError instanceof ApiError && mutationError.code === 'PHONE_NOT_VERIFIED') {
            // 완료 창(10분) 초과 등 — 인증 스텝으로 되돌려 재인증을 유도한다.
            verification.reset();
            setError('인증이 만료됐어요. 새 번호 인증을 다시 진행해주세요.');
            return;
          }
          setError(
            mutationError instanceof ApiError
              ? mutationError.message
              : '변경에 실패했어요. 잠시 후 다시 시도해 주세요.',
          );
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          if (changePhoneMutation.isPending) return; // 변경 진행 중에는 닫히지 않는다 — 유령 토스트/뒤늦은 onClose 방지
          onClose();
        }
      }}
    >
      {/* 데스크톱 QR 2단 레이아웃(수신번호·코드·복사)이 기본 폭(max-w-md)보다 넓어 삐져나오므로 signup 폭에 맞춘다. */}
      <DialogContent className="sm:max-w-[560px]">
        <DialogTitle>전화번호 변경</DialogTitle>
        <DialogDescription className="text-[12.5px]">
          새 번호로 문자 인증을 완료하면 변경돼요. 인증 문자 1건이 필요해요.
        </DialogDescription>

        <div className="flex flex-col gap-4">
          <PhoneVerificationField
            phone={newPhone}
            onPhoneChange={setNewPhone}
            status={verification.status}
            code={verification.code}
            moNumber={verification.moNumber}
            qrCode={verification.qrCode}
            remainingSeconds={verification.remainingSeconds}
            resendCooldownSeconds={verification.resendCooldownSeconds}
            issuing={verification.issuing}
            canIssue={verification.canIssue}
            errorMessage={verification.errorMessage}
            stalled={verification.stalled}
            onIssue={verification.issue}
            onSent={verification.markSent}
            onReset={verification.reset}
            onRecheck={verification.recheck}
          />

          {/* 인증이 끝난 뒤에만 step-up 으로 현재 비밀번호를 확인한다 — 복구 수단 교체는 비밀번호 변경과 동급. */}
          {verification.verified && (
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
          )}

          {error && <p className="text-[12.5px] text-coral">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={changePhoneMutation.isPending}
              className="btn btn-ghost btn-sm"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleChangePhone}
              disabled={
                !verification.verified || changePhoneMutation.isPending || currentPassword.length === 0
              }
              className="btn btn-primary btn-sm"
            >
              {changePhoneMutation.isPending ? '변경 중…' : '번호 변경하기'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
