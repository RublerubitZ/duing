'use client';

import { useEffect, useState } from 'react';

import { ApiError } from '@duing/api';
import { useChangePhoneMutation } from '@duing/hooks';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { PhoneVerificationField } from '@/app/_components/PhoneVerificationField';
import { usePhoneChangeVerification } from '@/app/_lib/use-phone-verification';

type Props = { open: boolean; onClose: () => void };

export function PhoneChangeDialog({ open, onClose }: Props) {
  const { addToast } = useToast();
  const changePhoneMutation = useChangePhoneMutation();

  const [newPhone, setNewPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const verification = usePhoneChangeVerification(newPhone);

  // 다시 열 때 이전 인증 상태·입력이 남지 않도록 초기화한다.
  useEffect(() => {
    if (open) {
      setNewPhone('');
      setError(null);
      verification.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleChangePhone() {
    if (!verification.verificationToken) return;
    setError(null);
    changePhoneMutation.mutate(
      { verificationToken: verification.verificationToken },
      {
        onSuccess: () => {
          addToast('전화번호가 변경되었어요.');
          onClose();
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
              disabled={!verification.verified || changePhoneMutation.isPending}
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
