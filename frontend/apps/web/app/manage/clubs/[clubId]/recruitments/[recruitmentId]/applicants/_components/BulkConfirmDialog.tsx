'use client';

import type { BulkUpdateApplicationStatusPayload } from '@duing/types';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ButtonSpinner } from '@/components/loading/Spinner';

type TargetStatus = BulkUpdateApplicationStatusPayload['status'];

// INTERVIEW_PENDING 전이는 BulkPromoteDialog (Spec P0-4) 가 전담한다.
// 본 컴포넌트는 그 외 ON_HOLD / ACCEPTED / REJECTED 전이만 처리.
type GenericTargetStatus = Exclude<TargetStatus, 'INTERVIEW_PENDING'>;

type Props = {
  targetStatus: GenericTargetStatus;
  selectedCount: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const LABEL: Record<GenericTargetStatus, string> = {
  ON_HOLD: '보류',
  ACCEPTED: '합격',
  REJECTED: '불합격',
};

// 합격 설명에서 "알림이 발송될 수 있습니다" 삭제 — BE 에 지원 상태 알림이 없다 (스펙 §5-3).
const DESCRIPTION: Record<GenericTargetStatus, string> = {
  ON_HOLD: '보류는 운영진 내부 관리 상태이며 지원자에게 노출되지 않습니다.',
  ACCEPTED: '선택한 지원자가 동아리 회원으로 자동 등록되며, 지원자에게 결과가 반영됩니다.',
  REJECTED: '되돌릴 수 없습니다. 잘못 누른 항목이 있으면 취소하고 선택을 다시 확인하세요.',
};

// 불합격만 위험(coral), 그 외는 기본(ink) — 두잉은 상태별 솔리드 버튼색을 두지 않는다.
const CONFIRM_BUTTON_CLASS: Record<GenericTargetStatus, string> = {
  ON_HOLD: 'btn btn-primary btn-sm disabled:opacity-50',
  ACCEPTED: 'btn btn-primary btn-sm disabled:opacity-50',
  REJECTED: 'btn btn-sm bg-coral text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50',
};

export function BulkConfirmDialog({
  targetStatus,
  selectedCount,
  isPending,
  onConfirm,
  onCancel,
}: Props) {
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
      >
        <DialogHeader>
          <DialogTitle>
            {selectedCount}건을 일괄 {LABEL[targetStatus]} 처리할까요?
          </DialogTitle>
          <DialogDescription>
            {DESCRIPTION[targetStatus]} 현재 상태에서 전이가 불가능한 항목은 자동으로 건너뜁니다.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button type="button" onClick={onConfirm} disabled={isPending} className={CONFIRM_BUTTON_CLASS[targetStatus]}>
            {isPending && <ButtonSpinner />}
            {LABEL[targetStatus]}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
