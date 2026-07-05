'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { CreateFederationFaqPayload } from '@duing/types';
import { useFederationFaqCategoriesQuery } from '@duing/hooks';

// CreateFederationFaqPayload 와 UpdateFederationFaqPayload 가 동일 필드 구성이라
// 폼 상태를 그대로 payload 로 사용한다 (NoticeForm 과 달리 별도 parse/lib 불필요).
export type FaqFormState = CreateFederationFaqPayload;

export const EMPTY_FAQ_FORM: FaqFormState = {
  categoryId: 0,
  question: '',
  answer: '',
  pinned: false,
  published: true,
};

type Props = {
  initialState: FaqFormState;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (state: FaqFormState) => void;
  errorMessage?: string | null;
};

export function FaqForm({ initialState, submitLabel, isSubmitting, onSubmit, errorMessage }: Props) {
  const [state, setState] = useState<FaqFormState>(initialState);
  const categoriesQuery = useFederationFaqCategoriesQuery();

  const update = <K extends keyof FaqFormState>(key: K, value: FaqFormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({ ...state, question: state.question.trim(), answer: state.answer.trim() });
  };

  const canSubmit = state.categoryId > 0 && state.question.trim() !== '' && state.answer.trim() !== '';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Field label="카테고리">
        <select
          value={state.categoryId || ''}
          onChange={(event) => update('categoryId', Number(event.target.value))}
          required
          className="px-3 py-2 rounded-md border border-line bg-paper text-[13.5px]"
        >
          <option value="" disabled>
            카테고리를 선택하세요
          </option>
          {(categoriesQuery.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="질문 (≤300자)">
        <input
          type="text" maxLength={300}
          value={state.question}
          onChange={(event) => update('question', event.target.value)}
          required
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <Field label="답변 (≤4000자)">
        <textarea
          value={state.answer} maxLength={4000} rows={12}
          onChange={(event) => update('answer', event.target.value)}
          required
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <div className="flex items-center gap-6">
        <label className="inline-flex items-center gap-2 text-[13.5px]">
          <input
            type="checkbox"
            checked={state.pinned}
            onChange={(event) => update('pinned', event.target.checked)}
          />
          상단 고정
        </label>
        <label className="inline-flex items-center gap-2 text-[13.5px]">
          <input
            type="checkbox"
            checked={state.published}
            onChange={(event) => update('published', event.target.checked)}
          />
          공개
        </label>
      </div>

      {errorMessage && (
        <p className="rounded-md bg-coral/10 border border-coral/40 px-3 py-2 text-[13px] text-coral">
          {errorMessage}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting || !canSubmit}
          className="px-5 py-2.5 rounded-full bg-ink text-paper text-[13.5px] font-semibold disabled:opacity-50"
        >{isSubmitting ? '저장 중…' : submitLabel}</button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-charcoal-2 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
