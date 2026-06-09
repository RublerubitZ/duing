'use client';

import { useState } from 'react';
import { ApiError } from '@duing/api';
import {
  useCreateInterviewSlotsMutation,
  useDeleteInterviewSlotMutation,
} from '@duing/hooks';
import type { ManagementSlotView, SlotListView } from '@duing/types';
import { ManagementSlotCard } from '@/components/interview/ManagementSlotCard';
import { SlotPatternForm } from './SlotPatternForm';
import { SlotPreviewList } from './SlotPreviewList';
import type { SlotEntry } from '../_utils/generateSlotsFromPattern';

// Step 2 — 슬롯 관리 섹션.
// 1) 패턴 입력 → 미리보기(저장 전, 클라이언트 state)
// 2) 미리보기 행 개별 삭제
// 3) 저장 → POST /recruitments/{id}/interview-slots
// 4) 현재 슬롯 그리드 — onCancel 로 슬롯 자체 삭제 (window.confirm)
//
// **모집 시작일 정책 (spec §13)**: recruitmentStartDate <= today 면 신규 슬롯 추가 금지.
// 수정/삭제는 별도 정책 — 본 PR 에서는 삭제만 허용 (전부 막으면 운영진이 잘못 만든 슬롯을 정리할 수 없음).

type Props = {
  recruitmentId: number;
  recruitmentStartDate: string; // ISO yyyy-MM-dd
  slots: SlotListView[];
};

// `recruitmentStartDate` 는 yyyy-MM-dd 포맷. 로컬 자정과 비교해 "오늘 또는 과거" 판정.
function isRecruitmentStarted(startDateIso: string): boolean {
  const match = startDateIso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;
  const [, year, month, day] = match;
  const startMidnight = new Date(Number(year), Number(month) - 1, Number(day));
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  return todayMidnight.getTime() >= startMidnight.getTime();
}

// SlotListView -> ManagementSlotView (assignments 는 PR-FE3 의 ScheduleManagement 에서 채움)
// OpenAPI 스키마상 모든 필드가 optional 이지만 백엔드는 항상 채워서 응답한다.
// 누락 시 안전한 fallback 으로 0 또는 빈 문자열을 사용.
function toManagementView(slot: SlotListView): ManagementSlotView {
  return {
    slotId: slot.slotId ?? 0,
    startTime: slot.startTime ?? '',
    endTime: slot.endTime ?? '',
    capacity: slot.capacity ?? 0,
    availabilityCount: slot.availabilityCount,
  };
}

export function InterviewSlotSection({
  recruitmentId,
  recruitmentStartDate,
  slots,
}: Props) {
  const createMutation = useCreateInterviewSlotsMutation(recruitmentId);
  const deleteMutation = useDeleteInterviewSlotMutation(recruitmentId);

  const [preview, setPreview] = useState<SlotEntry[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const recruitmentStarted = isRecruitmentStarted(recruitmentStartDate);

  const handleSave = () => {
    setSubmitError(null);
    setSubmitSuccess(null);
    createMutation.mutate(
      { slots: preview },
      {
        onSuccess: () => {
          setPreview([]);
          setSubmitSuccess(`${preview.length}개 슬롯이 저장되었습니다.`);
        },
        onError: (mutationError: unknown) => {
          const message =
            mutationError instanceof ApiError
              ? mutationError.message
              : '슬롯 저장에 실패했습니다.';
          setSubmitError(message);
        },
      },
    );
  };

  const handleDeleteSlot = (slotId: number) => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        '이 슬롯을 삭제하시겠습니까? 이미 배정된 지원자가 있다면 영향을 받을 수 있습니다.',
      );
      if (!confirmed) return;
    }
    setSubmitError(null);
    setSubmitSuccess(null);
    deleteMutation.mutate(slotId, {
      onError: (mutationError: unknown) => {
        const message =
          mutationError instanceof ApiError
            ? mutationError.message
            : '슬롯 삭제에 실패했습니다.';
        setSubmitError(message);
      },
    });
  };

  const views = slots.map(toManagementView);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">Step 2 · 슬롯 관리</h2>
        <p className="mt-1 text-xs text-slate-500">
          패턴으로 슬롯을 한 번에 생성하고, 저장 전 미리보기에서 자유롭게 다듬으세요.
        </p>
      </header>

      {recruitmentStarted ? (
        <p
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          모집이 시작된 후에는 새 슬롯을 추가할 수 없습니다. (기존 슬롯 삭제만 가능)
        </p>
      ) : (
        <div className="space-y-3">
          <SlotPatternForm onPreview={setPreview} disabled={recruitmentStarted} />
          {preview.length > 0 && (
            <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
              <SlotPreviewList
                slots={preview}
                onRemove={(index) =>
                  setPreview(preview.filter((_, currentIndex) => currentIndex !== index))
                }
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={createMutation.isPending || preview.length === 0}
                  className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? '저장 중…' : `${preview.length}개 저장`}
                </button>
                <button
                  type="button"
                  onClick={() => setPreview([])}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  미리보기 비우기
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {submitError && (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {submitError}
        </p>
      )}
      {submitSuccess && (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {submitSuccess}
        </p>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-medium text-slate-700">
          현재 슬롯 <span className="text-xs text-slate-400">({views.length}개)</span>
        </h3>
        {views.length === 0 ? (
          <p className="mt-2 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            아직 저장된 슬롯이 없습니다. 위에서 패턴을 입력하고 미리보기 후 저장하세요.
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {views.map((view) => (
              <ManagementSlotCard
                key={view.slotId}
                slot={view}
                onDeleteSlot={handleDeleteSlot}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
