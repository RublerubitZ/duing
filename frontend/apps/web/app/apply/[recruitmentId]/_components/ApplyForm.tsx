'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@duing/api';
import type {
  ApplicationDraft,
  DraftAnswer,
  RecruitmentDetail,
  RecruitmentQuestionItem,
  SubmitApplicationPayload,
} from '@duing/types';
import { kstDateTimeFormatter, parseKstInstant, useSubmitApplicationMutation, draftQueryKeys } from '@duing/hooks';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { Spinner, ButtonSpinner } from '@/components/loading/Spinner';
import { MarkdownProse } from '@/components/markdown/MarkdownProse';
import { useAutosaveDraft } from '../_hooks/useAutosaveDraft';
import { ApplyAnswersStep } from './ApplyAnswersStep';
import { toRoute } from '../../../_lib/route';
import { captureEvent } from '../../../_lib/analytics';

type Props = {
  recruitment: RecruitmentDetail;
  recruitmentId: number;
  questionItems: RecruitmentQuestionItem[];
  initialAnswers: DraftAnswer[];
  /** 임시저장을 되살려 시드했는지 — 안내 배너 노출 조건(ApplyPage 가 판정). */
  restoredDraft?: boolean;
  /** 임시저장 시각(오프셋 없는 KST 벽시계). 있으면 배너에 "· M월 D일 HH:mm 저장" 을 병기한다. */
  draftUpdatedAt?: string | null;
};

const TEXT_REQUIRED_MESSAGE = '필수 질문입니다. 답변을 입력해주세요.';
const CHOICE_REQUIRED_MESSAGE = '필수 질문입니다. 항목을 선택해주세요.';

