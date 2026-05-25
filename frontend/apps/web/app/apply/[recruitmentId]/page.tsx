'use client';

import { use, useEffect, useState } from 'react';
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
  const draftQuery = useApplicationDraftQuery(recruitmentId);

  // 외부 폼 모집은 동아리 상세로 되돌려보낸다. side-effect 라 effect 로 격리한다.
  const recruitment = detail.data;
  const isExternal = recruitment?.applicationMode === 'EXTERNAL';
  useEffect(() => {
    if (isExternal && recruitment) {
      router.replace(toRoute(`/clubs/${recruitment.clubId}`));
    }
  }, [isExternal, recruitment, router]);

  if (detail.isLoading || !recruitment || draftQuery.isLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: 'linear-gradient(180deg, #ece6d3 0%, #f3efe4 8%, #f3efe4 92%, #ece6d3 100%)' }}
      >
        <p className="font-mono text-sm text-charcoal-3">불러오는 중…</p>
      </div>
    );
  }

  if (isExternal) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: 'linear-gradient(180deg, #ece6d3 0%, #f3efe4 8%, #f3efe4 92%, #ece6d3 100%)' }}
      >
        <p className="font-mono text-sm text-charcoal-3">이동 중…</p>
      </div>
    );
  }

  // draft 가 settle 된 뒤 mount 하므로 자식은 initialAnswers 만 받아 useState 초기값으로 쓴다.
  const draft = draftQuery.data;
  const initialAnswers: DraftAnswer[] = recruitment.questions.map((_, idx) => ({
    questionId: idx,
    value:
      draft?.exists
        ? draft.answers.find((answer) => answer.questionId === idx)?.value ?? ''
        : '',
  }));

  return (
    <ApplyForm
      recruitment={recruitment}
      recruitmentId={recruitmentId}
      initialAnswers={initialAnswers}
    />
  );
}

type ApplyFormProps = {
  recruitment: RecruitmentDetail;
  recruitmentId: number;
  initialAnswers: DraftAnswer[];
};

function ApplyForm({ recruitment, recruitmentId, initialAnswers }: ApplyFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const submit = useSubmitApplicationMutation(recruitmentId);

  const [answers, setAnswers] = useState<DraftAnswer[]>(initialAnswers);
  const [error, setError] = useState<string | null>(null);

  const autosaveStatus = useAutosaveDraft(answers, {
    recruitmentId,
    enabled: true,
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
      queryClient.invalidateQueries({ queryKey: draftQueryKeys.byRecruitment(recruitmentId) });
      router.push(toRoute(`/me/applications/${applicationId}`));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '지원에 실패했습니다.');
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(180deg, #ece6d3 0%, #f3efe4 8%, #f3efe4 92%, #ece6d3 100%)' }}
    >
      <main className="mx-auto max-w-[760px] px-8 pb-24 pt-16">

        {/* 헤더 */}
        <header className="mb-9">
          <p className="mb-1.5 text-[13.5px] font-medium tracking-body text-ink">
            {recruitment.clubName}
          </p>
          <h1 className="mb-2.5 text-[28px] font-bold tracking-tightx text-charcoal">
            {recruitment.title}
          </h1>

          {/* 자동저장 상태 */}
          {isClosedByDraft ? (
            <span className="font-mono text-[12.5px] tracking-wide text-coral">
              모집 마감 — 임시저장 및 제출 불가
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-mono text-[12.5px] tracking-wide text-charcoal-3">
              {autosaveStatus.kind === 'saved' && (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-soft shadow-[0_0_0_3px_rgba(46,97,73,0.18)]" />
                  마지막 저장 {formatTime(autosaveStatus.at)}
                </>
              )}
              {autosaveStatus.kind === 'saving' && (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-warm opacity-80" />
                  저장 중…
                </>
              )}
              {autosaveStatus.kind === 'error' && (
                <span className="text-coral">{autosaveStatus.message}</span>
              )}
            </span>
          )}
        </header>

        {/* 구분선 */}
        <div
          className="mb-8 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, #d9d4c3 20%, #d9d4c3 80%, transparent)' }}
        />

        {/* 마감 알림 */}
        {isClosedByDraft && (
          <div className="mb-6 rounded-[12px] border border-coral/20 bg-coral/5 px-4 py-3">
            <p className="text-sm text-coral">
              모집이 마감되어 더 이상 임시저장되지 않습니다. 제출도 불가합니다.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-7">
          {recruitment.questions.length === 0 && (
            <p className="text-sm text-charcoal-3">
              이 모집은 별도 질문이 없습니다. 제출 버튼을 눌러 지원할 수 있습니다.
            </p>
          )}

          {recruitment.questions.map((question, idx) => (
            <div key={idx} className="space-y-2.5">
              <label
                htmlFor={`q${idx + 1}`}
                className="block text-sm font-semibold tracking-body text-charcoal"
              >
                <span className="mr-1.5 font-mono font-semibold text-ink">
                  {idx + 1}.
                </span>
                {question}
              </label>
              <textarea
                id={`q${idx + 1}`}
                required
                disabled={isClosedByDraft}
                value={answers[idx]?.value ?? ''}
                onChange={(event) =>
                  setAnswers((prev) => {
                    const next = prev.slice();
                    next[idx] = { questionId: idx, value: event.target.value };
                    return next;
                  })
                }
                className="w-full resize-y rounded-[12px] border border-[#cfcab8] bg-white px-4 py-3.5 text-sm leading-[1.55] text-charcoal shadow-[0_1px_0_rgba(47,58,46,0.04),_0_1px_2px_rgba(47,58,46,0.05)] transition-[border-color,box-shadow] placeholder:text-[#b8b8ac] focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/[.15] disabled:bg-[#f5f3ef] disabled:text-charcoal-3"
                style={{ minHeight: '180px' }}
              />
            </div>
          ))}

          {error && (
            <p className="rounded-[10px] bg-coral/5 px-4 py-3 text-sm text-coral">
              {error}
            </p>
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={submit.isPending || isClosedByDraft}
              className="inline-flex items-center gap-2 rounded-[10px] bg-ink px-7 py-3 text-sm font-semibold text-cream shadow-[0_1px_0_rgba(0,0,0,0.04),_0_6px_16px_rgba(31,74,54,0.20)] transition-colors hover:bg-ink-soft active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submit.isPending ? '제출 중…' : '제출'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
