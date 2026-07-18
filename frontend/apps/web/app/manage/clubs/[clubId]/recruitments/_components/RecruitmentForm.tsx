'use client';

import { useCallback, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { QuestionItemPayload, RecruitmentDetail } from '@duing/types';
import { createRecruitmentSchema, updateRecruitmentSchema } from '@duing/schemas';
import { cn } from '../../../../../_lib/cn';
import { QuestionBuilder, toBuilderQuestions, toQuestionItemsPayload } from './QuestionBuilder';
import type { BuilderQuestion } from './QuestionBuilder';
import { ButtonSpinner } from '@/components/loading/Spinner';

type CreateMode = {
  mode: 'create';
  onSubmit: (values: CreateFormValues) => Promise<void>;
  isPending: boolean;
};

type EditMode = {
  mode: 'edit';
  initialValues: RecruitmentDetail;
  onSubmit: (values: EditFormValues) => Promise<void>;
  isPending: boolean;
};

export type CreateFormValues = {
  title: string;
  content: string;
  startDate: string;
  endDate: string | null;
  capacity: number;
  applicationMode: 'SELF' | 'EXTERNAL';
  externalFormUrl: string;
  useInterview: boolean;
  targetRole: 'MEMBER' | 'OFFICER';
  questionItems: QuestionItemPayload[];
  interviewStartDate: string | null;
  interviewEndDate: string | null;
  showApplicantCount: boolean;
};

export type EditFormValues = {
  title: string;
  content: string;
  startDate: string;
  endDate: string;
  capacity: number;
  useInterview: boolean;
  // 구 BE 상세(questionItems 부재)에서는 아예 생략한다 — 아래 isLegacyQuestionsBackend 주석 참조.
  questionItems?: QuestionItemPayload[];
  interviewStartDate: string | null;
  interviewEndDate: string | null;
  showApplicantCount: boolean;
};

type RecruitmentFormProps = CreateMode | EditMode;

const fieldLabelClass = 'block text-sm font-medium text-slate-700';
const fieldInputClass =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400';

export function RecruitmentForm(props: RecruitmentFormProps) {
  const isEditMode = props.mode === 'edit';
  const initialData = isEditMode ? props.initialValues : null;

  /**
   * 구 BE 는 상세에 questionItems 를 아예 싣지 않는다(신 BE 는 자체 폼이면 최소 1개, 외부 폼이면 []
   * 를 항상 내려주므로 undefined 와 [] 를 구분해야 한다).
   *
   * 구 BE 의 수정 API 는 미지 필드 questionItems 를 조용히 버리고, questions 누락은 "질문 미변경"
   * 으로 처리해 200 을 돌려준다. 그대로 빌더를 열어두면 리더는 저장에 성공했다고 믿지만 질문은
   * 그대로 남는다. 생성·제출 경로처럼 시끄럽게 실패하지 않으므로, 수정 모드에서는 편집을 막고
   * payload 에서도 questionItems 를 제외한다.
   */
  const isLegacyQuestionsBackend = isEditMode && initialData?.questionItems === undefined;

  const [title, setTitle] = useState(initialData?.title ?? '');
  const [content, setContent] = useState(initialData?.content ?? '');
  const [startDate, setStartDate] = useState(initialData?.startDate ?? '');
  const [endDate, setEndDate] = useState(initialData?.endDate ?? '');
  const [isAlwaysOpen, setIsAlwaysOpen] = useState(
    isEditMode ? initialData?.endDate === null : false,
  );
  const [capacity, setCapacity] = useState(initialData?.capacity ?? 1);
  const [applicationMode, setApplicationMode] = useState<'SELF' | 'EXTERNAL'>(
    initialData?.applicationMode ?? 'SELF',
  );
  const [externalFormUrl, setExternalFormUrl] = useState(
    initialData?.externalFormUrl ?? '',
  );
  const [useInterview, setUseInterview] = useState(initialData?.useInterview ?? false);
  const [interviewStartDate, setInterviewStartDate] = useState(initialData?.interviewStartDate ?? '');
  const [interviewEndDate, setInterviewEndDate] = useState(initialData?.interviewEndDate ?? '');
  const [showApplicantCount, setShowApplicantCount] = useState(initialData?.showApplicantCount ?? false);
  const [targetRole, setTargetRole] = useState<'MEMBER' | 'OFFICER'>(
    initialData?.targetRole ?? 'MEMBER',
  );
  // 서버 id 와 무관한 React key 발급기 — jsdom 에 crypto.randomUUID 가 없어 카운터로 만든다.
  const keyCounter = useRef(0);
  const nextKey = useCallback(() => `bq-${(keyCounter.current += 1)}`, []);
  const [questionItems, setQuestionItems] = useState<BuilderQuestion[]>(() =>
    isEditMode && !isLegacyQuestionsBackend
      ? toBuilderQuestions(initialData?.questionItems, initialData?.questions ?? [], nextKey)
      : [],
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isSelfForm = isEditMode ? initialData?.applicationMode === 'SELF' : applicationMode === 'SELF';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setValidationError(null);
    setSubmitError(null);

    if (isEditMode) {
      const editableQuestionItems =
        isSelfForm && !isLegacyQuestionsBackend ? toQuestionItemsPayload(questionItems) : undefined;
      const parsed = updateRecruitmentSchema.safeParse({
        title,
        content: content || undefined,
        startDate,
        endDate,
        capacity,
        useInterview,
        questionItems: editableQuestionItems,
        interviewStartDate: useInterview && interviewStartDate ? interviewStartDate : null,
        interviewEndDate: useInterview && interviewEndDate ? interviewEndDate : null,
        showApplicantCount,
      });
      if (!parsed.success) {
        setValidationError(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
        return;
      }
      try {
        await props.onSubmit({
          title: parsed.data.title,
          content: content,
          startDate: parsed.data.startDate,
          endDate: parsed.data.endDate,
          capacity: parsed.data.capacity,
          useInterview: parsed.data.useInterview,
          // undefined 면 JSON 직렬화에서 키가 통째로 빠진다 — 구 BE 에 무의미한 필드를 싣지 않는다.
          ...(parsed.data.questionItems === undefined
            ? {}
            : { questionItems: parsed.data.questionItems }),
          interviewStartDate: parsed.data.interviewStartDate ?? null,
          interviewEndDate: parsed.data.interviewEndDate ?? null,
          showApplicantCount: parsed.data.showApplicantCount ?? false,
        });
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다.');
      }
      return;
    }

    const parsed = createRecruitmentSchema.safeParse({
      title,
      content: content || undefined,
      startDate,
      endDate: isAlwaysOpen ? null : endDate,
      capacity,
      applicationMode,
      externalFormUrl: externalFormUrl || undefined,
      useInterview,
      targetRole,
      questionItems: isSelfForm ? toQuestionItemsPayload(questionItems) : undefined,
      interviewStartDate: useInterview && interviewStartDate ? interviewStartDate : null,
      interviewEndDate: useInterview && interviewEndDate ? interviewEndDate : null,
      showApplicantCount,
    });
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    try {
      await props.onSubmit({
        title: parsed.data.title,
        content: content,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        capacity: parsed.data.capacity,
        applicationMode: parsed.data.applicationMode,
        externalFormUrl: parsed.data.externalFormUrl ?? '',
        useInterview: parsed.data.useInterview,
        targetRole: parsed.data.targetRole,
        questionItems: parsed.data.questionItems ?? [],
        interviewStartDate: parsed.data.interviewStartDate ?? null,
        interviewEndDate: parsed.data.interviewEndDate ?? null,
        showApplicantCount: parsed.data.showApplicantCount ?? false,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {/* 제목 */}
      <label className="block">
        <span className={fieldLabelClass}>
          제목 <span className="text-rose-500">*</span>
        </span>
        <input
          type="text"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={fieldInputClass}
          placeholder="모집 공고 제목을 입력하세요"
        />
      </label>

      {/* 내용 */}
      <label className="block">
        <span className={fieldLabelClass}>내용</span>
        <textarea
          rows={5}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className={fieldInputClass}
          placeholder="모집 공고 내용을 입력하세요"
        />
      </label>

      {/* 모집 기간 */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={fieldLabelClass}>
              시작일 <span className="text-rose-500">*</span>
            </span>
            <input
              type="date"
              required
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className={fieldInputClass}
            />
          </label>
          <label className="block">
            <span className={fieldLabelClass}>
              종료일 {!isAlwaysOpen && <span className="text-rose-500">*</span>}
            </span>
            <input
              type="date"
              required={!isAlwaysOpen}
              disabled={isAlwaysOpen}
              value={isAlwaysOpen ? '' : endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className={cn(fieldInputClass, isAlwaysOpen && 'bg-slate-100 text-slate-400')}
            />
          </label>
        </div>
        {!isEditMode && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isAlwaysOpen}
              onChange={(event) => {
                setIsAlwaysOpen(event.target.checked);
                if (event.target.checked) {
                  setEndDate('');
                }
              }}
              className="h-4 w-4 rounded border-slate-300"
            />
            상시모집 (종료일 없음 — 직접 마감할 때까지 지원 접수)
          </label>
        )}
        {isEditMode && initialData?.endDate === null && (
          <p className="text-xs text-slate-500">
            이 모집은 상시모집입니다. 종료일은 변경할 수 없습니다.
          </p>
        )}
      </div>

      {/* 정원 */}
      <label className="block">
        <span className={fieldLabelClass}>
          모집 정원 <span className="text-rose-500">*</span>
        </span>
        <input
          type="number"
          required
          min={1}
          value={capacity}
          onChange={(event) => setCapacity(Number(event.target.value))}
          className={cn(fieldInputClass, 'w-32')}
        />
      </label>

      {/* 지원 방식 — create 전용 */}
      {!isEditMode && (
        <fieldset>
          <legend className={fieldLabelClass}>
            지원 방식 <span className="text-rose-500">*</span>
          </legend>
          <div className="mt-2 flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="applicationMode"
                value="SELF"
                checked={applicationMode === 'SELF'}
                onChange={() => setApplicationMode('SELF')}
              />
              자체 폼
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="applicationMode"
                value="EXTERNAL"
                checked={applicationMode === 'EXTERNAL'}
                onChange={() => setApplicationMode('EXTERNAL')}
              />
              외부 폼
            </label>
          </div>
        </fieldset>
      )}

      {/* 외부 폼 URL — create 전용 */}
      {!isEditMode && applicationMode === 'EXTERNAL' && (
        <label className="block">
          <span className={fieldLabelClass}>
            외부 폼 URL <span className="text-rose-500">*</span>
          </span>
          <input
            type="url"
            required
            value={externalFormUrl}
            onChange={(event) => setExternalFormUrl(event.target.value)}
            className={fieldInputClass}
            placeholder="https://forms.google.com/..."
          />
        </label>
      )}

      {/* 지원 방식 read-only — edit 전용 */}
      {isEditMode && (
        <div className="rounded-md bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-700">지원 방식 (변경 불가)</p>
          <p className="mt-1 text-sm text-slate-500">
            {initialData?.applicationMode === 'EXTERNAL' ? '외부 폼' : '자체 폼'}
            {initialData?.applicationMode === 'EXTERNAL' && initialData.externalFormUrl && (
              <> — {initialData.externalFormUrl}</>
            )}
          </p>
        </div>
      )}

      {/* 모집 대상 — create 전용 */}
      {!isEditMode && (
        <fieldset>
          <legend className={fieldLabelClass}>
            모집 대상 <span className="text-rose-500">*</span>
          </legend>
          <div className="mt-2 flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="targetRole"
                value="MEMBER"
                checked={targetRole === 'MEMBER'}
                onChange={() => setTargetRole('MEMBER')}
              />
              부원
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="targetRole"
                value="OFFICER"
                checked={targetRole === 'OFFICER'}
                onChange={() => setTargetRole('OFFICER')}
              />
              운영진
            </label>
          </div>
        </fieldset>
      )}

      {/* 모집 대상 read-only — edit 전용 */}
      {isEditMode && (
        <div className="rounded-md bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-700">모집 대상 (변경 불가)</p>
          <p className="mt-1 text-sm text-slate-500">
            {initialData?.targetRole === 'OFFICER' ? '운영진' : '부원'}
          </p>
        </div>
      )}

      {/* 면접 여부 */}
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={useInterview}
          onChange={(event) => setUseInterview(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        <span className="text-sm text-slate-700">면접 진행</span>
      </label>

      {useInterview && (
        <div className="grid grid-cols-1 gap-4 rounded-md bg-slate-50 p-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-sm text-slate-700">면접 시작일</span>
            <input
              type="date"
              value={interviewStartDate}
              onChange={(event) => setInterviewStartDate(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-sm text-slate-700">면접 종료일</span>
            <input
              type="date"
              value={interviewEndDate}
              onChange={(event) => setInterviewEndDate(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      )}

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={showApplicantCount}
          onChange={(event) => setShowApplicantCount(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        <span className="text-sm text-slate-700">현재 지원자 수를 학생에게 공개</span>
      </label>

      {/* 자체 폼 질문 빌더 — 구 BE 상세에서는 읽기 전용 안내로 대체한다 */}
      {isSelfForm && isLegacyQuestionsBackend && (
        <div>
          <p className={cn(fieldLabelClass, 'mb-3')}>
            지원 질문 <span className="font-normal text-slate-400">(수정 불가)</span>
          </p>
          <div className="rounded-md bg-slate-50 p-4">
            <p className="text-sm text-slate-600">
              서버 업데이트 이후에 질문을 수정할 수 있습니다. 다른 항목은 지금 저장할 수 있어요.
            </p>
            {initialData !== null && initialData.questions.length > 0 && (
              <ol className="mt-3 list-decimal space-y-1 pl-5">
                {initialData.questions.map((question, index) => (
                  <li key={index} className="text-sm text-slate-500">
                    {question}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      {isSelfForm && !isLegacyQuestionsBackend && (
        <div>
          <p className={cn(fieldLabelClass, 'mb-3')}>
            지원 질문 <span className="text-rose-500">*</span>
            <span className="ml-1 font-normal text-slate-400">(최소 1개)</span>
          </p>
          <QuestionBuilder
            questions={questionItems}
            onChange={setQuestionItems}
            nextKey={nextKey}
          />
        </div>
      )}

      {/* 오류 메시지 */}
      {(validationError ?? submitError) && (
        <p className="text-sm text-rose-600">{validationError ?? submitError}</p>
      )}

      {/* 제출 버튼 */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={props.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-6 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {props.isPending && <ButtonSpinner />}
          {isEditMode ? '수정 저장' : '모집 작성'}
        </button>
      </div>
    </form>
  );
}