// 임시저장 시각 표시 "M월 D일 HH:mm" — 로케일 패턴 대신 formatToParts 로 조립한다(sv-SE 등 로케일 패턴 함정).
// 인스턴스 생성 비용이 있어 모듈 레벨에 둔다.
const DRAFT_SAVED_AT_FORMATTER = kstDateTimeFormatter({
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function draftSavedAtLabelOf(updatedAt: string | null): string | null {
  if (updatedAt === null) return null;
  const parsed = parseKstInstant(updatedAt);
  if (Number.isNaN(parsed.getTime())) return null;
  const formattedParts = DRAFT_SAVED_AT_FORMATTER.formatToParts(parsed);
  const partValue = (partType: Intl.DateTimeFormatPartTypes): string =>
    formattedParts.find((part) => part.type === partType)?.value ?? '';
  return `${partValue('month')}월 ${partValue('day')}일 ${partValue('hour')}:${partValue('minute')}`;
}

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

export function ApplyForm({ recruitment, recruitmentId, questionItems, initialAnswers, restoredDraft = false, draftUpdatedAt = null }: Props) {
  const router = useGuardedRouter();
  const queryClient = useQueryClient();
  const submit = useSubmitApplicationMutation(recruitmentId);

  const [answers, setAnswers] = useState<DraftAnswer[]>(initialAnswers);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // 제출 시점에 마감된 경우(409 RECRUITMENT_CLOSED) — 자동저장 410 과 같은 마감 UI 로 수렴시킨다.
  const [closedBySubmit, setClosedBySubmit] = useState(false);
  // 복원 안내는 세션 안에서만 닫힌다(새로고침하면 다시 뜬다 — 다시 시드되기 때문).
  const [restoredNoticeDismissed, setRestoredNoticeDismissed] = useState(false);
  const draftSavedAtLabel = draftSavedAtLabelOf(draftUpdatedAt);
  // 제출 확인 — 제출 후 수정 API 가 없어 되돌릴 수 없는 행동이라 검증 통과 후 한 번 묻는다.
  const [confirmOpen, setConfirmOpen] = useState(false);

  const autosaveStatus = useAutosaveDraft(answers, {
    recruitmentId,
    enabled: true,
  });

  const isClosed = autosaveStatus.kind === 'closed' || closedBySubmit;

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

  const submitDisabled = submit.isPending || isClosed;

  function handleSubmit(event: FormEvent) {
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

    setConfirmOpen(true);
  }

  async function submitApplication() {
    // 확인 버튼의 disabled 는 RQ 알림이 한 태스크 뒤에 전파돼 걸린다 — 같은 틱의 재진입을 동기적으로 막는다.
    if (submit.isPending) return;
    setError(null);
    try {
      // 면접 가능시간 응답은 지원 시점이 아니라 선정 후 라운드 발송을 받고 나서 한다 (재설계 §3).
      const payload: SubmitApplicationPayload = {
        answerItems: answers.map(({ questionId, values }) => ({ questionId, values })),
      };
      const applicationId = await submit.mutateAsync(payload);
      captureEvent('club_application_submitted', {
        recruitment_id: recruitmentId,
        club_name: recruitment.clubName,
        application_id: applicationId,
      });
      // 서버가 제출 시 draft 를 삭제하므로 재조회 대신 캐시를 직접 비운다 — GET 1회 제거(#985).
      queryClient.setQueryData<ApplicationDraft>(draftQueryKeys.byRecruitment(recruitmentId), {
        exists: false,
        answers: [],
        updatedAt: null,
      });
      setConfirmOpen(false);
      router.push(toRoute(`/me/applications/${applicationId}`));
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.code === 'RECRUITMENT_CLOSED') {
        // 제출 직전에 마감된 경우 — 모달을 닫고 마감 배너·입력 비활성으로 전환한다.
        setConfirmOpen(false);
        setClosedBySubmit(true);
        return;
      }
      // 그 외 실패는 모달 안에 남긴다(공통 규칙) — 취소하면 아래 인라인 알림이 같은 메시지를 이어받는다.
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
          {isClosed ? (
            <span className="tabular-nums text-[12.5px] tracking-wide text-coral">
              모집 마감 — 임시저장 및 제출 불가
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 tabular-nums text-[12.5px] tracking-wide text-charcoal-3">
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

        {/* 마감 알림 */}
        {isClosed && (
          // 제출 실패로 동적 삽입되는 경로가 있어 role="alert" 로 스크린리더에 알린다.
          <div role="alert" className="mb-6 rounded-[12px] border border-coral/20 bg-coral/5 px-4 py-3">
            <p className="text-sm text-coral">
              모집이 마감되어 더 이상 임시저장되지 않습니다. 제출도 불가합니다.
            </p>
          </div>
        )}

        {/* 임시저장 복원 안내 — 답변이 미리 채워진 이유를 알린다. 닫기는 세션 내 useState. */}
        {restoredDraft && !restoredNoticeDismissed && (
          <div
            role="status"
            className="mb-6 flex items-center justify-between gap-3 rounded-[12px] border border-sage/30 bg-sage-tint px-4 py-3"
          >
            <p className="text-sm text-ink">
              임시저장한 답변을 불러왔어요
              {draftSavedAtLabel && <span className="text-charcoal-3"> · {draftSavedAtLabel} 저장</span>}
            </p>
            <button
              type="button"
              onClick={() => setRestoredNoticeDismissed(true)}
              aria-label="임시저장 안내 닫기"
              className="btn btn-ghost btn-sm -my-2 min-h-11 shrink-0"
            >
              닫기
            </button>
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
            disabled={isClosed}
          />

          {error && !confirmOpen && (
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
              {submit.isPending && <ButtonSpinner />}지원서 제출하기
            </button>
          </div>
        </form>

        <ConfirmDialog
          open={confirmOpen}
          title="지원서를 제출할까요?"
          description={`${recruitment.title} · 문항 ${questionItems.length}개 · 제출 후에는 수정할 수 없어요.`}
          confirmLabel="제출"
          confirmVariant="primary"
          isPending={submit.isPending}
          errorMessage={error}
          onConfirm={submitApplication}
          onCancel={() => setConfirmOpen(false)}
        />
      </main>
    </div>
  );
}
