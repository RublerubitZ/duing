'use client';

import { useEffect, useRef } from 'react';
import { ApiError } from '@duing/api';
import { useAssignInterviewScheduleMutation } from '@duing/hooks';
import type { SlotListView } from '@duing/types';
import { formatSlotRange } from '@/components/interview/_utils/localDateTime';

// 수동 배정 / 슬롯 이동 모달 — Step 4 ScheduleManagementSection 에서 사용.
// page-level 에서 fetch 한 slots(SlotListView[]) 를 props 로 받아, 개별 슬롯 버튼을 렌더한다.
// full 인 슬롯은 disabled. 성공 시 onClose 호출.
type Props = {
  isOpen: boolean;
  applicationId: number | null;
  recruitmentId: number;
  slots: SlotListView[];
  onClose: () => void;
};

export function AssignToSlotModal({
  isOpen,
  applicationId,
  recruitmentId,
  slots,
  onClose,
}: Props) {
  const assignMutation = useAssignInterviewScheduleMutation(recruitmentId);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Escape 키로 닫기 + 진입 시 autofocus(첫 슬롯 버튼 or 취소 버튼).
  // 본격적인 focus trap 라이브러리는 도입하지 않고 dialog 컨테이너에 첫 포커스만 보장한다.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    // mount 직후 첫 인터랙티브 요소로 포커스 이동.
    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      'button:not([disabled])',
    );
    focusable?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || applicationId === null) return null;

  return (
    <div
      aria-hidden="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-modal-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <header className="mb-3 flex items-center justify-between">
          <h3 id="assign-modal-title" className="text-base font-semibold text-slate-900">
            슬롯 선택 — 지원자 #{applicationId}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="모달 닫기"
            className="rounded-md px-2 text-slate-400 hover:bg-slate-100"
          >
            ×
          </button>
        </header>

        {slots.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
            배정 가능한 슬롯이 없습니다.
          </p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {slots.map((slot) => {
              const slotId = slot.slotId ?? 0;
              const startTime = slot.startTime ?? '';
              const endTime = slot.endTime ?? '';
              const capacity = slot.capacity ?? 0;
              const assignedCount = slot.assignedCount ?? 0;
              const full = assignedCount >= capacity;
              return (
                <li key={slotId}>
                  <button
                    type="button"
                    disabled={full || assignMutation.isPending}
                    onClick={() =>
                      assignMutation.mutate(
                        { applicationId, slotId },
                        { onSuccess: onClose },
                      )
                    }
                    className="flex w-full items-center justify-between rounded-md border border-slate-100 bg-white px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <span>{formatSlotRange(startTime, endTime)}</span>
                    <span className={full ? 'text-xs text-rose-500' : 'text-xs text-slate-500'}>
                      {assignedCount}/{capacity}명{full && ' · 가득 참'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {assignMutation.isError && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
          >
            {extractErrorMessage(assignMutation.error)}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return '배정에 실패했습니다.';
}
