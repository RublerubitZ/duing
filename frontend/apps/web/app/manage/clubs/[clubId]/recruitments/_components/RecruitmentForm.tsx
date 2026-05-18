'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { RecruitmentDetail } from '@duing/types';
import { createRecruitmentSchema, updateRecruitmentSchema } from '@duing/schemas';
import { cn } from '../../../../../_lib/cn';
import { QuestionBuilder } from './QuestionBuilder';

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
  questions: string[];
};

export type EditFormValues = {
  title: string;
  content: string;
  startDate: string;
  endDate: string;
  capacity: number;
  useInterview: boolean;
  questions: string[];
};

type RecruitmentFormProps = CreateMode | EditMode;

const fieldLabelClass = 'block text-sm font-medium text-slate-700';
const fieldInputClass =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400';

export function RecruitmentForm(props: RecruitmentFormProps) {
  const isEditMode = props.mode === 'edit';
  const initialData = isEditMode ? props.initialValues : null;

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
  const [targetRole, setTargetRole] = useState<'MEMBER' | 'OFFICER'>(
    initialData?.targetRole ?? 'MEMBER',
  );
  const [questions, setQuestions] = useState<string[]>(
    initialData?.questions ?? [],
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setValidationError(null);
    setSubmitError(null);

    if (isEditMode) {
      const parsed = updateRecruitmentSchema.safeParse({
        title,
        content: content || undefined,
        startDate,
        endDate,
        capacity,
        useInterview,
        questions: applicationMode === 'SELF' ? questions : undefined,
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
          questions: parsed.data.questions ?? [],
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
      questions: applicationMode === 'SELF' ? questions : undefined,
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
        questions: parsed.data.questions ?? [],
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
        <div className="grid grid-cols-2 gap-4">
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

      {/* 자체 폼 질문 빌더 */}
      {(isEditMode ? initialData?.applicationMode === 'SELF' : applicationMode === 'SELF') && (
        <div>
          <p className={cn(fieldLabelClass, 'mb-3')}>
            지원 질문 <span className="text-rose-500">*</span>
            <span className="ml-1 font-normal text-slate-400">(최소 1개)</span>
          </p>
          <QuestionBuilder questions={questions} onChange={setQuestions} />
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
          className="rounded-md bg-slate-900 px-6 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {props.isPending ? '저장 중…' : isEditMode ? '수정 저장' : '모집 작성'}
        </button>
      </div>
    </form>
  );
}
