'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@duing/api';
import {
  useInterviewAvailabilitiesQuery,
  useApplicantInterviewSlotsQuery,
  useUpdateInterviewAvailabilitiesMutation,
} from '@duing/hooks';
import { SlotPickerByDateGroup } from '@/components/interview/SlotPickerByDateGroup';

// 지원자 마이페이지 면접 가능시간 수정 모달.
// 부모(InterviewScheduleCard) 가 deadline / 자동배정 미완료 조건을 만족할 때만 trigger.
// backend 는 409 (AVAILABILITY_PERIOD_CLOSED / ASSIGNMENT_ALREADY_COMPLETED) 로 거부 가능.
// 409 발생 시 모달을 닫고 alert 으로 안내.
//
// dialog 패턴 — PR-FE3 AssignToSlotModal 과 동일:
//   backdrop aria-hidden + onClick close, dialog role/aria-modal, escape 종료,
//   진입 시 첫 인터랙티브 요소(취소 버튼) autofocus, dialog 내부 onClick stopPropagation.
type Props = {
  isOpen: boolean;
  onClose: () => void;
  applicationId: number;
  recruitmentId: number;
};

export function EditAvailabilityModal({
  isOpen,
  onClose,
  applicationId,
  recruitmentId,
}: Props) {
  const availabilitiesQuery = useInterviewAvailabilitiesQuery(applicationId);
  const applicantSlotsQuery = useApplicantInterviewSlotsQuery(recruitmentId);
  const updateMutation = useUpdateInterviewAvailabilitiesMutation(applicationId);

  const [draftSlotIds, setDraftSlotIds] = useState<number[]>([]);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // 모달 진입 시 서버 상태에서 draft 복원. isOpen 토글 또는 query 응답 갱신 시 재실행.
  useEffect(() => {
    if (isOpen && availabilitiesQuery.data) {
      setDraftSlotIds(availabilitiesQuery.data.slotIds ?? []);
      setInlineError(null);
    }
  }, [isOpen, availabilitiesQuery.data]);

  // Escape 닫기 + 진입 시 첫 인터랙티브 요소 autofocus.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      'button:not([disabled])',
    );
    firstFocusable?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isQueryLoading =
    availabilitiesQuery.isLoading || applicantSlotsQuery.isLoading;
  const isSaveDisabled =
    updateMutation.isPending || draftSlotIds.length === 0 || isQueryLoading;

  const handleSave = () => {
    setInlineError(null);
    updateMutation.mutate(
      { slotIds: draftSlotIds },
      {
        onSuccess: () => {
          onClose();
        },
        onError: (error) => {
          if (error instanceof ApiError && error.status === 409) {
            onClose();
            window.alert(
              '수정 기간이 종료되었거나 자동배정이 완료되었습니다.',
            );
            return;
          }
          const message =
            error instanceof Error
              ? error.message
              : '가능시간 저장에 실패했습니다.';
          setInlineError(message);
        },
      },
    );
  };

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
        aria-labelledby="edit-availability-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg bg-white p-6 shadow-xl"
      >
        <header className="mb-3 flex items-center justify-between">
          <h3
            id="edit-availability-title"
            className="text-base font-semibold text-slate-900"
          >
            면접 가능시간 수정
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isQueryLoading ? (
            <p className="rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-500">
              슬롯 정보를 불러오는 중…
            </p>
          ) : (
            <SlotPickerByDateGroup
              slots={applicantSlotsQuery.data ?? []}
              selectedSlotIds={draftSlotIds}
              onChange={setDraftSlotIds}
              minSelected={1}
            />
          )}
        </div>

        {inlineError && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
          >
            {inlineError}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaveDisabled}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateMutation.isPending ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
