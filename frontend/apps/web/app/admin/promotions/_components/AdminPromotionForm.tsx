'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { AdminPromotionSummary, CreatePromotionPayload, UpdatePromotionPayload } from '@duing/types';

type CreateMode = {
  mode: 'create';
  initialValues?: undefined;
  onSubmit: (payload: CreatePromotionPayload) => Promise<void>;
};

type EditMode = {
  mode: 'edit';
  initialValues: AdminPromotionSummary;
  onSubmit: (payload: UpdatePromotionPayload) => Promise<void>;
};

type Props = (CreateMode | EditMode) & {
  isSubmitting: boolean;
  errorMessage?: string | null;
};

type FormState = {
  title: string;
  bannerImageUrl: string;
  linkUrl: string;
  isCuration: boolean;
  clubIdText: string;
  active: boolean;
  displayOrder: string;
};

function buildInitialState(initialValues?: AdminPromotionSummary): FormState {
  if (!initialValues) {
    return {
      title: '',
      bannerImageUrl: '',
      linkUrl: '',
      isCuration: true,
      clubIdText: '',
      active: true,
      displayOrder: '0',
    };
  }
  return {
    title: initialValues.title,
    bannerImageUrl: initialValues.bannerImageUrl,
    linkUrl: initialValues.linkUrl ?? '',
    isCuration: initialValues.club === null,
    clubIdText: initialValues.club ? String(initialValues.club.id) : '',
    active: initialValues.active,
    displayOrder: String(initialValues.displayOrder),
  };
}

export function AdminPromotionForm(props: Props) {
  const { mode, isSubmitting, errorMessage } = props;
  const [state, setState] = useState<FormState>(() =>
    buildInitialState(mode === 'edit' ? props.initialValues : undefined),
  );

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const clubId = state.isCuration ? null : (state.clubIdText ? Number(state.clubIdText) : null);
    const linkUrlValue = state.linkUrl.trim() || null;
    const displayOrderValue = Number(state.displayOrder);

    if (mode === 'create') {
      const payload: CreatePromotionPayload = {
        title: state.title,
        bannerImageUrl: state.bannerImageUrl,
        linkUrl: linkUrlValue,
        clubId,
        active: state.active,
        displayOrder: displayOrderValue,
      };
      await props.onSubmit(payload);
    } else {
      const initialValues = props.initialValues;
      const hadClub = initialValues.club !== null;
      const nowCuration = state.isCuration;

      const payload: UpdatePromotionPayload = {
        title: state.title,
        bannerImageUrl: state.bannerImageUrl,
        linkUrl: linkUrlValue,
        active: state.active,
        displayOrder: displayOrderValue,
      };

      if (hadClub && nowCuration) {
        // 기존에 club 이 있었는데 큐레이션으로 변경 → clearClubId 플래그
        payload.clearClubId = true;
      } else if (!nowCuration) {
        payload.clubId = clubId;
      }

      await props.onSubmit(payload);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Field label="제목 (≤120자)">
        <input
          type="text"
          maxLength={120}
          value={state.title}
          onChange={(event) => update('title', event.target.value)}
          required
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <Field label="배너 이미지 URL (≤500자)">
        <input
          type="url"
          maxLength={500}
          value={state.bannerImageUrl}
          onChange={(event) => update('bannerImageUrl', event.target.value)}
          required
          placeholder="https://..."
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <Field label="링크 URL (선택, ≤2000자)">
        <input
          type="url"
          maxLength={2000}
          value={state.linkUrl}
          onChange={(event) => update('linkUrl', event.target.value)}
          placeholder="https://..."
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <div className="space-y-2">
        <span className="block text-[12.5px] font-semibold text-charcoal-2">동아리 연결</span>
        <label className="inline-flex items-center gap-2 text-[13.5px]">
          <input
            type="checkbox"
            checked={state.isCuration}
            onChange={(event) => update('isCuration', event.target.checked)}
          />
          큐레이션 배너 (동아리 미연결)
        </label>
        {!state.isCuration && (
          <div className="mt-2">
            <label className="block text-[12.5px] font-semibold text-charcoal-2 mb-1.5">
              동아리 ID
            </label>
            <input
              type="number"
              min={1}
              value={state.clubIdText}
              onChange={(event) => update('clubIdText', event.target.value)}
              placeholder="동아리 ID 입력"
              className="w-40 px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-6">
        <label className="inline-flex items-center gap-2 text-[13.5px]">
          <input
            type="checkbox"
            checked={state.active}
            onChange={(event) => update('active', event.target.checked)}
          />
          활성 (배너 노출)
        </label>
      </div>

      <Field label="노출 순서 (숫자가 작을수록 앞에 표시)">
        <input
          type="number"
          min={0}
          value={state.displayOrder}
          onChange={(event) => update('displayOrder', event.target.value)}
          required
          className="w-32 px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
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
          className="px-5 py-2.5 rounded-full bg-ink text-paper text-[13.5px] font-semibold disabled:opacity-50"
        >
          {isSubmitting ? '저장 중…' : mode === 'create' ? '배너 등록' : '수정 저장'}
        </button>
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
