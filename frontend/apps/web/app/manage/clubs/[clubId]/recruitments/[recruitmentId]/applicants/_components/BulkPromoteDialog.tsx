'use client';

import { useRef } from 'react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

// Spec P0-4 — 운영진 list 의 "면접 대상으로 선정" 확정 모달.
// 본문은 spec 의 wording 을 글자 단위로 따른다:
//   {대표 이름} 외 {N-1}명을
//   면접 대상자로 선정하시겠습니까?
//   <빈 줄>
//   선정된 지원자는 자동배정 대상에 포함됩니다.
//
// 대표 이름은 선택된 지원자 중 첫 번째. representativeName 이 빈 문자열일 때는
// "선택한 N명을" 으로 fallback 하여 빈 이름이 노출되지 않도록 한다.
// ESC / 바깥 클릭으로 취소(처리 중 제외), 진입 시 "선정" 버튼 autofocus.

type Props = {
  representativeName: string;
  selectedCount: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function BulkPromoteDialog({
  representativeName,
  selectedCount,
  isPending,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  const othersCount = Math.max(selectedCount - 1, 0);
  const summaryLine = representativeName
    ? `${representativeName} 외 ${othersCount}명을`
    : `선택한 ${selectedCount}명을`;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <DialogContent
        className="max-w-sm"
        onPointerDownOutside={(event) => {
          if (isPending) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          confirmRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>면접 대상자 선정</DialogTitle>
          <DialogDescription className="space-y-3 text-sm">
            <span className="block whitespace-pre-line text-charcoal">
              {summaryLine}
              {'\n'}
              면접 대상자로 선정하시겠습니까?
            </span>
            <span className="block text-charcoal-3">선정된 지원자는 자동배정 대상에 포함됩니다.</span>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="btn btn-primary btn-sm disabled:opacity-50"
          >
            {isPending ? '처리 중…' : '선정'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
