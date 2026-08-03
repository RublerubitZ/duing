'use client';

import { ApiError } from '@duing/api';
import {
  useInterviewRoundDetailQuery,
  useCreateRoundSlotsMutation,
  useDeleteRoundSlotMutation,
} from '@duing/hooks';
import { formatSlotRange } from '@/components/interview/_utils/localDateTime';
import { SlotPatternForm } from '@/components/interview/SlotPatternForm';
import type { RoundSlotEntry } from '@/components/interview/_utils/generateSlotsFromPattern';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { useToast } from '@/app/_components/toast/ToastProvider';

// Step3: 슬롯 등록
// SlotPatternForm(패턴 입력) → useCreateRoundSlotsMutation → detailQuery.data.slots 표시.
// 행별 [삭제] → useDeleteRoundSlotMutation. 삭제 409 메시지 noisy 노출.

type Props = {
  roundId: number;
  onNext: () => void;
};

export function Step3Slots({ roundId, onNext }: Props) {
  const { addToast } = useToast();
  const detailQuery = useInterviewRoundDetailQuery(roundId, { enabled: true });
  const createSlotsMutation = useCreateRoundSlotsMutation(roundId);
  const deleteSlotMutation = useDeleteRoundSlotMutation(roundId);

  const slots = detailQuery.data?.slots ?? [];

  const handleGenerate = async (generated: RoundSlotEntry[]) => {
    await createSlotsMutation.mutateAsync({ slots: generated });
  };

  const handleDelete = async (slotId: number) => {
    try {
      await deleteSlotMutation.mutateAsync(slotId);
    } catch (error) {
      // 409 (참조 있음) 등 서버 에러 — 인라인 표시는 더 복잡해 토스트로 알린다.
      // 실제 wizard 에서는 발송 전 단계라 409 가 거의 발생하지 않음.
      const message =
        error instanceof ApiError
          ? error.message
          : '슬롯 삭제 중 오류가 발생했습니다.';
      addToast(message, { variant: 'error' });
    }
  };

  if (detailQuery.isLoading) {
    return <LoadingGate label="슬롯 정보 불러오는 중" className="min-h-0 py-8" />;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-slate-900">슬롯 등록</h2>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs text-slate-500">
          날짜와 시간 범위를 입력하면 면접 시간 단위로 슬롯을 자동 생성합니다.
        </p>
        <SlotPatternForm onGenerate={handleGenerate} isPending={createSlotsMutation.isPending} />
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

      {slots.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-700">등록된 슬롯 ({slots.length}개)</h3>
          <ul className="space-y-1">
            {slots.map((slot) => (
              <li
                key={slot.slotId}
                className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="text-slate-700">
                  {formatSlotRange(slot.startTime, slot.endTime)} · 정원 {slot.capacity}명
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(slot.slotId)}
                  aria-label={`${formatSlotRange(slot.startTime, slot.endTime)} 슬롯 삭제`}
                  className="ml-3 rounded-md px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={onNext}
          className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          다음
        </button>
      </div>
    </div>
  );
}
