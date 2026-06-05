'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { createGlobalEventSchema, updateGlobalEventSchema } from '@duing/schemas';
import {
  GLOBAL_EVENT_CATEGORY_LABEL,
  GLOBAL_EVENT_CATEGORY_ORDER,
  isGlobalEventCategory,
} from '../_lib/categoryLabels';
import type { GlobalEventFormState } from '../_lib/parseGlobalEventFormState';

const FORM_STATE_KEYS = [
  'title',
  'description',
  'startAt',
  'endAt',
  'location',
  'linkUrl',
  'category',
] as const satisfies readonly (keyof GlobalEventFormState)[];

function isFormStateKey(value: string): value is keyof GlobalEventFormState {
  return (FORM_STATE_KEYS as readonly string[]).includes(value);
}

type Props = {
  initialState: GlobalEventFormState;
  submitLabel: string;
  isSubmitting: boolean;
  mode: 'create' | 'edit';
  onSubmit: (state: GlobalEventFormState) => void;
  errorMessage?: string | null;
};

export function AdminGlobalEventForm({
  initialState,
  submitLabel,
  isSubmitting,
  mode,
  onSubmit,
  errorMessage,
}: Props) {
  const [state, setState] = useState<GlobalEventFormState>(initialState);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof GlobalEventFormState, string>>>({});

  const update = <K extends keyof GlobalEventFormState>(key: K, value: GlobalEventFormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const schema = mode === 'create' ? createGlobalEventSchema : updateGlobalEventSchema;
    const result = schema.safeParse(state);
    if (!result.success) {
      const errors: Partial<Record<keyof GlobalEventFormState, string>> = {};
      for (const issue of result.error.issues) {
        const rawKey = issue.path[0];
        if (typeof rawKey === 'string' && isFormStateKey(rawKey)) {
          errors[rawKey] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    onSubmit(state);
  };

  const descriptionLength = state.description.length;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Field label="카테고리" error={fieldErrors.category}>
        <select
          required
          value={state.category}
          onChange={(changeEvent) => {
            const next = changeEvent.target.value;
            if (next === '') {
              update('category', '');
              return;
            }
            if (isGlobalEventCategory(next)) {
              update('category', next);
            }
          }}
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        >
          <option value="" disabled hidden>
            카테고리 선택
          </option>
          {GLOBAL_EVENT_CATEGORY_ORDER.map((categoryValue) => (
            <option key={categoryValue} value={categoryValue}>
              {GLOBAL_EVENT_CATEGORY_LABEL[categoryValue]}
            </option>
          ))}
        </select>
        {state.category === 'OTHER' && (
          <p className="mt-1 text-xs text-coral">
            ⚠️ 5개 카테고리 중 적합한 것이 없는 경우에만 사용해주세요.
          </p>
        )}
      </Field>

      <Field label="제목 (≤120자)" error={fieldErrors.title}>
        <input
          type="text"
          maxLength={120}
          required
          value={state.title}
          onChange={(changeEvent) => update('title', changeEvent.target.value)}
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="시작 일시" error={fieldErrors.startAt}>
          <input
            type="datetime-local"
            required
            value={state.startAt}
            onChange={(changeEvent) => update('startAt', changeEvent.target.value)}
            className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
          />
        </Field>
        <Field label="종료 일시" error={fieldErrors.endAt}>
          <input
            type="datetime-local"
            required
            value={state.endAt}
            onChange={(changeEvent) => update('endAt', changeEvent.target.value)}
            className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
          />
        </Field>
      </div>

      <Field label="장소 (선택, ≤200자)" error={fieldErrors.location}>
        <input
          type="text"
          maxLength={200}
          value={state.location}
          onChange={(changeEvent) => update('location', changeEvent.target.value)}
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <Field label="링크 URL (선택, ≤500자)" error={fieldErrors.linkUrl}>
        <input
          type="url"
          maxLength={500}
          placeholder="https://..."
          value={state.linkUrl}
          onChange={(changeEvent) => update('linkUrl', changeEvent.target.value)}
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <Field label={`설명 (선택, ${descriptionLength}/2000)`} error={fieldErrors.description}>
        <textarea
          rows={5}
          maxLength={2000}
          value={state.description}
          onChange={(changeEvent) => update('description', changeEvent.target.value)}
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      {errorMessage && (
        <p className="rounded-md bg-coral/10 border border-coral/40 px-3 py-2 text-[13px] text-coral">
          {errorMessage}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-5 py-2.5 rounded-full bg-ink text-paper text-[13.5px] font-semibold disabled:opacity-60"
        >
          {isSubmitting ? '저장 중…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block mb-1.5 text-[12.5px] font-semibold text-charcoal-2">{label}</span>
      {children}
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </label>
  );
}
