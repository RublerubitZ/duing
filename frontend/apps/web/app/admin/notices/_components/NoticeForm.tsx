'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { NOTICE_CATEGORY_OPTIONS } from '../../../notices/_lib/categoryLabels';
import { NoticeCoverUploader } from './NoticeCoverUploader';
import { NoticeMarkdownEditor } from './NoticeMarkdownEditor';
import { NoticeTagInput } from './NoticeTagInput';
import { VisibilityPicker } from './VisibilityPicker';
import type { NoticeFormState } from '../_lib/parseNoticeFormState';

type Props = {
  initialState: NoticeFormState;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (state: NoticeFormState) => void;
  errorMessage?: string | null;
};

export function NoticeForm({ initialState, submitLabel, isSubmitting, onSubmit, errorMessage }: Props) {
  const [state, setState] = useState<NoticeFormState>(initialState);

  const update = <K extends keyof NoticeFormState>(key: K, value: NoticeFormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(state);
  };

  const notifyToggleEnabled = state.visibility === 'PUBLIC';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Field label="제목 (≤120자)">
        <input
          type="text" maxLength={120}
          value={state.title}
          onChange={(event) => update('title', event.target.value)}
          required
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <Field label="요약 (≤300자, 카드 노출용)">
        <textarea
          value={state.summary} maxLength={300} rows={2}
          onChange={(event) => update('summary', event.target.value)}
          required
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <Field label="대표 이미지">
        <NoticeCoverUploader value={state.coverImageUrl} onChange={(url) => update('coverImageUrl', url)} />
      </Field>

      <Field label="본문 (마크다운)">
        <NoticeMarkdownEditor value={state.content} onChange={(next) => update('content', next)} />
      </Field>

      <Field label="외부 링크 (선택)">
        <input
          type="url"
          value={state.linkUrl}
          onChange={(event) => update('linkUrl', event.target.value)}
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <Field label="카테고리">
        <select
          value={state.category}
          onChange={(event) => {
            const next = event.target.value;
            if (next === 'FESTIVAL' || next === 'FAIR' || next === 'FUNDING' || next === 'CONTEST' || next === 'GENERAL') {
              update('category', next);
            }
          }}
          className="px-3 py-2 rounded-md border border-line bg-paper text-[13.5px]"
        >
          {NOTICE_CATEGORY_OPTIONS.filter((opt) => opt.value !== 'ALL').map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </Field>

      <Field label="태그 (최대 8개)">
        <NoticeTagInput value={state.tags} onChange={(next) => update('tags', next)} />
      </Field>

      <Field label="노출 범위">
        <VisibilityPicker
          visibility={state.visibility}
          clubScopeRole={state.clubScopeRole}
          targetClubIds={state.targetClubIds}
          onVisibilityChange={(next) => update('visibility', next)}
          onClubScopeRoleChange={(next) => update('clubScopeRole', next)}
          onTargetClubIdsChange={(next) => update('targetClubIds', next)}
        />
      </Field>

      <Field label="만료일 (선택)">
        <input
          type="date"
          value={state.expiresAt ? state.expiresAt.slice(0, 10) : ''}
          onChange={(event) => update('expiresAt', event.target.value ? `${event.target.value}T23:59` : null)}
          className="px-3 py-2 rounded-md border border-line bg-paper text-[13.5px]"
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
            checked={notifyToggleEnabled ? state.notifyOnPublish : true}
            disabled={!notifyToggleEnabled}
            onChange={(event) => update('notifyOnPublish', event.target.checked)}
          />
          알림 발송
          {!notifyToggleEnabled && (
            <span className="text-[11.5px] text-charcoal-3">(공개 범위 외에서는 자동 발송)</span>
          )}
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
          disabled={isSubmitting || !state.coverImageUrl}
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