'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { RecruitmentCloseConfirmDialog } from './RecruitmentCloseConfirmDialog';
import { MemberEnrollmentStepsCard } from './MemberEnrollmentStepsCard';
import { FormErrorSummary } from './FormErrorSummary';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { recruitmentStageLabels } from '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentFlowLabel';
import {
  clearRecruitmentDraft,
  loadRecruitmentDraft,
  saveRecruitmentDraft,
} from '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentDraft';
import type { RecruitmentDraftValues } from '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentDraft';
import { useUnsavedChangesGuard } from '@/app/_lib/useUnsavedChangesGuard';

/** Task 8 의 페이지 헤더 제출 버튼이 `form` 속성으로 이 폼을 원격 제출한다. */
export const RECRUITMENT_FORM_ID = 'recruitment-form';

/**
 * zod issue 의 최상위 경로 → 해당 입력의 DOM id. 여기에 없는 경로는 폼 하단 일반 오류로 떨어진다.
 * 오류 요약 카드의 "누르면 그 필드로 이동" 도 이 id 로만 동작한다.
 */
const FIELD_IDS: Record<string, string> = {
  title: 'rf-title',
  startDate: 'rf-start',
  endDate: 'rf-end',
  capacity: 'rf-capacity',
  externalFormUrl: 'rf-external-url',
  questionItems: 'rf-questions',
  interviewStartDate: 'rf-interview-start',
  interviewEndDate: 'rf-interview-end',
};

/** 요약 카드에서 문구 앞에 붙일 필드 이름 — 화면의 입력 라벨과 같은 말을 쓴다. */
const FIELD_LABELS: Record<string, string> = {
  title: '제목',
  startDate: '시작일',
  endDate: '종료일',
  capacity: '모집 정원',
  externalFormUrl: '외부 폼 URL',
  questionItems: '지원 질문',
  interviewStartDate: '면접 시작일',
  interviewEndDate: '면접 종료일',
};

/**
 * 공개 확인 모달의 제목 — 시작일이 미래면 "지금부터" 가 거짓말이 되므로 실제 공개일을 말한다.
 * startDate 는 `<input type="date">` 가 만든 YYYY-MM-DD 라 조각내 읽는다(bookingDateLabel 과 같은 방식).
 * 오늘 판정은 폼의 종료일 min 과 같은 로컬 기준(en-CA = YYYY-MM-DD, toISOString 은 UTC 라 어긋난다).
 */
function publishConfirmTitle(startDate: string): string {
  if (startDate <= new Date().toLocaleDateString('en-CA')) return '지금부터 학생에게 공개돼요';
  const [, month, day] = startDate.split('-').map(Number);
  return `${month}월 ${day}일부터 학생에게 공개돼요`;
}

/** 임시저장 배너의 경과 시간 — 분 단위면 충분해 Intl.RelativeTimeFormat 까지 가지 않는다. */
function formatRelativeMinutes(savedAt: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - savedAt) / 60000));
  return minutes === 0 ? '방금' : `${minutes}분 전`;
}

/** 자동 저장 간격 — 타이핑마다 쓰지 않도록 입력이 멎은 뒤에만 한 번 쓴다. */
const DRAFT_SAVE_DEBOUNCE_MS = 1500;

/**
 * 임시저장된 질문을 빌더 형태로 되돌린다. localStorage 값은 사용자가 고칠 수 있고 저장 당시의 스키마일
 * 수도 있으므로 항목마다 타입을 확인하고, key 는 현재 카운터로 새로 발급한다(저장된 key 는 충돌할 수 있다).
 * 신규 작성이라 서버 id 는 언제나 null 이다.
 */
function toRestoredQuestions(items: unknown[], nextKey: () => string): BuilderQuestion[] {
  return items.flatMap((item) => {
    if (item === null || typeof item !== 'object') return [];
    const { text, type, required, choices } = item as Partial<BuilderQuestion>;
    if (typeof text !== 'string') return [];
    return [
      {
        key: nextKey(),
        id: null,
        text,
        type: type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE' ? type : 'TEXT',
        required: required !== false,
        choices: Array.isArray(choices)
          ? choices.flatMap((choice) =>
              choice !== null && typeof choice === 'object' && typeof choice.label === 'string'
                ? [{ key: nextKey(), id: null, label: choice.label }]
                : [],
            )
          : [],
      },
    ];
  });
}

