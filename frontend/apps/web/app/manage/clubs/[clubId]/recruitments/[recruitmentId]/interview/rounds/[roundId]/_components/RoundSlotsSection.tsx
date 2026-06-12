'use client';

import { useState } from 'react';
import { ApiError } from '@duing/api';
import {
  useCreateRoundSlotsMutation,
  useDeleteRoundSlotMutation,
  useUpdateRoundSlotMutation,
} from '@duing/hooks';
import type { InterviewRoundDetail, InterviewRoundDetailSlot } from '@duing/types';
import { SlotPatternForm } from '@/components/interview/SlotPatternForm';
import type { RoundSlotEntry } from '@/components/interview/_utils/generateSlotsFromPattern';
import { formatSlotRange } from '@/components/interview/_utils/localDateTime';

// 면접 슬롯 섹션 — 슬롯 행(시간·정원·선택/배정) + DRAFT·COLLECTING 한정
// [정원 수정](인라인 number input → PATCH)·[삭제] + SlotPatternForm 으로 추가 생성.

/** NoSlotSection [추가 슬롯 생성] 앵커 대상 id */
export const ROUND_SLOTS_SECTION_ID = 'round-slots-section';

type RoundSlotsSectionProps = {
  detail: InterviewRoundDetail;
  onSlotsCreated: (reinvitedCount: number) => void;
};

export function RoundSlotsSection({ detail, onSlotsCreated }: RoundSlotsSectionProps) {
  const { slots, status, roundId } = detail;
  const canEdit = status === 'DRAFT' || status === 'COLLECTING';
  const createSlotsMutation = useCreateRoundSlotsMutation(roundId);
  const deleteSlotMutation = useDeleteRoundSlotMutation(roundId);
  const updateSlotMutation = useUpdateRoundSlotMutation(roundId);

  // 정원 인라인 수정 — 수정 중인 슬롯 id 와 입력값
  const [capacityEditSlotId, setCapacityEditSlotId] = useState<number | null>(null);
  const [capacityInput, setCapacityInput] = useState(1);

  const handleGenerate = async (generated: RoundSlotEntry[]) => {
    const result = await createSlotsMutation.mutateAsync({ slots: generated });
    if (result.reinvitedMemberCount > 0) {
      onSlotsCreated(result.reinvitedMemberCount);
    }
  };

  const handleDelete = async (slotId: number) => {
    try {
      await deleteSlotMutation.mutateAsync(slotId);
    } catch (deleteError) {
      const message =
        deleteError instanceof ApiError
          ? deleteError.message
          : '슬롯 삭제 중 오류가 발생했습니다.';
      alert(message);
    }
  };

  const handleCapacityEditStart = (slot: InterviewRoundDetailSlot) => {
    setCapacityEditSlotId(slot.slotId);
    setCapacityInput(slot.capacity);
  };

  const handleCapacitySave = () => {
    if (capacityEditSlotId === null) return;
    updateSlotMutation.mutate(
      { slotId: capacityEditSlotId, payload: { capacity: capacityInput } },
      {
        onSuccess: () => {
          setCapacityEditSlotId(null);
        },
      },
    );
  };

  return (
    <div
      id={ROUND_SLOTS_SECTION_ID}
      className="rounded-xl border border-slate-200 bg-white px-5 py-4"
    >
      <h2 className="mb-3 text-sm font-semibold text-slate-700">면접 슬롯</h2>

      {slots.length > 0 && (
        <div className="mb-4 space-y-1">
          {slots.map((slot) => (
            <div
              key={slot.slotId}
              className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            >
              <span className="text-slate-700">
                {formatSlotRange(slot.startTime, slot.endTime)} · 정원 {slot.capacity}명 ·
                선택 {slot.selectedCount} / 배정 {slot.assignedCount}
              </span>
              {canEdit && (
                <span className="ml-3 flex shrink-0 items-center gap-1">
                  {capacityEditSlotId === slot.slotId ? (
                    <>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={capacityInput}
                        onChange={(event) => {
                          const nextCapacity = event.target.valueAsNumber;
                          setCapacityInput(Number.isFinite(nextCapacity) ? nextCapacity : 1);
                        }}
                        aria-label="새 정원"
                        className="w-16 rounded-md border border-slate-300 px-2 py-0.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                      <button
                        type="button"
                        onClick={handleCapacitySave}
                        disabled={updateSlotMutation.isPending || capacityInput < 1}
                        aria-label="정원 저장"
                        className="rounded-md px-2 py-0.5 text-xs font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-50"
                      >
                        {updateSlotMutation.isPending ? '저장 중…' : '저장'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCapacityEditSlotId(null)}
                        disabled={updateSlotMutation.isPending}
                        className="rounded-md px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100 disabled:opacity-50"
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCapacityEditStart(slot)}
                      aria-label={`${formatSlotRange(slot.startTime, slot.endTime)} 정원 수정`}
                      className="rounded-md px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      정원 수정
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(slot.slotId)}
                    disabled={deleteSlotMutation.isPending}
                    aria-label={`${formatSlotRange(slot.startTime, slot.endTime)} 슬롯 삭제`}
                    className="rounded-md px-2 py-0.5 text-xs text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  >
                    삭제
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {updateSlotMutation.isError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {updateSlotMutation.error instanceof ApiError
            ? updateSlotMutation.error.message
            : '정원 수정 중 오류가 발생했습니다.'}
        </div>
      )}

      {canEdit && (
        <div>
          <p className="mb-2 text-xs text-slate-500">슬롯 패턴으로 추가 생성</p>
          <SlotPatternForm
            onGenerate={handleGenerate}
            isPending={createSlotsMutation.isPending}
          />
          {createSlotsMutation.isError && (
            <div
              role="alert"
              className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {createSlotsMutation.error instanceof ApiError
                ? createSlotsMutation.error.message
                : '슬롯 생성 중 오류가 발생했습니다.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
