'use client';

import { useEffect, useState } from 'react';

import { ApiError } from '@duing/api';
import { useUpdateProfileMutation } from '@duing/hooks';
import type { Grade } from '@duing/types';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { GradeSelect } from '@/app/_components/GradeSelect';
import { useToast } from '@/app/_components/toast/ToastProvider';

const PHONE_PATTERN = /^010-\d{4}-\d{4}$/;

// 숫자만 받아 010-XXXX-XXXX 형태로 하이픈을 자동 삽입한다.
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  currentName: string;
  currentPhone: string;
  currentGrade: Grade;
};

export function ProfileEditDialog({ open, onClose, currentName, currentPhone, currentGrade }: Props) {
  const { addToast } = useToast();
  const updateMutation = useUpdateProfileMutation();
  const [name, setName] = useState(currentName);
  const [phone, setPhone] = useState(currentPhone);
  const [grade, setGrade] = useState<Grade>(currentGrade);
  const [error, setError] = useState<string | null>(null);

  // 열릴 때마다 현재 값으로 초기화한다.
  useEffect(() => {
    if (open) {
      setName(currentName);
      setPhone(currentPhone);
      setGrade(currentGrade);
      setError(null);
    }
  }, [open, currentName, currentPhone, currentGrade]);

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
      { name: name.trim(), phone, grade },
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
              onChange={(event) => setPhone(formatPhone(event.target.value))}
              placeholder="010-0000-0000"
              inputMode="numeric"
              maxLength={13}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-deep focus:border-sage focus:outline-none"
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-charcoal-2">학년</span>
            <GradeSelect value={grade} onChange={setGrade} />
          </div>
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
