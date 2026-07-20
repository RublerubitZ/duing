'use client';

import { useEffect, useState } from 'react';
import { ButtonSpinner } from '@/components/loading/Spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  open: boolean;
  selectedCount: number;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (memo: string) => void;
};

/** Batch 생성 확인(스펙 v2 §7.1) — 확인 문구 + 메모. 생성 중 버튼 라벨 유지 + 스피너. */
export function BatchCreateDialog({ open, selectedCount, isPending, onClose, onConfirm }: Props) {
  const [memo, setMemo] = useState('');

  // Dialog 는 상시 마운트라 재오픈 시 이전 memo 가 남는다 — PasswordChangeDialog 전례와 동일하게 open 시 리셋.
  useEffect(() => {
    if (open) setMemo('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !isPending) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>선택한 예약을 제출 목록에 담을까요?</DialogTitle>
          <DialogDescription>
            선택한 {selectedCount}건의 예약을 하나의 제출 목록으로 묶어요. 학교에 제출할 때 이 목록 기준으로 관리할 수 있어요.
          </DialogDescription>
        </DialogHeader>
        <label className="block text-sm text-charcoal-2">
          <span className="mb-1 block text-xs text-charcoal-3">메모</span>
          <textarea
            aria-label="메모"
            value={memo}
            maxLength={500}
            rows={3}
            placeholder="예: 8월 1차 제출 (선택)"
            onChange={(event) => setMemo(event.target.value)}
            className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-sm"
          />
        </label>
        <DialogFooter>
          <button type="button" className="btn btn-ghost btn-sm" disabled={isPending} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={isPending || selectedCount === 0}
            onClick={() => onConfirm(memo)}
          >
            {isPending && <ButtonSpinner />}
            제출 목록 만들기
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
