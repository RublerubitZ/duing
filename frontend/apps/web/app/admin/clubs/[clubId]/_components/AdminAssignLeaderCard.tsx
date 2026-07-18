'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '@duing/api';
import { useAssignAdminLeaderMutation } from '@duing/hooks';
import type { AdminUserSearchResult } from '@duing/types';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { LeaderSearchCombobox } from '../../_components/LeaderSearchCombobox';

type Props = {
  clubId: number;
};

const REASON_MAX = 1000;

export function AdminAssignLeaderCard({ clubId }: Props) {
  const [selectedUser, setSelectedUser] = useState<AdminUserSearchResult | null>(null);
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useAssignAdminLeaderMutation();

  const isReasonBlank = reason.trim().length === 0;
  const submitDisabled = mutation.isPending || selectedUser === null || isReasonBlank;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (selectedUser === null) return;
    if (isReasonBlank) return;

    mutation.mutate(
      { clubId, payload: { newLeaderUserId: selectedUser.id, reason: reason.trim() } },
      {
        onSuccess: () => {
          setSelectedUser(null);
          setReason('');
        },
        onError: (mutationError) => {
          const message =
            mutationError instanceof ApiError
              ? mutationError.message
              : '강제 지정에 실패했습니다.';
          setFormError(message);
        },
      },
    );
  }

  return (
    <section className="rounded-lg border border-rose-200 bg-rose-50 p-5 space-y-4">
      <header>
        <h2 className="text-[15px] font-semibold text-rose-800">회장 없는 동아리 — 강제 지정</h2>
        <p className="mt-1 text-xs text-rose-700 leading-relaxed">
          OFFICER 가 없거나 부재 상황에서 ADMIN 이 신규 LEADER 를 직접 지정합니다.
          일반 회장 인계 경로가 있을 때는 이 기능 대신 인계를 권장합니다.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-rose-800">
            신규 회장 <span className="text-rose-600">*</span>
          </label>
          <LeaderSearchCombobox selectedLeader={selectedUser} onSelect={setSelectedUser} />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-rose-800">
            지정 사유 <span className="text-rose-600">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX))}
            rows={3}
            placeholder="강제 지정 사유를 입력하세요 (최대 1000자)"
            className="w-full rounded-md border border-rose-200 bg-white px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
          />
          <p className="text-right text-[11px] text-rose-400">
            {reason.length} / {REASON_MAX}
          </p>
        </div>

        {formError && (
          <p className="rounded-md bg-white border border-rose-200 px-3 py-2 text-sm text-rose-700">
            {formError}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitDisabled}
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {mutation.isPending && <ButtonSpinner />}강제 지정
          </button>
        </div>
      </form>
    </section>
  );
}
