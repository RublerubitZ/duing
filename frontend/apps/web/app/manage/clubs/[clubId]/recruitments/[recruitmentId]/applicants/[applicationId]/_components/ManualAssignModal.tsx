'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { ApiError } from '@duing/api';
import {
  interviewQueryKeys,
  useAssignInterviewScheduleMutation,
  useInterviewSlotsQuery,
} from '@duing/hooks';
import { useQueryClient } from '@tanstack/react-query';

import { formatSlotLabel } from '@/components/interview/_utils/localDateTime';

import type { AvailabilityItem, SlotListView } from '@duing/types';

// 운영진 수동 배정 모달 (Spec P0-3).
// - 기본: 지원자가 선택한 슬롯(`interviewAvailabilities`) 만 노출.
// - 토글 ON 시점에 `useInterviewSlotsQuery({ enabled })` lazy fetch.
// - availability 밖 슬롯(Override) 선택 후 "배정" 클릭 시 confirm dialog 노출.
// - mutation 성공 시 onClose. 실패 시 ApiError message 를 alert 로 표시.
// - 토글 ON lazy fetch 실패 시 inline alert + 토글 자동 OFF.
//
// Override 배정의 audit/사유 입력은 본 spec Out of Scope — 후속 audit spec 에서
// frontend 가 overrideReason 을 mutation payload 에 추가하도록 확장한다.

type Props = {
  applicationId: number;
  recruitmentId: number;
  applicantName: string;
  interviewAvailabilities: AvailabilityItem[];
  assignedSlot: AvailabilityItem | null;
  assignedSlotId: number | null;
  onClose: () => void;
};

type SlotWithMeta = {
  slotId: number;
  startTime: string;
  endTime: string;
  capacity?: number;
  assignedCount?: number;
};

function toSlotMeta(slot: SlotListView): SlotWithMeta | null {
  if (
    slot.slotId === undefined ||
    slot.startTime === undefined ||
    slot.endTime === undefined
  ) {
    return null;
  }
  return {
    slotId: slot.slotId,
    startTime: slot.startTime,
    endTime: slot.endTime,
    capacity: slot.capacity,
    assignedCount: slot.assignedCount,
  };
}

function formatCapacity(slot: SlotWithMeta): string | null {
  if (slot.capacity === undefined) return null;
  const assigned = slot.assignedCount ?? 0;
  return `${assigned}/${slot.capacity} 정원`;
}

