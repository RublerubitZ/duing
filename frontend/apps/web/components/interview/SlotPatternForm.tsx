'use client';

import { useState } from 'react';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { generateRoundSlotsFromPattern, type RoundSlotEntry } from './_utils/generateSlotsFromPattern';

// 라운드 슬롯 패턴 폼 — wizard Step3 와 라운드 dashboard 슬롯 섹션이 공용 (구 SlotPatternForm 복제·개조).
// 날짜 + 시작시각 + 종료시각 + 면접시간(분) + 정원 입력 → onGenerate 콜백으로 슬롯 배열 전달.
// capacity 는 필수 입력 (스펙 §10.3 개조사항).

type Props = {
  onGenerate: (slots: RoundSlotEntry[]) => void;
  /** 슬롯 생성 요청이 진행 중이면 true — 제출 버튼 비활성화 */
  isPending?: boolean;
};

function readNumberInput(event: React.ChangeEvent<HTMLInputElement>, fallback: number): number {
  const value = event.target.valueAsNumber;
  return Number.isFinite(value) ? value : fallback;
}

export function SlotPatternForm({ onGenerate, isPending = false }: Props) {
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [capacity, setCapacity] = useState(2);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!date || !startTime || !endTime) {
      setErrorMessage('날짜와 시각을 모두 입력해주세요.');
      return;
    }
    if (durationMinutes < 5 || durationMinutes > 240) {
      setErrorMessage('면접 시간은 5~240분 사이로 입력해주세요.');
      return;
    }
    if (capacity < 1) {
      setErrorMessage('정원은 1명 이상이어야 합니다.');
      return;
    }

    const result = generateRoundSlotsFromPattern({ date, startTime, endTime, durationMinutes, capacity });
    if (!result.ok) {
      setErrorMessage(result.reason);
      return;
    }
    if (result.slots.length === 0) {
      setErrorMessage('입력한 시간 범위로 생성 가능한 슬롯이 없습니다. 시간 범위와 면접 시간을 확인해주세요.');
      return;
    }
    onGenerate(result.slots);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block text-sm">
          <span className="block text-xs text-slate-500">시작 날짜</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
            aria-label="시작 날짜"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>

        <label className="block text-sm">
          <span className="block text-xs text-slate-500">시작 시각</span>
          <input
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            required
            aria-label="시작 시각"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>

        <label className="block text-sm">
          <span className="block text-xs text-slate-500">종료 시각</span>
          <input
            type="time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            required
            aria-label="종료 시각"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>

        <label className="block text-sm">
          <span className="block text-xs text-slate-500">면접 시간 (분)</span>
          <input
            type="number"
            min={5}
            max={240}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(readNumberInput(event, 30))}
            aria-label="면접 시간 (분)"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>

        <label className="block text-sm">
          <span className="block text-xs text-slate-500">슬롯당 정원</span>
          <input
            type="number"
            min={1}
            max={20}
            value={capacity}
            onChange={(event) => setCapacity(readNumberInput(event, 1))}
            required
            aria-label="정원"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending && <ButtonSpinner />}슬롯 생성
      </button>
    </form>
  );
}
