'use client';

import { useMemo } from 'react';
import { ApiError } from '@duing/api';
import type { ApplicantInterviewSlot } from '@duing/types';
import { SlotPickerByDateGroup } from '@/components/interview/SlotPickerByDateGroup';
import { parseLocalDateTime } from '@/components/interview/_utils/localDateTime';

type Props = {
  slots: ApplicantInterviewSlot[];
  isLoadingSlots: boolean;
  isSlotsError?: boolean;
  slotsError?: unknown;
  selectedSlotIds: number[];
  onChange: (next: number[]) => void;
  // 백엔드 RecruitmentDetailResponse.interviewAvailabilityDeadline (LocalDateTime).
  // null/undefined 면 deadline 미설정으로 간주 → 항상 입력 가능.
  availabilityDeadline?: string | null;
};

function isDeadlinePassed(deadline: string | null | undefined): boolean {
  if (!deadline) return false;
  const parts = parseLocalDateTime(deadline);
  if (!parts) return false;
  const deadlineDate = new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Date.now() > deadlineDate.getTime();
}

function formatDeadlineLabel(deadline: string): string {
  const parts = parseLocalDateTime(deadline);
  if (!parts) return deadline;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${parts.year}년 ${parts.month}월 ${parts.day}일 ${pad(parts.hour)}:${pad(parts.minute)}`;
}

// 슬롯 조회 에러 → 사용자용 카피로 분기.
// 409 (NoSlotsAvailable — 모집 종료) 는 백엔드 메시지를 그대로 노출하고, 그 외에는 일반 안내.
function slotsErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return error.message || '모집이 종료되어 면접 슬롯을 조회할 수 없습니다.';
    }
    return error.message || '면접 슬롯을 불러오지 못했습니다.';
  }
  return '면접 슬롯을 불러오지 못했습니다.';
}

export function ApplyInterviewSlotsStep({
  slots,
  isLoadingSlots,
  isSlotsError = false,
  slotsError,
  selectedSlotIds,
  onChange,
  availabilityDeadline,
}: Props) {
  const deadlinePassed = useMemo(
    () => isDeadlinePassed(availabilityDeadline),
    [availabilityDeadline],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-charcoal">면접 가능시간 선택</h2>
        <p className="text-xs text-charcoal-3">
          가능한 시간을 모두 선택해주세요. 최소 1개 이상 선택해야 제출할 수 있습니다.
        </p>
        {availabilityDeadline && !deadlinePassed && (
          <p className="text-xs text-charcoal-3">
            가능시간 제출 마감: {formatDeadlineLabel(availabilityDeadline)}
          </p>
        )}
      </div>

      {deadlinePassed && (
        <div
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          면접 가능시간 제출 기간이 종료되었습니다.
        </div>
      )}

      {isLoadingSlots ? (
        <p className="rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-500">
          슬롯을 불러오는 중…
        </p>
      ) : isSlotsError ? (
        <p
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {slotsErrorMessage(slotsError)}
        </p>
      ) : slots.length === 0 ? (
        <p className="rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-500">
          운영진이 아직 면접 슬롯을 등록하지 않았습니다. 잠시 후 다시 확인해주세요.
        </p>
      ) : (
        <SlotPickerByDateGroup
          slots={slots}
          selectedSlotIds={selectedSlotIds}
          onChange={onChange}
          disabled={deadlinePassed}
          minSelected={1}
        />
      )}
    </div>
  );
}
