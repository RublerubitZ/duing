'use client';

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@duing/api';
import type { DraftAnswer, RecruitmentDetail } from '@duing/types';
import {
  useSubmitApplicationMutation,
  useApplicantInterviewSlotsQuery,
  draftQueryKeys,
} from '@duing/hooks';
import { useAutosaveDraft } from '../_hooks/useAutosaveDraft';
import { useSelectedSlotIds } from '../_hooks/useSelectedSlotIds';
import { ApplyAnswersStep } from './ApplyAnswersStep';
import { ApplyInterviewSlotsStep } from './ApplyInterviewSlotsStep';
import { ApplyStepHeader } from './ApplyStepHeader';
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

  const totalSteps: 1 | 2 = recruitment.useInterview ? 2 : 1;
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [answers, setAnswers] = useState<DraftAnswer[]>(initialAnswers);
  const [error, setError] = useState<string | null>(null);

  const autosaveStatus = useAutosaveDraft(answers, {
    recruitmentId,
    enabled: true,
  });

  const isClosedByDraft = autosaveStatus.kind === 'closed';

  // 면접 모집인 경우에만 슬롯/선택 상태를 활성화 (hook 자체는 항상 호출 → react rules).
  const slotsQuery = useApplicantInterviewSlotsQuery(recruitmentId);
  const { selectedSlotIds, setSelectedSlotIds, clearSelectedSlotIds } =
    useSelectedSlotIds(recruitmentId);
  const slots = useMemo(() => slotsQuery.data ?? [], [slotsQuery.data]);
  const useInterview = recruitment.useInterview;

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

  function handleSelectedSlotsChange(next: number[]) {
    setSelectedSlotIds(next);
  }

  function goToStep2() {
    setError(null);
    setCurrentStep(2);
  }

  function goToStep1() {
    setError(null);
    setCurrentStep(1);
  }

  const slotSelectionMeetsMin = !useInterview || selectedSlotIds.length >= 1;
  const isLastStep = currentStep === totalSteps;
  const submitDisabled =
    submit.isPending || isClosedByDraft || (useInterview && !slotSelectionMeetsMin);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isLastStep) {
      // Step 1 의 폼 submit (Enter 등) 은 Step 2 로 진행.
      goToStep2();
      return;
    }
    setError(null);
    try {
      const payload = useInterview
        ? {
            answers: answers.map((answer) => answer.value),
            interviewSlotIds: selectedSlotIds,
          }
        : { answers: answers.map((answer) => answer.value) };
      const applicationId = await submit.mutateAsync(payload);
      queryClient.invalidateQueries({ queryKey: draftQueryKeys.byRecruitment(recruitmentId) });
      clearSelectedSlotIds();
      router.push(toRoute(`/me/applications/${applicationId}`));
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        // 409 AVAILABILITY_PERIOD_CLOSED / 기타 비즈니스 예외는 서버 메시지 그대로 노출.
        setError(submitError.message || '지원에 실패했습니다.');
        return;
      }
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

        <ApplyStepHeader
          currentStep={currentStep}
          totalSteps={totalSteps}
          onPrev={goToStep1}
        />

        <form onSubmit={handleSubmit} className="space-y-7">
          {currentStep === 1 && (
            <ApplyAnswersStep
              questions={recruitment.questions}
              answers={answers}
              onChange={handleAnswersChange}
              disabled={isClosedByDraft}
            />
          )}

          {currentStep === 2 && useInterview && (
            <ApplyInterviewSlotsStep
              slots={slots}
              isLoadingSlots={slotsQuery.isLoading}
              isSlotsError={slotsQuery.isError}
              slotsError={slotsQuery.error}
              selectedSlotIds={selectedSlotIds}
              onChange={handleSelectedSlotsChange}
              availabilityDeadline={recruitment.interviewAvailabilityDeadline ?? null}
            />
          )}

          {error && (
            <p
              role="alert"
              className="rounded-[10px] bg-coral/5 px-4 py-3 text-sm text-coral"
            >
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            {currentStep === 2 ? (
              <button
                type="button"
                onClick={goToStep1}
                className="inline-flex items-center gap-2 rounded-[10px] border border-charcoal/15 bg-white px-5 py-3 text-sm font-semibold text-charcoal hover:bg-cream"
              >
                이전
              </button>
            ) : (
              <span />
            )}

            {isLastStep ? (
              <button
                type="submit"
                disabled={submitDisabled}
                className="inline-flex items-center gap-2 rounded-[10px] bg-ink px-7 py-3 text-sm font-semibold text-cream shadow-[0_1px_0_rgba(0,0,0,0.04),_0_6px_16px_rgba(31,74,54,0.20)] transition-colors hover:bg-ink-soft active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submit.isPending ? '제출 중…' : '제출'}
              </button>
            ) : (
              <button
                type="button"
                onClick={goToStep2}
                disabled={isClosedByDraft}
                className="inline-flex items-center gap-2 rounded-[10px] bg-ink px-7 py-3 text-sm font-semibold text-cream shadow-[0_1px_0_rgba(0,0,0,0.04),_0_6px_16px_rgba(31,74,54,0.20)] transition-colors hover:bg-ink-soft active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
              >
                다음
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
