'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { z } from 'zod';
import { useUpdateInterviewMutation } from '@duing/hooks';

const interviewSchema = z.object({
  interviewAt: z.string().refine(
    (value) => new Date(value) > new Date(),
    { message: '면접 일시는 현재 시각 이후여야 합니다.' },
  ),
  interviewLocation: z
    .string()
    .min(1, '장소를 입력해 주세요.')
    .max(200, '장소는 200자 이하여야 합니다.'),
});

type InterviewModalProps = {
  recruitmentId: number;
  applicationId: number;
  onClose: () => void;
};

export function InterviewModal({ recruitmentId, applicationId, onClose }: InterviewModalProps) {
  const [interviewAt, setInterviewAt] = useState('');
  const [interviewLocation, setInterviewLocation] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const updateInterview = useUpdateInterviewMutation(recruitmentId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setValidationError(null);

    const parsed = interviewSchema.safeParse({ interviewAt, interviewLocation });
    if (!parsed.success) {
      setValidationError(parsed.error.errors[0]?.message ?? '입력값을 확인해 주세요.');
      return;
    }

    try {
      await updateInterview.mutateAsync({
        applicationId,
        payload: {
          interviewAt: parsed.data.interviewAt,
          interviewLocation: parsed.data.interviewLocation,
        },
      });
      onClose();
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : '면접 일정 저장에 실패했습니다.');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="interview-modal-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="interview-modal-title" className="text-lg font-semibold text-slate-900">면접 일정 입력</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">면접 일시</span>
            <input
              type="datetime-local"
              required
              value={interviewAt}
              onChange={(event) => setInterviewAt(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">면접 장소</span>
            <input
              type="text"
              required
              maxLength={200}
              placeholder="예: 공학관 401호"
              value={interviewLocation}
              onChange={(event) => setInterviewLocation(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </label>

          {validationError && (
            <p className="text-sm text-rose-600">{validationError}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={updateInterview.isPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {updateInterview.isPending ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}