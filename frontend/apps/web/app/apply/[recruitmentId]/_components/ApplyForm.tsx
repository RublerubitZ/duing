'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@duing/api';
import type { DraftAnswer, RecruitmentDetail } from '@duing/types';
import { useSubmitApplicationMutation, draftQueryKeys } from '@duing/hooks';
import { useAutosaveDraft } from '../_hooks/useAutosaveDraft';
import { ApplyAnswersStep } from './ApplyAnswersStep';
import { toRoute } from '../../../_lib/route';

type Props = {
  recruitment: RecruitmentDetail;
  recruitmentId: number;
  initialAnswers: DraftAnswer[];
};

export function ApplyForm({ recruitment, recruitmentId, initialAnswers }: Props) {
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

  function handleAnswersChange(next: DraftAnswer[]) {
    setAnswers(next);
  }

  const submitDisabled = submit.isPending || isClosedByDraft;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      // 면접 가능시간 응답은 지원 시점이 아니라 선정 후 라운드 발송을 받고 나서 한다 (재설계 §3).
      const payload = { answers: answers.map((answer) => answer.value) };
      const applicationId = await submit.mutateAsync(payload);
      queryClient.invalidateQueries({ queryKey: draftQueryKeys.byRecruitment(recruitmentId) });
      router.push(toRoute(`/me/applications/${applicationId}`));
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message || '지원에 실패했습니다.');
        return;
      }
      setError(submitError instanceof Error ? submitError.message : '지원에 실패했습니다.');
    }
  }

  return (
    <div
      className="min-h-dvh"
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
          <ApplyAnswersStep
            questions={recruitment.questions}
            answers={answers}
            onChange={handleAnswersChange}
            disabled={isClosedByDraft}
          />

          {error && (
            <p
              role="alert"
              className="rounded-[10px] bg-coral/5 px-4 py-3 text-sm text-coral"
            >
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="submit"
              disabled={submitDisabled}
              className="btn btn-primary px-7 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submit.isPending ? '제출 중…' : '제출'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
