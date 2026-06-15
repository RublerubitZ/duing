'use client';

import { useEffect, useState } from 'react';

import { ApiError } from '@duing/api';
import { useUpdateProfileMutation } from '@duing/hooks';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/app/_components/toast/ToastProvider';

const PHONE_PATTERN = /^010-\d{4}-\d{4}$/;

type Props = {
  open: boolean;
  onClose: () => void;
  currentName: string;
  currentPhone: string;
};

export function ProfileEditDialog({ open, onClose, currentName, currentPhone }: Props) {
  const { addToast } = useToast();
  const updateMutation = useUpdateProfileMutation();
  const [name, setName] = useState(currentName);
  const [phone, setPhone] = useState(currentPhone);
  const [error, setError] = useState<string | null>(null);

  // 열릴 때마다 현재 값으로 초기화한다.
  useEffect(() => {
    if (open) {
      setName(currentName);
      setPhone(currentPhone);
      setError(null);
    }
  }, [open, currentName, currentPhone]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('이름을 입력해 주세요.');
      return;
    }
    if (!PHONE_PATTERN.test(phone)) {
      setError('전화번호는 010-XXXX-XXXX 형식이어야 해요.');
      return;
    }
    setError(null);
    updateMutation.mutate(
      { name: name.trim(), phone },
      {
        onSuccess: () => {
          addToast('프로필을 수정했어요.');
          onClose();
        },
        onError: (mutationError) => {
          setError(
            mutationError instanceof ApiError
              ? mutationError.message
              : '수정에 실패했어요. 잠시 후 다시 시도해 주세요.',
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
        <DialogTitle>프로필 수정</DialogTitle>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-charcoal-2">이름</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={50}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-deep focus:border-sage focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-charcoal-2">전화번호</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="010-0000-0000"
              inputMode="numeric"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-deep focus:border-sage focus:outline-none"
            />
          </label>
          {error && <p className="text-[12.5px] text-coral">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={updateMutation.isPending}
              className="btn btn-ghost btn-sm"
            >
              취소
            </button>
            <button type="submit" disabled={updateMutation.isPending} className="btn btn-primary btn-sm">
              {updateMutation.isPending ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
