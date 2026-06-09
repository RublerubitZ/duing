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

// `recruitmentStartDate` 는 yyyy-MM-dd 포맷. 로컬 자정과 비교해 "시작일 이후" 판정.
// 백엔드 정책(`LocalDate.now().isAfter(startDate)`) 과 일치시키기 위해 strict `>` 비교 사용 —
// 시작일 당일(`==`) 은 신규 슬롯 추가가 허용된다.
function isRecruitmentStarted(startDateIso: string): boolean {
  const match = startDateIso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;
  const [, year, month, day] = match;
  const startMidnight = new Date(Number(year), Number(month) - 1, Number(day));
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  return todayMidnight.getTime() > startMidnight.getTime();
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
    // 자동배정 후 카드의 "배정 N/Capacity명" 표시가 0 으로 고정되지 않도록 보존.
    assignedCount: slot.assignedCount,
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
    // 캡처 — onSuccess 가 비동기로 실행될 때 preview state 가 비워졌을 가능성에 대비.
    const savedCount = preview.length;
    createMutation.mutate(
      { slots: preview },
      {
        onSuccess: () => {
          setPreview([]);
          setSubmitSuccess(`${savedCount}개 슬롯이 저장되었습니다.`);
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
          <div className="rounded-md border border-sky-100 bg-sky-50 px-3 py-3 text-sm text-sky-900">
            <strong className="block font-medium">💡 여러 날짜·비균등 패턴 등록 방법</strong>
            <p className="mt-1 text-xs text-sky-900">
              각 패턴을 입력하고 <strong>+ 미리보기에 추가</strong> 를 누르면 누적됩니다.
              모두 합쳐서 마지막에 한 번에 저장하세요.
            </p>
            <ul className="mt-2 list-disc pl-5 text-xs text-sky-900">
              <li>예: 6/10 10:00 단일 슬롯(개수=1, 정원=4) → +미리보기 → 6/11 14:00 단일 슬롯(개수=1, 정원=2) → +미리보기 → 저장</li>
              <li>균등 패턴(6/10 18:00 부터 30분 간격 6개) 도 같은 방식으로 미리보기 후 저장</li>
            </ul>
          </div>
          <SlotPatternForm
            onPreview={(newSlots) => setPreview((prev) => [...prev, ...newSlots])}
            disabled={recruitmentStarted}
          />
          <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
            {preview.length > 0 ? (
              <>
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
              </>
            ) : (
              <p className="text-sm text-slate-500">
                미리보기가 비어 있습니다. 위 패턴 폼에서 <strong>+ 미리보기에 추가</strong> 를 눌러 슬롯을 만든 뒤
                저장하세요.
              </p>
            )}
          </div>
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
