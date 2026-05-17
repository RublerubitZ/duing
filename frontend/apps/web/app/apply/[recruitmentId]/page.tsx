'use client';

import { use, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { DraftAnswer, RecruitmentDetail } from '@duing/types';
import {
  useRecruitmentDetailQuery,
  useSubmitApplicationMutation,
  useApplicationDraftQuery,
  draftQueryKeys,
} from '@duing/hooks';
import { useAutosaveDraft } from './_hooks/useAutosaveDraft';
import { toRoute } from '../../_lib/route';

export default function ApplyPage({
  params,
}: {
  params: Promise<{ recruitmentId: string }>;
}) {
  const { recruitmentId: idParam } = use(params);
  const recruitmentId = Number(idParam);
  const router = useRouter();

  const detail = useRecruitmentDetailQuery(recruitmentId);

  if (detail.isLoading || !detail.data) {
    return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  }

  const recruitment = detail.data;

  // 외부 폼 모집은 렌더 시점에 모집 상세로 되돌려보낸다 (effect 내 리다이렉트 금지).
  if (recruitment.applicationMode === 'EXTERNAL') {
    router.replace(
      toRoute(`/clubs/${recruitment.clubId}/recruitments/${recruitment.id}`),
    );
    return <p className="p-6 text-sm text-slate-500">이동 중…</p>;
  }

  // 데이터 도착이 보장된 시점에 자식 컴포넌트를 마운트해 useState 초기값을 props 에서 직접 받게 한다.
  return <ApplyForm recruitment={recruitment} recruitmentId={recruitmentId} />;
}

type ApplyFormProps = {
  recruitment: RecruitmentDetail;
  recruitmentId: number;
};

function ApplyForm({ recruitment, recruitmentId }: ApplyFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const submit = useSubmitApplicationMutation(recruitmentId);
  const draftQuery = useApplicationDraftQuery(recruitmentId);

  // answers 상태: DraftAnswer[] 형태로 관리 (questionId = index 기반)
  const [answers, setAnswers] = useState<DraftAnswer[]>(() =>
    recruitment.questions.map((_, idx) => ({ questionId: idx, value: '' })),
  );
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // 임시저장에서 prefill (최초 1회)
  useEffect(() => {
    if (initializedRef.current) return;
    if (draftQuery.isLoading) return;
    if (draftQuery.data?.exists && draftQuery.data.answers.length > 0) {
      setAnswers(
        recruitment.questions.map((_, idx) => ({
          questionId: idx,
          value: draftQuery.data.answers.find((a) => a.questionId === idx)?.value ?? '',
        })),
      );
    }
    initializedRef.current = true;
  }, [draftQuery.isLoading, draftQuery.data, recruitment.questions]);

  const autosaveStatus = useAutosaveDraft(answers, {
    recruitmentId,
    enabled: initializedRef.current && !draftQuery.isLoading,
  });

  const isClosedByDraft = autosaveStatus.kind === 'closed';

  function formatTime(date: Date): string {
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const applicationId = await submit.mutateAsync({
        answers: answers.map((answer) => answer.value),
      });
      // 제출 성공 후 임시저장 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: draftQueryKeys.byRecruitment(recruitmentId) });
      router.push(toRoute(`/me/applications/${applicationId}`));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '지원에 실패했습니다.');
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-sm text-slate-500">{recruitment.clubName}</p>
      <h1 className="mt-1 text-2xl font-bold">{recruitment.title}</h1>

      {/* 임시저장 상태 표시 */}
      {isClosedByDraft && (
        <div className="mt-4 rounded-md bg-rose-50 border border-rose-200 px-4 py-3">
          <p className="text-sm text-rose-700">
            모집이 마감되어 더 이상 임시저장되지 않습니다. 제출도 불가합니다.
          </p>
        </div>
      )}
      {!isClosedByDraft && (
        <div className="mt-3 h-5 text-xs text-slate-400">
          {autosaveStatus.kind === 'saving' && <span>저장 중…</span>}
          {autosaveStatus.kind === 'saved' && (
            <span>마지막 저장 {formatTime(autosaveStatus.at)}</span>
          )}
          {autosaveStatus.kind === 'error' && (
            <span className="text-amber-600">{autosaveStatus.message}</span>
          )}
        </div>
      )}

      <form className="mt-4 space-y-5" onSubmit={handleSubmit}>
        {recruitment.questions.length === 0 && (
          <p className="text-sm text-slate-500">
            이 모집은 별도 질문이 없습니다. 제출 버튼을 눌러 지원할 수 있습니다.
          </p>
        )}
        {recruitment.questions.map((question, idx) => (
          <label key={idx} className="block">
            <span className="text-sm font-medium text-slate-700">
              {idx + 1}. {question}
            </span>
            <textarea
              required
              rows={4}
              disabled={isClosedByDraft}
              value={answers[idx]?.value ?? ''}
              onChange={(event) =>
                setAnswers((prev) => {
                  const next = prev.slice();
                  next[idx] = { questionId: idx, value: event.target.value };
                  return next;
                })
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </label>
        ))}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={submit.isPending || isClosedByDraft}
          className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {submit.isPending ? '제출 중…' : '제출'}
        </button>
      </form>
    </main>
  );
}