export function ManualAssignModal({
  applicationId,
  recruitmentId,
  applicantName,
  interviewAvailabilities,
  assignedSlot,
  assignedSlotId,
  onClose,
}: Props) {
  const titleId = useId();
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(assignedSlotId);
  const [overrideTarget, setOverrideTarget] = useState<number | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const slotsQuery = useInterviewSlotsQuery(recruitmentId, { enabled: showAll });
  const assignMutation = useAssignInterviewScheduleMutation(recruitmentId);

  const availabilitySlotIds = useMemo(
    () => new Set(interviewAvailabilities.map((item) => item.slotId)),
    [interviewAvailabilities],
  );

  // slotId → SlotListView 메타. 토글 OFF 시점에도 slotsQuery.data 가 캐시되어 있으면 활용.
  const slotMetaById = useMemo(() => {
    const map = new Map<number, SlotWithMeta>();
    for (const raw of slotsQuery.data ?? []) {
      const meta = toSlotMeta(raw);
      if (meta) map.set(meta.slotId, meta);
    }
    return map;
  }, [slotsQuery.data]);

  const nonAvailabilitySlots = useMemo<SlotWithMeta[]>(() => {
    if (!slotsQuery.data) return [];
    const result: SlotWithMeta[] = [];
    for (const raw of slotsQuery.data) {
      const meta = toSlotMeta(raw);
      if (!meta) continue;
      if (availabilitySlotIds.has(meta.slotId)) continue;
      result.push(meta);
    }
    return result;
  }, [slotsQuery.data, availabilitySlotIds]);

  // 토글 ON 직후 fetch 실패 — inline error 노출 + 토글 자동 OFF.
  useEffect(() => {
    if (showAll && slotsQuery.isError) {
      setShowAll(false);
    }
  }, [showAll, slotsQuery.isError]);

  // Escape 닫기 + 진입 시 첫 인터랙티브 요소 autofocus.
  // Override confirm 이 열려 있으면 Escape 가 confirm 만 먼저 닫고, 그 외에는 모달을 닫는다.
  // 이 useEffect 는 데이터 패칭이 아닌 키보드 이벤트 리스너 등록이라 가이드라인과 충돌하지 않는다.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (overrideTarget !== null) {
          setOverrideTarget(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [overrideTarget, onClose]);

  // 모달 mount 시 첫 활성 버튼(닫기) 으로 포커스 이동.
  useEffect(() => {
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      'button:not([disabled])',
    );
    firstFocusable?.focus();
  }, []);

  const isEmptyAvailability = interviewAvailabilities.length === 0;
  const assignDisabled =
    selectedSlotId === null || assignMutation.isPending;

  // 토글 OFF 전환 핸들러.
  // hidden 영역(Override 후보 슬롯) 을 선택한 채로 토글을 끄면, UI 에는 숨어 있는 슬롯이
  // selectedSlotId 로 그대로 남아 사용자가 의도하지 않은 Override 배정으로 이어질 수 있다.
  // - availability 밖 슬롯이면 assignedSlotId(있으면) 또는 null 로 되돌리고
  // - overrideTarget / mutationError 도 초기화한다.
  // - slots 쿼리는 resetQueries 로 에러 캐시까지 같이 비워서 재오픈 시 깨끗한 fetch 가 되도록 한다.
  const handleShowAllOff = () => {
    setShowAll(false);
    if (selectedSlotId !== null && !availabilitySlotIds.has(selectedSlotId)) {
      setSelectedSlotId(assignedSlotId);
    }
    setOverrideTarget(null);
    setMutationError(null);
    void queryClient.resetQueries({
      queryKey: interviewQueryKeys.slots(recruitmentId),
    });
  };

  const handleAssignClick = () => {
    setMutationError(null);
    if (selectedSlotId === null) return;
    if (!availabilitySlotIds.has(selectedSlotId)) {
      setOverrideTarget(selectedSlotId);
      return;
    }
    runAssign(selectedSlotId);
  };

  const runAssign = (slotId: number) => {
    assignMutation.mutate(
      { applicationId, slotId },
      {
        onSuccess: () => {
          setOverrideTarget(null);
          setMutationError(null);
          onClose();
        },
        onError: (error: unknown) => {
          setOverrideTarget(null);
          const message =
            error instanceof ApiError
              ? error.message
              : '배정에 실패했습니다. 잠시 후 다시 시도해 주세요.';
          setMutationError(message);
        },
      },
    );
  };

  const assignedSlotLabel = assignedSlot ? formatSlotLabel(assignedSlot) : '미배정';

  return (
    <div
      aria-hidden="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              면접 일정 배정
            </h2>
            <p className="text-sm text-slate-700">지원자: {applicantName}</p>
            <p className="text-sm text-slate-700">현재 배정: {assignedSlotLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            aria-label="닫기"
          >
            닫기
          </button>
        </header>

        <section className="mt-4">
          <h3 className="text-sm font-medium text-slate-700">
            지원자가 선택한 슬롯 ({interviewAvailabilities.length})
          </h3>

          {isEmptyAvailability ? (
            <div
              role="note"
              className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
            >
              <p>지원자가 면접 가능 시간을 제출하지 않았습니다.</p>
              <p>제출 마감 전이라면 제출을 요청하세요.</p>
              <p>긴급한 경우 아래 토글을 통해 운영진이 직접 배정할 수 있습니다.</p>
            </div>
          ) : (
            <ul
              aria-label="지원자가 선택한 슬롯"
              className="mt-2 space-y-1"
            >
              {interviewAvailabilities.map((item) => {
                const meta = slotMetaById.get(item.slotId);
                const capacityLabel = meta ? formatCapacity(meta) : null;
                return (
                  <li
                    key={item.slotId}
                    className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="manual-assign-slot"
                      id={`manual-assign-slot-${item.slotId}`}
                      value={item.slotId}
                      checked={selectedSlotId === item.slotId}
                      onChange={() => setSelectedSlotId(item.slotId)}
                    />
                    <label
                      htmlFor={`manual-assign-slot-${item.slotId}`}
                      className="flex flex-1 items-center justify-between text-slate-900"
                    >
                      <span>{formatSlotLabel(item)}</span>
                      {capacityLabel && (
                        <span className="text-xs text-slate-500">{capacityLabel}</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-4">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              role="switch"
              checked={showAll}
              onChange={(event) => {
                if (event.currentTarget.checked) {
                  setShowAll(true);
                } else {
                  handleShowAllOff();
                }
              }}
            />
            선택하지 않은 슬롯도 보기
          </label>

          {showAll && slotsQuery.isLoading && (
            <p className="mt-2 text-sm text-slate-500">슬롯을 불러오는 중…</p>
          )}

          {showAll && nonAvailabilitySlots.length > 0 && (
            <ul
              aria-label="선택하지 않은 슬롯"
              className="mt-2 space-y-1"
            >
              {nonAvailabilitySlots.map((slot) => {
                const capacityLabel = formatCapacity(slot);
                return (
                  <li
                    key={slot.slotId}
                    className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                  >
                    <input
                      type="radio"
                      name="manual-assign-slot"
                      id={`manual-assign-slot-${slot.slotId}`}
                      value={slot.slotId}
                      checked={selectedSlotId === slot.slotId}
                      onChange={() => setSelectedSlotId(slot.slotId)}
                    />
                    <label
                      htmlFor={`manual-assign-slot-${slot.slotId}`}
                      className="flex flex-1 flex-col gap-0.5"
                    >
                      <span className="flex items-center justify-between">
                        <span>
                          <span aria-hidden="true">⚠ </span>
                          {formatSlotLabel(slot)}
                        </span>
                        {capacityLabel && (
                          <span className="text-xs text-amber-800">{capacityLabel}</span>
                        )}
                      </span>
                      <span className="text-xs text-amber-800">
                        지원자가 선택하지 않은 시간입니다
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {slotsQuery.isError && (
            <p
              role="alert"
              className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              슬롯을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
            </p>
          )}
        </section>

        {mutationError && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {mutationError}
          </p>
        )}

        <footer className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleAssignClick}
            disabled={assignDisabled}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-500"
          >
            배정
          </button>
        </footer>
      </div>

      {overrideTarget !== null && (
        <OverrideConfirmDialog
          onCancel={() => setOverrideTarget(null)}
          onConfirm={() => runAssign(overrideTarget)}
          isPending={assignMutation.isPending}
        />
      )}
    </div>
  );
}

type ConfirmProps = {
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
};

function OverrideConfirmDialog({ onCancel, onConfirm, isPending }: ConfirmProps) {
  const titleId = useId();
  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
      >
        <h3 id={titleId} className="text-base font-semibold text-slate-900">
          지원자가 선택하지 않은 시간입니다.
        </h3>
        <p className="mt-2 text-sm text-slate-700">
          이 시간으로 배정하면 지원자가 참석하기 어려울 수 있습니다.
        </p>
        <p className="mt-1 text-sm text-slate-700">계속 진행하시겠습니까?</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:bg-slate-300 disabled:text-slate-500"
          >
            계속 진행
          </button>
        </div>
      </div>
    </div>
  );
}
