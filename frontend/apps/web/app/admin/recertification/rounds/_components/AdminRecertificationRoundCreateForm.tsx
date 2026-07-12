'use client';

import { useState } from 'react';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { toRoute } from '../../../../_lib/route';
import { useCreateRecertificationRoundMutation } from '@duing/hooks';

const CURRENT_YEAR = new Date().getFullYear();
const LABEL_MAX = 100;
const YEAR_MIN = 2000;
const YEAR_MAX = 2100;

export function AdminRecertificationRoundCreateForm() {
  const router = useGuardedRouter();
  const createMutation = useCreateRecertificationRoundMutation();

  const [yearInput, setYearInput] = useState<string>(String(CURRENT_YEAR));
  const [label, setLabel] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    const parsedYear = Number.parseInt(yearInput, 10);
    if (!Number.isInteger(parsedYear) || parsedYear <= 0) {
      setErrorMessage('연도는 양의 정수로 입력해 주세요.');
      return;
    }
    if (parsedYear < YEAR_MIN || parsedYear > YEAR_MAX) {
      setErrorMessage(`연도는 ${YEAR_MIN} ~ ${YEAR_MAX} 사이여야 합니다.`);
      return;
    }
    if (label.trim().length === 0) {
      setErrorMessage('라벨을 입력해 주세요.');
      return;
    }

    createMutation.mutate(
      { year: parsedYear, label: label.trim() },
      {
        onSuccess: () => router.push(toRoute('/admin/recertification/rounds')),
        onError: () => setErrorMessage('라운드 개설에 실패했습니다. 다시 시도해 주세요.'),
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1">
        <label htmlFor="round-year" className="block text-[13px] font-medium text-charcoal-2">
          연도 <span className="text-coral">*</span>
        </label>
        <input
          id="round-year"
          type="number"
          inputMode="numeric"
          min={YEAR_MIN}
          max={YEAR_MAX}
          step={1}
          value={yearInput}
          onChange={(event) => {
            const next = event.target.value;
            if (next === '' || /^\d+$/.test(next)) setYearInput(next);
          }}
          required
          className="w-full rounded-md border border-line px-3 py-2 text-[14px] focus:border-ink focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="round-label" className="block text-[13px] font-medium text-charcoal-2">
          라벨 <span className="text-coral">*</span>
        </label>
        <input
          id="round-label"
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value.slice(0, LABEL_MAX))}
          placeholder="예: 2026년도 1차 재인증"
          required
          className="w-full rounded-md border border-line px-3 py-2 text-[14px] focus:border-ink focus:outline-none"
        />
        <p className="text-right text-[11px] text-charcoal-3">
          {label.length} / {LABEL_MAX}
        </p>
      </div>

      {errorMessage && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{errorMessage}</p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.push(toRoute('/admin/recertification/rounds'))}
          className="px-4 py-2 rounded-md border border-line text-[13px] text-charcoal-2"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="px-4 py-2 rounded-md bg-ink text-paper text-[13px] font-semibold disabled:opacity-50"
        >
          {createMutation.isPending ? '개설 중…' : '라운드 개설'}
        </button>
      </div>
    </form>
  );
}
