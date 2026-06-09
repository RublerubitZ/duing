'use client';

import { useState } from 'react';
import { slotPatternSchema } from '@duing/schemas';
import { nowLocalInputValue } from '@/components/interview/_utils/localDateTime';
import {
  generateSlotsFromPattern,
  type SlotEntry,
} from '../_utils/generateSlotsFromPattern';

// SlotSection 의 패턴 입력 폼. startTime / intervalMinutes / count / capacity
// 4 개 값을 받아 onPreview 콜백으로 슬롯 배열을 전달한다.
//
// 모집이 이미 시작되었거나(`disabled`), zod 검증 실패 시 onPreview 가 호출되지 않는다.
// schema validation 실패 메시지는 fieldset 하단의 errorMessage 영역에 노출된다.

type Props = {
  onPreview: (slots: SlotEntry[]) => void;
  disabled?: boolean;
};

// number input 의 빈 값/잘못된 입력을 안전하게 수치로 변환. valueAsNumber 는
// 빈 입력에 NaN 을 반환하므로 Number.isFinite 가드를 통해 fallback 으로 떨어뜨린다.
function readNumberInput(
  event: React.ChangeEvent<HTMLInputElement>,
  fallback: number,
): number {
  const value = event.target.valueAsNumber;
  return Number.isFinite(value) ? value : fallback;
}

export function SlotPatternForm({ onPreview, disabled }: Props) {
  const [startTime, setStartTime] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [count, setCount] = useState(6);
  const [capacity, setCapacity] = useState(2);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const minLocal = nowLocalInputValue();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    if (disabled) return;

    const validation = slotPatternSchema.safeParse({
      startTime,
      intervalMinutes,
      count,
      capacity,
    });
    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      setErrorMessage(firstIssue?.message ?? '입력값이 올바르지 않습니다.');
      return;
    }
    onPreview(generateSlotsFromPattern({ startTime, intervalMinutes, count, capacity }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <fieldset
        disabled={disabled}
        className="grid grid-cols-1 gap-3 sm:grid-cols-4"
        aria-describedby={errorMessage ? 'slot-pattern-error' : undefined}
      >
        <legend className="sr-only">슬롯 패턴 입력</legend>

        <label className="block text-sm">
          <span className="block text-xs text-slate-500">시작 시각</span>
          <input
            type="datetime-local"
            min={minLocal}
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>

        <label className="block text-sm">
          <span className="block text-xs text-slate-500">간격 (분)</span>
          <input
            type="number"
            min={5}
            max={240}
            value={intervalMinutes}
            onChange={(event) => setIntervalMinutes(readNumberInput(event, 0))}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>

        <label className="block text-sm">
          <span className="block text-xs text-slate-500">슬롯 개수</span>
          <input
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(event) => setCount(readNumberInput(event, 0))}
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
            onChange={(event) => setCapacity(readNumberInput(event, 0))}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>
      </fieldset>

      {errorMessage && (
        <div
          id="slot-pattern-error"
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          <strong className="block font-medium">입력값을 확인해주세요</strong>
          <span>{errorMessage}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={disabled}
        className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-50"
      >
        + 미리보기에 추가
      </button>
    </form>
  );
}