type CreateMode = {
  mode: 'create';
  /**
   * 양식 복제 진입 시 초기값. 원본 모집 값을 재사용하되 기간 관련 필드(시작일·종료일·면접 일정·상시모집)는
   * 회차마다 달라지므로 의도적으로 시드하지 않는다 — 아래 useState 초기화 목록 참고.
   */
  cloneSeed?: RecruitmentDetail;
  // 페이지가 결정: 모집 시작 | 복제하여 모집 시작
  submitLabel: string;
  /**
   * 이번 등록으로 백엔드가 자동 마감할 기존 OPEN 모집의 제목(판정은 페이지 책임).
   * 값이 있으면 제출 직전에 확인 다이얼로그를 띄운다. undefined 는 "마감될 모집 없음" 과
   * "판정 불가(목록 미로딩·실패)" 를 함께 뜻하며, 둘 다 확인 없이 그대로 제출한다(fail-open).
   */
  closingRecruitmentTitle?: string;
  /**
   * 로컬 임시저장의 보관 단위(동아리 id). 값이 있을 때만 자동 저장·복원 배너가 동작한다.
   * 복제 진입은 이미 원본이 시드라 임시저장을 쓰지 않는다 — 페이지가 undefined 를 넘긴다.
   */
  draftClubId?: number;
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
  // props 는 유니온이라 클로저 안에서 mode 좁히기가 유지되지 않는다 — const 로 한 번 꺼내둔다.
  const createSubmit = props.mode === 'create' ? props.onSubmit : null;
  const closingRecruitmentTitle = props.mode === 'create' ? props.closingRecruitmentTitle : undefined;
  // 복제 시드가 있으면 임시저장을 쓰지 않는다 — 시드된 값이 곧 초안이라 배너가 오히려 방해가 된다.
  const draftClubId =
    props.mode === 'create' && props.cloneSeed === undefined ? props.draftClubId : undefined;
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
  // 필드 경로별 첫 오류 메시지(zod 문구 그대로) — 입력 아래·요약 카드가 같은 값을 읽는다.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // 특정 입력에 붙일 수 없는 오류(교차 검증 등)만 폼 하단에 남긴다.
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isExternalConfirmOpen, setIsExternalConfirmOpen] = useState(false);
  // 검증까지 끝났지만 "기존 모집 마감" 확인을 기다리는 create payload. null 이면 확인 대기 없음.
  const [pendingCreateValues, setPendingCreateValues] = useState<CreateFormValues | null>(null);
  // 공개 확인(마감할 기존 모집이 없을 때의 마지막 관문)을 기다리는 create payload.
  const [pendingPublishValues, setPendingPublishValues] = useState<CreateFormValues | null>(null);
  const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [draft, setDraft] = useState(() =>
    draftClubId === undefined ? null : loadRecruitmentDraft(draftClubId),
  );

  // 수정 모드 미저장 이탈 가드 — 저장 성공 시 페이지가 이동하므로 baseline 갱신은 필요 없다.
  const editSnapshot = JSON.stringify({
    title, content, startDate, endDate, capacity, useInterview,
    interviewStartDate, interviewEndDate, showApplicantCount, questionItems,
  });
  const [editBaseline] = useState(editSnapshot);
  const { leaveDialog } = useUnsavedChangesGuard(isEditMode && editSnapshot !== editBaseline);

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

  /**
   * zod issue 를 필드별 오류로 펼친다 — 한 필드에 여러 issue 가 있으면 첫 문구만 남긴다(문구는 스키마 것 그대로).
   * 붙일 입력이 없는 issue 는 폼 하단 일반 오류로, 그마저도 없으면 기존 폴백 문구로 떨어진다.
   */
  function applyIssues(issues: { path: PropertyKey[]; message: string }[]) {
    const next: Record<string, string> = {};
    let general: string | null = null;
    for (const issue of issues) {
      const field = String(issue.path[0] ?? '');
      if (field && FIELD_IDS[field]) {
        if (!next[field]) next[field] = issue.message;
      } else if (!general) {
        general = issue.message;
      }
    }
    setFieldErrors(next);
    setFormError(general ?? (Object.keys(next).length === 0 ? '입력값을 확인해주세요.' : null));
    // 첫 오류로 시선을 옮긴다 — 긴 폼에서 화면 밖 오류를 찾아 헤매지 않게.
    const first = Object.keys(next)[0];
    if (first) {
      const element = document.getElementById(FIELD_IDS[first]!);
      // jsdom 에는 scrollIntoView 가 없어 있을 때만 부른다(AdminClubJoinCodesTable 전례).
      element?.scrollIntoView?.({ block: 'center' });
      element?.focus();
    }
  }

  /**
   * 고친 필드의 오류는 그 자리에서 지운다 — 다음 제출까지 붉은 문구와 요약 카드 숫자가 남아 있으면
   * 이미 고친 곳을 다시 찾아 헤맨다. 남은 오류가 없으면 요약 카드 자체가 사라진다(FormErrorSummary).
   */
  function clearFieldError(field: string) {
    setFieldErrors((previous) => {
      if (previous[field] === undefined) return previous;
      const remaining = { ...previous };
      delete remaining[field];
      return remaining;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
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
        applyIssues(parsed.error.issues);
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
      applyIssues(parsed.error.issues);
      return;
    }
    const createValues: CreateFormValues = {
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
    };
    // 이 등록이 기존 모집을 마감시키면(페이지 판정) 되돌릴 수 없으므로 제출 전에 한 번 묻는다.
    if (closingRecruitmentTitle !== undefined) {
      setPendingCreateValues(createValues);
      return;
    }
    // 마감될 모집이 없을 때의 마지막 관문 — 등록은 곧 학생 공개라 한 번 더 확인한다.
    setPendingPublishValues(createValues);
    setIsPublishConfirmOpen(true);
  }

  /** create 제출 본체 — 확인 다이얼로그를 거치든 아니든 이 한 곳으로 모인다. */
  async function submitCreateValues(values: CreateFormValues) {
    if (createSubmit === null) return;
    try {
      await createSubmit(values);
      // 여기까지 왔으면 서버가 받았다 — 남은 임시저장은 다음 작성에 끼어들 뿐이라 지운다.
      if (draftClubId !== undefined) clearRecruitmentDraft(draftClubId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    }
  }

  /**
   * 임시저장 자동 저장 — 초기값 그대로면 쓰지 않는다(빈 폼을 열기만 해도 배너가 뜨는 일을 막는다).
   * 첫 실행이 곧 초기 스냅샷이고, 이후에는 그와 달라진 순간부터 debounce 뒤 한 번씩 쓴다.
   *
   * 배너가 떠 있어도 폼이 시드 그대로일 때만 보류한다 — 열어만 둔 화면이 저장본을 덮지 않게.
   * 배너를 무시하고 한 글자라도 치면 그 순간 배너를 접고(setDraft(null)) 자동 저장을 되살린다.
   * 계속 보류하면 배너를 무시한 채 10분을 쓴 내용이 하나도 저장되지 않아, 옛 저장본 하나를 지키려다
   * 지금 쓰는 내용을 통째로 잃는다(옛 저장본은 다음 자동 저장이 덮는다).
   *
   * 기준선은 배너 가드보다 **먼저** 잡는다. 배너를 띄운 채 먼저 return 하면 기준선이 비어 있다가
   * "이어서 쓰기" 직후의 복원값으로 잡히고, 그러면 한 글자 쳤다 지워 복원값으로 돌아오는 것만으로
   * 아래 clear 가 저장본을 지워버린다. 기준선이 마운트 시드여야 복원본이 그대로 재저장된다
   * ("새로 쓰기" 는 값이 시드와 같아 clear 로 떨어지는데, 이미 지운 뒤라 no-op 다).
   */
  const initialDraftSnapshot = useRef<string | null>(null);
  // 되돌림 clear 는 이 세션이 저장했거나 "이어서 쓰기" 로 넘겨받은 저장본에만 적용한다. 배너를 무시하고
  // 한 글자 쳤다가 debounce 전에 지우면 쓴 것도 없이 옛 저장본만 사라져(배너까지 접힌 뒤라) 되살릴 길이 없다.
  const hasSavedDraftRef = useRef(false);
  useEffect(() => {
    if (draftClubId === undefined) return;
    const values: RecruitmentDraftValues = {
      title,
      content,
      startDate,
      endDate,
      isAlwaysOpen,
      capacity,
      applicationMode,
      externalFormUrl,
      useInterview,
      interviewStartDate,
      interviewEndDate,
      showApplicantCount,
      targetRole,
      questionItems,
    };
    const snapshot = JSON.stringify(values);
    if (initialDraftSnapshot.current === null) {
      initialDraftSnapshot.current = snapshot;
      return;
    }
    if (draft !== null) {
      // 시드 그대로면 아직 배너에 손대지 않은 상태 — 보류. 첫 편집이 곧 "옛 저장본은 됐다" 는 선택이다.
      if (snapshot === initialDraftSnapshot.current) return;
      setDraft(null);
      return;
    }
    // 편집을 되돌려 초기값으로 돌아왔으면 남은 저장본도 지운다 — 쓸 내용이 없는데 배너만 뜨는 일을 막는다.
    if (snapshot === initialDraftSnapshot.current) {
      if (hasSavedDraftRef.current) clearRecruitmentDraft(draftClubId);
      return;
    }
    const timer = setTimeout(() => {
      saveRecruitmentDraft(draftClubId, values);
      hasSavedDraftRef.current = true;
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    draftClubId,
    draft,
    title,
    content,
    startDate,
    endDate,
    isAlwaysOpen,
    capacity,
    applicationMode,
    externalFormUrl,
    useInterview,
    interviewStartDate,
    interviewEndDate,
    showApplicantCount,
    targetRole,
    questionItems,
  ]);

  /** 임시저장 값 복원 — localStorage 는 사용자가 고칠 수 있으니 타입이 맞는 값만 되돌린다. */
  function restoreDraft(values: RecruitmentDraftValues) {
    if (typeof values.title === 'string') setTitle(values.title);
    if (typeof values.content === 'string') setContent(values.content);
    if (typeof values.startDate === 'string') setStartDate(values.startDate);
    if (typeof values.endDate === 'string') setEndDate(values.endDate);
    if (typeof values.isAlwaysOpen === 'boolean') setIsAlwaysOpen(values.isAlwaysOpen);
    if (typeof values.capacity === 'number' && Number.isFinite(values.capacity)) {
      setCapacity(values.capacity);
    }
    if (values.applicationMode === 'SELF' || values.applicationMode === 'EXTERNAL') {
      setApplicationMode(values.applicationMode);
    }
    if (typeof values.externalFormUrl === 'string') setExternalFormUrl(values.externalFormUrl);
    if (typeof values.useInterview === 'boolean') setUseInterview(values.useInterview);
    if (typeof values.interviewStartDate === 'string') {
      setInterviewStartDate(values.interviewStartDate);
    }
    if (typeof values.interviewEndDate === 'string') setInterviewEndDate(values.interviewEndDate);
    if (typeof values.showApplicantCount === 'boolean') {
      setShowApplicantCount(values.showApplicantCount);
    }
    if (values.targetRole === 'MEMBER' || values.targetRole === 'OFFICER') {
      setTargetRole(values.targetRole);
    }
    if (Array.isArray(values.questionItems)) {
      setQuestionItems(toRestoredQuestions(values.questionItems, nextKey));
    }
  }

  async function confirmCloseAndCreate() {
    if (pendingCreateValues === null) return;
    await submitCreateValues(pendingCreateValues);
    // 성공하면 페이지가 이동하고, 실패하면 폼의 에러 배너를 가리지 않도록 닫는다.
    setPendingCreateValues(null);
  }

  const previewData: RecruitmentPreviewData = {
    title,
    startDate,
    // 상시모집 여부는 따로 넘긴다 — "종료일 미입력" 과 "종료일 없는 모집" 은 다른 상태다.
    isAlwaysOpen,
    endDate: endDate || null,
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
      {/* noValidate — 검증은 zod 한 곳에서만 판정하고, 브라우저 기본 말풍선이 요약 카드와 겹치지 않게 한다. */}
      <form id={RECRUITMENT_FORM_ID} noValidate className="min-w-0" onSubmit={handleSubmit}>
        {draft !== null && draftClubId !== undefined && (
          <div
            role="status"
            className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[13px] border border-line bg-sage-tint px-4 py-3 text-sm text-charcoal-2"
          >
            <span>작성 중이던 내용이 있어요 · {formatRelativeMinutes(draft.savedAt)}</span>
            <span className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  restoreDraft(draft.values);
                  // 복원한 순간부터 이 저장본은 이 세션의 것 — 되돌리면 지워도 된다.
                  hasSavedDraftRef.current = true;
                  setDraft(null);
                }}
              >
                이어서 쓰기
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  clearRecruitmentDraft(draftClubId);
                  setDraft(null);
                }}
              >
                새로 쓰기
              </button>
            </span>
          </div>
        )}

        <FormErrorSummary
          errors={Object.entries(fieldErrors).map(([field, message]) => ({
            fieldId: FIELD_IDS[field]!,
            label: FIELD_LABELS[field]!,
            message,
          }))}
        />

        {/* 우측 프리뷰는 xl 이상에서만 붙는다 — 그 아래 폭에서는 시트로 같은 화면을 연다. */}
        <div className="mb-3 flex justify-end xl:hidden">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsPreviewOpen(true)}>
            미리보기
          </button>
        </div>

        {/* ① 기본 정보 */}
        <SectionCard number={1} title="기본 정보">
          <label className="block">
            <span className={fieldLabelClass}>
              제목 <span className="text-coral">*</span>
            </span>
            <input
              id={FIELD_IDS.title}
              type="text"
              required
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                clearFieldError('title');
              }}
              className={fieldInputClass}
              placeholder="모집 공고 제목을 입력하세요"
              aria-invalid={fieldErrors.title ? true : undefined}
              aria-describedby={fieldErrors.title ? 'rf-title-error' : undefined}
            />
          </label>
          {fieldErrors.title && (
            <p id="rf-title-error" className="mt-1 text-xs text-danger">
              {fieldErrors.title}
            </p>
          )}

          {/* 오류 문구는 label 밖에 둔다 — 안에 두면 입력의 접근명에 오류가 섞여 두 번 읽힌다. */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block">
                <span className={fieldLabelClass}>
                  시작일 <span className="text-coral">*</span>
                </span>
                <input
                  id={FIELD_IDS.startDate}
                  type="date"
                  required
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    clearFieldError('startDate');
                  }}
                  className={fieldInputClass}
                  aria-invalid={fieldErrors.startDate ? true : undefined}
                  aria-describedby={fieldErrors.startDate ? 'rf-start-error' : undefined}
                />
              </label>
              {fieldErrors.startDate && (
                <p id="rf-start-error" className="mt-1 text-xs text-danger">
                  {fieldErrors.startDate}
                </p>
              )}
            </div>
            <div>
              <label className="block">
                <span className={fieldLabelClass}>
                  종료일 {!isAlwaysOpen && <span className="text-coral">*</span>}
                </span>
                <input
                  id={FIELD_IDS.endDate}
                  type="date"
                  required={!isAlwaysOpen}
                  disabled={isAlwaysOpen}
                  // 생성 시 과거 종료일 차단(zod·BE 와 동일 규칙) — 수정은 기존 과거 종료일 유지가 정당해 제한하지 않는다.
                  // en-CA 로케일은 사용자 로컬 기준 YYYY-MM-DD (toISOString 은 UTC 라 자정~09시 KST 에 하루 어긋남).
                  min={isEditMode ? undefined : new Date().toLocaleDateString('en-CA')}
                  value={isAlwaysOpen ? '' : endDate}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    clearFieldError('endDate');
                  }}
                  className={cn(fieldInputClass, isAlwaysOpen && 'bg-graysoft text-charcoal-3')}
                  aria-invalid={fieldErrors.endDate ? true : undefined}
                  aria-describedby={fieldErrors.endDate ? 'rf-end-error' : undefined}
                />
              </label>
              {fieldErrors.endDate && (
                <p id="rf-end-error" className="mt-1 text-xs text-danger">
                  {fieldErrors.endDate}
                </p>
              )}
            </div>
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
                    // 상시모집으로 바꾸면 종료일 오류는 성립하지 않는다.
                    clearFieldError('endDate');
                  }
                }}
                className="h-4 w-4 rounded border-line"
              />
              상시모집 (종료일 없음 — 직접 마감할 때까지 지원 접수)
            </label>
          )}
          {/* 접수 마감(#888)은 종료일을 어제로 확정하는 방식이라 시작일 당일에는 쓸 수 없다 — 생성 시점에 미리 알린다. */}
          {!isEditMode && isAlwaysOpen && (
            <p className="mt-2 text-xs text-charcoal-3">
              접수 마감(신규 지원만 중단)은 모집 시작일 다음 날부터 할 수 있습니다. 당일에 바로
              끝내야 한다면 모집 종료를 이용해주세요.
            </p>
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
              id={FIELD_IDS.capacity}
              type="number"
              required
              min={1}
              value={capacity}
              onChange={(event) => {
                setCapacity(Number(event.target.value));
                clearFieldError('capacity');
              }}
              className={cn(fieldInputClass, 'w-32')}
              aria-invalid={fieldErrors.capacity ? true : undefined}
              aria-describedby={fieldErrors.capacity ? 'rf-capacity-error' : undefined}
            />
          </label>
          {fieldErrors.capacity && (
            <p id="rf-capacity-error" className="mt-1 text-xs text-danger">
              {fieldErrors.capacity}
            </p>
          )}
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
                  id={FIELD_IDS.externalFormUrl}
                  type="url"
                  required
                  value={externalFormUrl}
                  onChange={(event) => {
                    setExternalFormUrl(event.target.value);
                    clearFieldError('externalFormUrl');
                  }}
                  className={fieldInputClass}
                  placeholder="https://docs.google.com/forms/..."
                  aria-invalid={fieldErrors.externalFormUrl ? true : undefined}
                  aria-describedby={fieldErrors.externalFormUrl ? 'rf-external-url-error' : undefined}
                />
              </label>
              {fieldErrors.externalFormUrl && (
                <p id="rf-external-url-error" className="mt-1 text-xs text-danger">
                  {fieldErrors.externalFormUrl}
                </p>
              )}
              <p className="mt-2 text-xs leading-relaxed text-charcoal-3">
                구글 폼(forms.gle · docs.google.com/forms) 또는 네이버 폼(form.naver.com · naver.me)
                주소만 등록할 수 있어요.
              </p>
            </div>
          )}

          {isEditMode && initialData?.applicationMode === 'EXTERNAL' && (
            <div className="mb-2.5 rounded-[13px] border border-line bg-cream p-4">
              <div className="text-[12.5px] font-bold text-charcoal-2">외부 폼 URL</div>
              {initialData.externalFormUrl && (
                <div className="mt-1 break-all tabular-nums text-xs text-charcoal-3">
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
                <div>
                  <label className="block">
                    <span className={fieldLabelClass}>면접 시작일</span>
                    <input
                      id={FIELD_IDS.interviewStartDate}
                      type="date"
                      value={interviewStartDate}
                      onChange={(event) => {
                        setInterviewStartDate(event.target.value);
                        clearFieldError('interviewStartDate');
                      }}
                      className={fieldInputClass}
                      aria-invalid={fieldErrors.interviewStartDate ? true : undefined}
                      aria-describedby={
                        fieldErrors.interviewStartDate ? 'rf-interview-start-error' : undefined
                      }
                    />
                  </label>
                  {fieldErrors.interviewStartDate && (
                    <p id="rf-interview-start-error" className="mt-1 text-xs text-danger">
                      {fieldErrors.interviewStartDate}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block">
                    <span className={fieldLabelClass}>면접 종료일</span>
                    <input
                      id={FIELD_IDS.interviewEndDate}
                      type="date"
                      value={interviewEndDate}
                      onChange={(event) => {
                        setInterviewEndDate(event.target.value);
                        clearFieldError('interviewEndDate');
                      }}
                      className={fieldInputClass}
                      aria-invalid={fieldErrors.interviewEndDate ? true : undefined}
                      aria-describedby={
                        fieldErrors.interviewEndDate ? 'rf-interview-end-error' : undefined
                      }
                    />
                  </label>
                  {fieldErrors.interviewEndDate && (
                    <p id="rf-interview-end-error" className="mt-1 text-xs text-danger">
                      {fieldErrors.interviewEndDate}
                    </p>
                  )}
                </div>
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
            description="외부 폼 모집은 지원서를 두잉에서 받지 않고, 합격자를 가입 링크로 등록해요."
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
              // 질문 오류는 개별 입력이 아니라 빌더 전체에 걸리므로 래퍼를 포커스·설명 대상으로 삼는다.
              <div
                id={FIELD_IDS.questionItems}
                tabIndex={-1}
                aria-describedby={fieldErrors.questionItems ? 'rf-questions-error' : undefined}
              >
                <p className={cn(fieldLabelClass, 'mb-1')}>
                  지원 질문 <span className="text-coral">*</span>
                  <span className="ml-1 font-normal text-charcoal-3">(최소 1개)</span>
                </p>
                {/* 수집 최소화 안내 — 학번·연락처는 지원자 프로필로 운영진에게 이미 보인다. 입력을 막는 장치가 아니라 보관기간 파기와 짝을 이루는 예방책이다. */}
                <p className="mb-3 text-xs text-charcoal-3">
                  학번·전화번호 등 개인정보는 지원자 프로필에서 확인할 수 있으니 질문으로 요청하지 않는 것을
                  권장합니다.
                </p>
                <QuestionBuilder
                  questions={questionItems}
                  onChange={(next) => {
                    setQuestionItems(next);
                    // 질문 오류는 목록 전체에 걸린 하나뿐이라 어느 질문을 고쳐도 같이 지운다.
                    clearFieldError('questionItems');
                  }}
                  nextKey={nextKey}
                />
                {fieldErrors.questionItems && (
                  <p id="rf-questions-error" className="mt-2 text-xs text-danger">
                    {fieldErrors.questionItems}
                  </p>
                )}
              </div>
            )}
          </SectionCard>
        )}

        {/* 오류 + 하단 제출 */}
        <div className="mt-2 flex items-center justify-end gap-3">
          {(formError ?? submitError) && (
            <p className="text-sm text-danger">{formError ?? submitError}</p>
          )}
          <button type="submit" disabled={props.isPending} className="btn btn-primary disabled:opacity-50">
            {props.isPending && <ButtonSpinner />}
            {props.submitLabel}
          </button>
        </div>

        <ConfirmDialog
          open={isPublishConfirmOpen}
          title={publishConfirmTitle(startDate)}
          description="공개 후에도 안내문·기간은 수정할 수 있어요. 지원 질문은 수정할 수 없어요."
          confirmLabel="공개"
          confirmVariant="primary"
          isPending={props.isPending}
          onCancel={() => {
            setIsPublishConfirmOpen(false);
            setPendingPublishValues(null);
          }}
          onConfirm={() => {
            if (pendingPublishValues === null) return;
            void submitCreateValues(pendingPublishValues).finally(() => {
              setIsPublishConfirmOpen(false);
              setPendingPublishValues(null);
            });
          }}
        />

        {/* xl 미만에서 우측 고정 프리뷰 대신 여는 같은 화면 */}
        <Sheet open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
          {/* pt-12 — 우상단 닫기 버튼 자리를 비운다(그 아래부터 미리보기가 시작한다). */}
          <SheetContent side="right" className="w-[92vw] max-w-[420px] overflow-y-auto p-4 pt-12">
            <SheetTitle className="sr-only">지원자에게 보이는 화면</SheetTitle>
            {/* Radix Dialog 는 설명이 없으면 콘솔 경고를 낸다 — 화면에는 미리보기 카드만 보이면 되므로 sr-only. */}
            <SheetDescription className="sr-only">
              작성 중인 모집을 지원자 시점으로 미리 봅니다.
            </SheetDescription>
            <RecruitmentPreview data={previewData} />
          </SheetContent>
        </Sheet>
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

      {pendingCreateValues !== null && closingRecruitmentTitle !== undefined && (
        <RecruitmentCloseConfirmDialog
          recruitmentTitle={closingRecruitmentTitle}
          isPending={props.isPending}
          onConfirm={() => {
            void confirmCloseAndCreate();
          }}
          onCancel={() => setPendingCreateValues(null)}
        />
      )}

      {leaveDialog}
    </div>
  );
}
