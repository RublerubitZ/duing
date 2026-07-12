'use client';

import { useEffect, useState } from 'react';

import { ApiError } from '@duing/api';
import { useUpdateProfileMutation } from '@duing/hooks';
import type { Grade } from '@duing/types';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { GradeSelect } from '@/app/_components/GradeSelect';
import { useToast } from '@/app/_components/toast/ToastProvider';

type Props = {
  open: boolean;
  onClose: () => void;
  currentName: string;
  currentGrade: Grade;
};

export function ProfileEditDialog({ open, onClose, currentName, currentGrade }: Props) {
  const { addToast } = useToast();
  const updateMutation = useUpdateProfileMutation();
  const [name, setName] = useState(currentName);
  const [grade, setGrade] = useState<Grade>(currentGrade);
  const [error, setError] = useState<string | null>(null);

  // 열릴 때마다 현재 값으로 초기화한다.
  useEffect(() => {
    if (open) {
      setName(currentName);
      setGrade(currentGrade);
      setError(null);
    }
  }, [open, currentName, currentGrade]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('이름을 입력해 주세요.');
      return;
    }
    setError(null);
    updateMutation.mutate(
      { name: name.trim(), grade },
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
      {/* 별도 설명 문구가 없는 폼 다이얼로그 — Description 연결을 명시적으로 해제한다(Radix a11y 경고 억제). */}
      <DialogContent aria-describedby={undefined}>
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
          <div className="flex flex-col gap-1.5">
            <label htmlFor="profile-grade" className="text-[13px] font-semibold text-charcoal-2">학년</label>
            <GradeSelect id="profile-grade" value={grade} onChange={setGrade} />
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
