'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@duing/api';
import type {
  DraftAnswer,
  RecruitmentDetail,
  RecruitmentQuestionItem,
  SubmitApplicationPayload,
} from '@duing/types';
import { useSubmitApplicationMutation, draftQueryKeys } from '@duing/hooks';
import { Spinner, ButtonSpinner } from '@/components/loading/Spinner';
import { MarkdownProse } from '@/components/markdown/MarkdownProse';
import { useAutosaveDraft } from '../_hooks/useAutosaveDraft';
import { ApplyAnswersStep } from './ApplyAnswersStep';
import { toRoute } from '../../../_lib/route';

type Props = {
  recruitment: RecruitmentDetail;
  recruitmentId: number;
  questionItems: RecruitmentQuestionItem[];
  initialAnswers: DraftAnswer[];
};

const TEXT_REQUIRED_MESSAGE = '필수 질문입니다. 답변을 입력해주세요.';
const CHOICE_REQUIRED_MESSAGE = '필수 질문입니다. 항목을 선택해주세요.';

/**
 * 필수 응답 검증 — 체크박스 그룹은 HTML `required` 로 표현할 수 없으므로
 * 주관식까지 포함해 JS 로 일원화한다(브라우저 기본 말풍선과 인라인 안내의 이중 노출 방지).
 */
function collectRequiredViolations(
  questionItems: RecruitmentQuestionItem[],
  answers: DraftAnswer[],
): Record<string, string> {
  const violations: Record<string, string> = {};
  questionItems.forEach((question) => {
    if (!question.required) return;
    const values = answers.find((answer) => answer.questionId === question.id)?.values ?? [];
    if (question.type === 'TEXT') {
      if ((values[0] ?? '').trim() === '') violations[question.id] = TEXT_REQUIRED_MESSAGE;
      return;
    }
    if (values.length === 0) violations[question.id] = CHOICE_REQUIRED_MESSAGE;
  });
  return violations;
}

export function ApplyForm({ recruitment, recruitmentId, questionItems, initialAnswers }: Props) {
  const router = useGuardedRouter();
  const queryClient = useQueryClient();
  const submit = useSubmitApplicationMutation(recruitmentId);

  const [answers, setAnswers] = useState<DraftAnswer[]>(initialAnswers);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
    // 답변이 바뀐 질문의 안내만 걷어낸다 — 아직 손대지 않은 다른 위반은 그대로 남긴다.
    const changedQuestionIds = next
      .filter((nextAnswer) => {
        const previous = answers.find((answer) => answer.questionId === nextAnswer.questionId);
        return (
          previous === undefined ||
          JSON.stringify(previous.values) !== JSON.stringify(nextAnswer.values)
        );
      })
      .map((nextAnswer) => nextAnswer.questionId);

    setAnswers(next);

    if (changedQuestionIds.length > 0) {
      setFieldErrors((current) => {
        const remaining = { ...current };
        changedQuestionIds.forEach((questionId) => {
          delete remaining[questionId];
        });
        return remaining;
      });
    }
  }

  const submitDisabled = submit.isPending || isClosedByDraft;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const violations = collectRequiredViolations(questionItems, answers);
    setFieldErrors(violations);
    const firstViolatedQuestion = questionItems.find(
      (question) => violations[question.id] !== undefined,
    );
    if (firstViolatedQuestion !== undefined) {
      // 안내가 붙는 컨트롤(주관식 textarea / 선택형 그룹 컨테이너)로 바로 포커스를 옮긴다.
      document.getElementById(`q-${firstViolatedQuestion.id}`)?.focus();
      return;
    }

    try {
      // 면접 가능시간 응답은 지원 시점이 아니라 선정 후 라운드 발송을 받고 나서 한다 (재설계 §3).
      const payload: SubmitApplicationPayload = {
        answerItems: answers.map(({ questionId, values }) => ({ questionId, values })),
      };
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
                <span role="status" aria-label="저장 중" className="inline-flex items-center">
                  <Spinner size={12} />
                </span>
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

        {/* 모집 안내문 — 모집 정보(헤더) → 안내문 → 지원서 질문 순서 정책. content 없으면 미표시 */}
        {recruitment.content && (
          <section aria-label="모집 안내" className="mb-9">
            <h2 className="mb-3 text-[13px] font-bold tracking-wide text-ink">모집 안내</h2>
            <MarkdownProse content={recruitment.content} className="text-[14.5px]" />
          </section>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-7">
          <ApplyAnswersStep
            questions={questionItems}
            answers={answers}
            errors={fieldErrors}
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
              {submit.isPending && <ButtonSpinner />}제출
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
