'use client';

import { useCallback, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { QuestionItemPayload, RecruitmentDetail } from '@duing/types';
import { createRecruitmentSchema, updateRecruitmentSchema } from '@duing/schemas';
import { cn } from '../../../../../_lib/cn';
import { QuestionBuilder, toBuilderQuestions, toQuestionItemsPayload } from './QuestionBuilder';
import type { BuilderQuestion } from './QuestionBuilder';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { SectionCard } from '@/app/manage/_components/SectionCard';
import { FormSegment, FormSwitch, SettingRow } from './form-controls';
import { RecruitmentPreview } from './RecruitmentPreview';
import type { RecruitmentPreviewData } from './RecruitmentPreview';
import { ExternalModeConfirmDialog } from './ExternalModeConfirmDialog';
import { MemberEnrollmentStepsCard } from './MemberEnrollmentStepsCard';
import { recruitmentStageLabels } from '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentFlowLabel';

/** Task 8 의 페이지 헤더 제출 버튼이 `form` 속성으로 이 폼을 원격 제출한다. */
export const RECRUITMENT_FORM_ID = 'recruitment-form';

type CreateMode = {
  mode: 'create';
  /**
   * 양식 복제 진입 시 초기값. 원본 모집 값을 재사용하되 기간 관련 필드(시작일·종료일·면접 일정·상시모집)는
   * 회차마다 달라지므로 의도적으로 시드하지 않는다 — 아래 useState 초기화 목록 참고.
   */
  cloneSeed?: RecruitmentDetail;
  // 페이지가 결정: 모집 시작 | 복제하여 모집 시작
  submitLabel: string;
  onSubmit: (values: CreateFormValues) => Promise<void>;
  isPending: boolean;
};

type EditMode = {
  mode: 'edit';
  initialValues: RecruitmentDetail;
  // 수정 저장
  submitLabel: string;
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
  // 상시모집(endDate null) 공고는 undefined — PATCH payload 에서 키가 생략돼 미변경으로 처리된다.
  endDate?: string;
  capacity: number;
  useInterview: boolean;
  // 구 BE 상세(questionItems 부재)에서는 아예 생략한다 — 아래 isLegacyQuestionsBackend 주석 참조.
  questionItems?: QuestionItemPayload[];
  interviewStartDate: string | null;
  interviewEndDate: string | null;
  showApplicantCount: boolean;
};

type RecruitmentFormProps = CreateMode | EditMode;

const fieldLabelClass = 'block text-[12.5px] font-bold text-charcoal-2';
const fieldInputClass =
  'mt-1 w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage';

export function RecruitmentForm(props: RecruitmentFormProps) {
  const isEditMode = props.mode === 'edit';
  const initialData = isEditMode ? props.initialValues : null;
  const cloneSeed = !isEditMode ? (props.cloneSeed ?? null) : null;
  // 기간 필드를 제외한 값들의 단일 시드 소스 — edit 모드면 상세, create+복제 모드면 원본 모집.
  const seed = initialData ?? cloneSeed;

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

  /**
   * 외부 폼 모집에는 안내문·질문·면접·지원자 수 공개가 존재할 수 없다(스펙 §2). 정책 이전에 만들어진
   * EXTERNAL 모집을 복제하면 이 값들이 그대로 딸려와 저장 시 400 이 되므로 시드 단계에서 떨어뜨린다.
   * (수정 모드는 시드가 곧 저장값이라 건드리지 않는다 — 화면에서 감추기만 하고 값은 왕복시킨다.)
   */
  const isExternalCloneSeed = cloneSeed?.applicationMode === 'EXTERNAL';

  const [title, setTitle] = useState(seed?.title ?? '');
  const [content, setContent] = useState(isExternalCloneSeed ? '' : (seed?.content ?? ''));
  const [startDate, setStartDate] = useState(initialData?.startDate ?? '');
  const [endDate, setEndDate] = useState(initialData?.endDate ?? '');
  const [isAlwaysOpen, setIsAlwaysOpen] = useState(
    isEditMode ? initialData?.endDate === null : false,
  );
  const [capacity, setCapacity] = useState(seed?.capacity ?? 1);
  const [applicationMode, setApplicationMode] = useState<'SELF' | 'EXTERNAL'>(
    seed?.applicationMode ?? 'SELF',
  );
  const [externalFormUrl, setExternalFormUrl] = useState(seed?.externalFormUrl ?? '');
  const [useInterview, setUseInterview] = useState(
    isExternalCloneSeed ? false : (seed?.useInterview ?? false),
  );
  const [interviewStartDate, setInterviewStartDate] = useState(initialData?.interviewStartDate ?? '');
  const [interviewEndDate, setInterviewEndDate] = useState(initialData?.interviewEndDate ?? '');
  const [showApplicantCount, setShowApplicantCount] = useState(
    isExternalCloneSeed ? false : (seed?.showApplicantCount ?? false),
  );
  const [targetRole, setTargetRole] = useState<'MEMBER' | 'OFFICER'>(seed?.targetRole ?? 'MEMBER');
  // 서버 id 와 무관한 React key 발급기 — jsdom 에 crypto.randomUUID 가 없어 카운터로 만든다.
  const keyCounter = useRef(0);
  const nextKey = useCallback(() => `bq-${(keyCounter.current += 1)}`, []);
  const [questionItems, setQuestionItems] = useState<BuilderQuestion[]>(() => {
    if (isEditMode) {
      return isLegacyQuestionsBackend
        ? []
        : toBuilderQuestions(initialData?.questionItems, initialData?.questions ?? [], nextKey);
    }
    if (cloneSeed) {
      return isExternalCloneSeed
        ? []
        : toBuilderQuestions(cloneSeed.questionItems, cloneSeed.questions, nextKey);
    }
    return [];
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isExternalConfirmOpen, setIsExternalConfirmOpen] = useState(false);

  const isSelfForm = isEditMode ? initialData?.applicationMode === 'SELF' : applicationMode === 'SELF';

  /** 외부 폼 전환은 되돌릴 수 없게 값을 비우므로 확인 다이얼로그를 먼저 띄운다 (스펙 §1.1). */
  function handleApplicationModeChange(nextMode: 'SELF' | 'EXTERNAL') {
    if (nextMode === applicationMode) return;
    if (nextMode === 'EXTERNAL') {
      setIsExternalConfirmOpen(true);
      return;
    }
    // 자체 폼 복귀는 잃을 값이 없어 바로 전환한다(전환 전 값은 복원하지 않는다).
    setApplicationMode('SELF');
  }

  /**
   * 확인 시점에 내부 전용 값을 즉시 정리한다 — 화면에서 감추기만 하면 안 보이는 값이 그대로 저장돼
   * 서버가 400 으로 되받는다(BE 검증은 방어선이지, 사용자에게 보여줄 UX 가 아니다).
   */
  function confirmExternalMode() {
    setApplicationMode('EXTERNAL');
    setContent('');
    setQuestionItems([]);
    setUseInterview(false);
    setInterviewStartDate('');
    setInterviewEndDate('');
    setShowApplicantCount(false);
    setIsExternalConfirmOpen(false);
  }

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
        // 상시모집이면 endDate 를 생략한다 — 빈 문자열('')을 넣으면 날짜 regex 에 걸려 저장이 막힌다.
        endDate: isAlwaysOpen ? undefined : endDate,
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
      // 붙여넣기로 딸려온 앞뒤 공백은 여기서 정리한다 — 화이트리스트 검증과 저장 값이 같아야 한다.
      externalFormUrl: externalFormUrl.trim() || undefined,
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

  const previewData: RecruitmentPreviewData = {
    title,
    startDate,
    endDate: isAlwaysOpen ? null : endDate || null,
    capacity,
    applicationMode: isEditMode ? (initialData?.applicationMode ?? 'SELF') : applicationMode,
    externalFormUrl: isEditMode ? (initialData?.externalFormUrl ?? '') : externalFormUrl,
    useInterview,
    targetRole: isEditMode ? (initialData?.targetRole ?? 'MEMBER') : targetRole,
    content,
    questions: isSelfForm ? questionItems : [],
  };
  const stageLabels = recruitmentStageLabels(useInterview);

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-6">
      <form id={RECRUITMENT_FORM_ID} className="min-w-0" onSubmit={handleSubmit}>
        {/* ① 기본 정보 */}
        <SectionCard number={1} title="기본 정보">
          <label className="block">
            <span className={fieldLabelClass}>
              제목 <span className="text-coral">*</span>
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

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={fieldLabelClass}>
                시작일 <span className="text-coral">*</span>
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
                종료일 {!isAlwaysOpen && <span className="text-coral">*</span>}
              </span>
              <input
                type="date"
                required={!isAlwaysOpen}
                disabled={isAlwaysOpen}
                value={isAlwaysOpen ? '' : endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className={cn(fieldInputClass, isAlwaysOpen && 'bg-graysoft text-charcoal-3')}
              />
            </label>
          </div>
          {!isEditMode && (
            <label className="mt-3 flex items-center gap-2 text-sm text-charcoal-2">
              <input
                type="checkbox"
                checked={isAlwaysOpen}
                onChange={(event) => {
                  setIsAlwaysOpen(event.target.checked);
                  if (event.target.checked) {
                    setEndDate('');
                  }
                }}
                className="h-4 w-4 rounded border-line"
              />
              상시모집 (종료일 없음 — 직접 마감할 때까지 지원 접수)
            </label>
          )}
          {isEditMode && initialData?.endDate === null && (
            <p className="mt-2 text-xs text-charcoal-3">
              이 모집은 상시모집입니다. 종료일은 변경할 수 없습니다.
            </p>
          )}

          <label className="mt-4 block">
            <span className={fieldLabelClass}>
              모집 정원 <span className="text-coral">*</span>
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
        </SectionCard>

        {/* ② 모집 설정 */}
        <SectionCard number={2} title="모집 설정">
          <SettingRow title="모집 대상" desc="이번 모집으로 뽑는 구성원">
            {isEditMode ? (
              <span className="text-sm font-bold text-charcoal-2">
                {initialData?.targetRole === 'OFFICER' ? '운영진' : '부원'}{' '}
                <span className="ml-1 text-xs font-medium text-charcoal-3">(변경 불가)</span>
              </span>
            ) : (
              <FormSegment
                options={[
                  { value: 'MEMBER', label: '부원' },
                  { value: 'OFFICER', label: '운영진' },
                ]}
                value={targetRole}
                onChange={setTargetRole}
                ariaLabel="모집 대상"
              />
            )}
          </SettingRow>

          <SettingRow title="지원 방식" desc="자체 폼으로 받을지, 외부 폼 링크를 안내할지">
            {isEditMode ? (
              <span className="text-sm font-bold text-charcoal-2">
                {initialData?.applicationMode === 'EXTERNAL' ? '외부 폼' : '자체 폼'}{' '}
                <span className="ml-1 text-xs font-medium text-charcoal-3">(변경 불가)</span>
              </span>
            ) : (
              <FormSegment
                options={[
                  { value: 'SELF', label: '자체 폼' },
                  { value: 'EXTERNAL', label: '외부 폼' },
                ]}
                value={applicationMode}
                onChange={handleApplicationModeChange}
                ariaLabel="지원 방식"
              />
            )}
          </SettingRow>

          {!isEditMode && applicationMode === 'EXTERNAL' && (
            <div className="mb-2.5 rounded-[13px] bg-sage-tint p-4">
              <label className="block">
                <span className={fieldLabelClass}>
                  외부 폼 URL <span className="text-coral">*</span>
                </span>
                <input
                  type="url"
                  required
                  value={externalFormUrl}
                  onChange={(event) => setExternalFormUrl(event.target.value)}
                  className={fieldInputClass}
                  placeholder="https://docs.google.com/forms/..."
                />
              </label>
              <p className="mt-2 text-xs leading-relaxed text-charcoal-3">
                구글 폼(forms.gle · docs.google.com/forms) 또는 네이버 폼(form.naver.com) 주소만 등록할 수
                있어요. 단축 URL 이 아닌 원본 주소를 붙여넣어 주세요.
              </p>
            </div>
          )}

          {isEditMode && initialData?.applicationMode === 'EXTERNAL' && (
            <div className="mb-2.5 rounded-[13px] border border-line bg-cream p-4">
              <div className="text-[12.5px] font-bold text-charcoal-2">외부 폼 URL</div>
              {initialData.externalFormUrl && (
                <div className="mt-1 break-all font-mono text-xs text-charcoal-3">
                  {initialData.externalFormUrl}
                </div>
              )}
              <p className="mt-2 text-xs leading-relaxed text-charcoal-3">
                URL은 변경할 수 없어요. 잘못 입력했다면 마감 후 새 모집을 만들어주세요.
              </p>
            </div>
          )}

          {/* 지원 흐름에 딸린 설정 — 외부 폼 모집에는 성립하지 않아 섹션째 렌더하지 않는다 (스펙 §1.2). */}
          {isSelfForm && (
            <>
            <SettingRow title="면접 진행" desc="서류 후 면접 전형을 둘지 여부">
              <FormSwitch checked={useInterview} onChange={setUseInterview} ariaLabel="면접 진행" />
            </SettingRow>
            {useInterview && (
              <div className="mb-2.5 grid grid-cols-1 gap-4 rounded-[13px] border border-line bg-cream p-4 sm:grid-cols-2">
                <label className="block">
                  <span className={fieldLabelClass}>면접 시작일</span>
                  <input
                    type="date"
                    value={interviewStartDate}
                    onChange={(event) => setInterviewStartDate(event.target.value)}
                    className={fieldInputClass}
                  />
                </label>
                <label className="block">
                  <span className={fieldLabelClass}>면접 종료일</span>
                  <input
                    type="date"
                    value={interviewEndDate}
                    onChange={(event) => setInterviewEndDate(event.target.value)}
                    className={fieldInputClass}
                  />
                </label>
              </div>
            )}
            {/* 전형 단계 파생 칩 — 편집 불가 표시 전용 */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-charcoal-3">전형 단계</span>
              {stageLabels.map((stage, index) => (
                <span
                  key={stage}
                  className="rounded-full bg-sage-tint px-3 py-1.5 text-xs font-semibold text-charcoal-2"
                >
                  {index + 1}. {stage}
                </span>
              ))}
            </div>

            <div className="mt-2.5">
              <SettingRow title="지원자 수 공개" desc="모집 페이지에 현재 지원자 수를 학생에게 보여줄지">
                <FormSwitch
                  checked={showApplicantCount}
                  onChange={setShowApplicantCount}
                  ariaLabel="지원자 수 공개"
                />
              </SettingRow>
            </div>
            </>
          )}
        </SectionCard>

        {/* ③ 회원 등록 절차 — 외부 폼 모집 전용 (스펙 §7) */}
        {!isSelfForm && (
          <SectionCard
            number={3}
            title="회원 등록 절차"
            description="외부 폼 모집은 지원서를 두잉에서 받지 않고, 합격자를 가입 코드로 등록해요."
          >
            <MemberEnrollmentStepsCard />
          </SectionCard>
        )}

        {/* ③ 안내문 */}
        {isSelfForm && (
          <SectionCard
            number={3}
            title="안내문"
            description="학생 지원 화면 상단에 노출돼요. Markdown(제목·리스트·강조·링크)을 쓸 수 있어요."
          >
            <textarea
              rows={8}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className={cn(fieldInputClass, 'resize-y')}
              placeholder="동아리 소개, 가입 후 일정, 회비 안내 등 지원 전에 알아야 할 내용을 적어주세요"
            />
          </SectionCard>
        )}

        {/* ④ 지원서 질문 */}
        {isSelfForm && (
          <SectionCard number={4} title="지원서 질문" description="자체 폼으로 받을 때 지원자가 작성할 항목이에요.">
            {isLegacyQuestionsBackend && (
              <div>
                <p className={cn(fieldLabelClass, 'mb-3')}>
                  지원 질문 <span className="font-normal text-charcoal-3">(수정 불가)</span>
                </p>
                <div className="rounded-md bg-graysoft p-4">
                  <p className="text-sm text-charcoal-2">
                    서버 업데이트 이후에 질문을 수정할 수 있습니다. 다른 항목은 지금 저장할 수 있어요.
                  </p>
                  {initialData !== null && initialData.questions.length > 0 && (
                    <ol className="mt-3 list-decimal space-y-1 pl-5">
                      {initialData.questions.map((question, index) => (
                        <li key={index} className="text-sm text-charcoal-3">
                          {question}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            )}

            {!isLegacyQuestionsBackend && (
              <div>
                <p className={cn(fieldLabelClass, 'mb-3')}>
                  지원 질문 <span className="text-coral">*</span>
                  <span className="ml-1 font-normal text-charcoal-3">(최소 1개)</span>
                </p>
                <QuestionBuilder questions={questionItems} onChange={setQuestionItems} nextKey={nextKey} />
              </div>
            )}
          </SectionCard>
        )}

        {/* 오류 + 하단 제출 */}
        <div className="mt-2 flex items-center justify-end gap-3">
          {(validationError ?? submitError) && (
            <p className="text-sm text-coral">{validationError ?? submitError}</p>
          )}
          <button type="submit" disabled={props.isPending} className="btn btn-primary disabled:opacity-50">
            {props.isPending && <ButtonSpinner />}
            {props.submitLabel}
          </button>
        </div>
      </form>

      {/* 우측 Sticky Preview — xl 미만 숨김 (#737 선례) */}
      <aside className="hidden xl:sticky xl:top-6 xl:block">
        <RecruitmentPreview data={previewData} />
      </aside>

      <ExternalModeConfirmDialog
        open={isExternalConfirmOpen}
        onCancel={() => setIsExternalConfirmOpen(false)}
        onConfirm={confirmExternalMode}
      />
    </div>
  );
}
