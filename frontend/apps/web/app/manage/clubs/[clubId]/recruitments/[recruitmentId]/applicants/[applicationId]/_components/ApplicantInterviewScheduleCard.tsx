'use client';

import { formatSlotLabel } from '@/components/interview/_utils/localDateTime';

import type { AvailabilityItem } from '@duing/types';

// 운영진 지원자 상세 화면의 "면접 일정" 카드 (Spec P0-2).
// - 현재 배정 슬롯 (없으면 "미배정")
// - 지원자가 선택한 면접 가능 시간 (없으면 "아직 선택하지 않았습니다")
// - "수동 배정 변경" 버튼 (Task 6 에서 모달 wiring 예정)
//
// `assignedSlot` 이 `interviewAvailabilities` 안에 포함되어 있으면 해당 row 에
// "현재 배정" 배지를 함께 표시한다. Override(선택 외 슬롯에 배정) 케이스에서는
// "현재 배정" 섹션에만 라벨이 노출되고 리스트 row 에는 배지를 표시하지 않는다.

type Props = {
  interviewAvailabilities: AvailabilityItem[];
  assignedSlot: AvailabilityItem | null;
  onOpenManualAssign: () => void;
};

export function ApplicantInterviewScheduleCard({
  interviewAvailabilities,
  assignedSlot,
  onOpenManualAssign,
}: Props) {
  const availabilityCount = interviewAvailabilities.length;

  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">면접 일정</h2>
        <button
          type="button"
          onClick={onOpenManualAssign}
          className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
        >
          수동 배정 변경
        </button>
      </header>

      <dl className="space-y-3">
        <div>
          <dt className="text-xs text-neutral-500">현재 배정</dt>
          <dd className="mt-1 text-sm text-slate-900">
            {assignedSlot ? formatSlotLabel(assignedSlot) : '미배정'}
          </dd>
        </div>

        <div>
          <dt className="text-xs text-neutral-500">
            지원자가 선택한 면접 가능 시간 ({availabilityCount}개)
          </dt>
          <dd className="mt-1">
            {availabilityCount === 0 ? (
              <p className="text-sm text-neutral-500">아직 선택하지 않았습니다</p>
            ) : (
              <ul
                aria-label="지원자가 선택한 면접 가능 시간"
                className="space-y-1"
              >
                {interviewAvailabilities.map((item) => {
                  const isAssigned = assignedSlot?.slotId === item.slotId;
                  return (
                    <li
                      key={item.slotId}
                      className="flex items-center gap-2 text-sm text-slate-900"
                    >
                      <span>{formatSlotLabel(item)}</span>
                      {isAssigned && (
                        <span className="rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                          현재 배정
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
