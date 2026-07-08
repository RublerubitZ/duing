# PR-4: 지원서 질문 유형 UI (FE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 리더가 질문 유형(주관식/단일/복수)·필수 여부·선택지를 편집하고, 지원자가 유형별 컨트롤(textarea/radio/checkbox)로 답변하며, 제출·임시저장이 신형 페이로드(`questionItems`/`answerItems`/uuid draft)로 통신하게 한다.

**Architecture:** 스펙 §2.8. 레이어 순서 types → schemas → (client 는 타입 전파만) → UI. 신 FE 는 항상 신형 필드로 통신하고, `questionItems` 부재(구 BE 시차)에만 `questions` fallback. 객관식 UI 는 shadcn 미설치 유지 — 리더 폼의 기존 native radio/checkbox + Tailwind 패턴. 지원 폼 검증은 JS 통합(체크박스 그룹은 HTML required 불가) — 질문별 인라인 에러 + `aria-invalid`/`aria-describedby` + 첫 위반 포커스.

**Tech Stack:** Next.js 15 / React 19 / TanStack Query / Zod / vitest + testing-library + MSW

**전제:** PR-3 머지 후 분기. PR-2 의 eligibility 가드와는 독립(같은 파일 page.tsx 를 건드리므로 PR-2 머지 후가 안전).

**사전 확인된 사실 (정찰):**
- `frontend/CLAUDE.md`: `any`·`as` 금지, `type` 만 사용, 서버 상태는 TanStack Query, packages 에 DOM API 금지
- `QuestionBuilder.tsx` 는 `string[]` + 추가/삭제/▲▼ 이동(95줄, slate 팔레트) — 전면 재작성 대상
- `RecruitmentForm.tsx` (440줄): 모든 필드 useState + Zod safeParse, `CreateFormValues`/`EditFormValues` 에 `questions: string[]`, 빌더는 SELF 일 때만 노출, radio 패턴은 `applicationMode` fieldset (L268-295) 참조
- 생성/수정 페이지(`new/page.tsx`, `[recruitmentId]/edit/page.tsx`)가 FormValues → payload 변환 — Read 후 `questionItems` 로 재배선
- `ApplyAnswersStep.tsx`: native textarea + `required` 속성(브라우저 검증) — JS 통합 검증으로 전환하며 `required` 속성 제거, `aria-required` 로 대체
- `page.tsx` 시드: `recruitment.questions.map((_, idx) => ({questionId: idx, value: ...}))` — uuid 기반으로 교체
- `useAutosaveDraft.ts` 는 answers 배열을 그대로 PUT — 타입만 변경되면 로직 불변
- 타입 파일: `types/recruitment.ts`(questions: string[], payload 들), `types/draft.ts`(DraftAnswer{questionId: number, value}), `types/application.ts`(SubmitApplicationPayload{answers: string[]})
- Zod: `packages/schemas/src/index.ts` L83-187 (create/update 스키마, SELF questions ≥1 refine)
- 테스트: `test/apply/apply-page.test.tsx`(MSW, 제출 payload 단언 존재), `test/manage/recruitment-form*.test.tsx` — MSW 픽스처의 recruitment detail 에 `questionItems` 추가 필요
- jsdom 에서 `crypto.randomUUID` 의존 금지 — 로컬 key 는 useRef 카운터 사용

**리뷰 파이프라인 (task 마다):** implementer → spec reviewer → duing-code-reviewer → codex:review. API contract(신형 페이로드) 변경이므로 마지막에 브랜치 adversarial 리뷰 1회.

**Out of Scope:** 선택지 드래그 정렬, 기타(직접입력), 내 지원서/운영진 열람 화면 변경(표시 문자열 그대로), shadcn 신규 설치, gen:api 재생성.

---

## Task 0: 브랜치 생성

- [ ] `git checkout develop && git pull && git checkout -b feat/apply-question-types-ui`

---

## Task 1: 타입 + Zod 스키마 (additive — 기존 코드 green 유지)

**Files:**
- Modify: `frontend/packages/types/src/recruitment.ts`
- Modify: `frontend/packages/schemas/src/index.ts`
- Modify: `frontend/packages/types/src/index.ts` (re-export 확인)

- [ ] **Step 1: 타입 추가** — `recruitment.ts` (기존 필드는 건드리지 않고 추가만):

```ts
export type QuestionType = 'TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';

export type RecruitmentQuestionChoice = {
  id: string;
  label: string;
};

export type RecruitmentQuestionItem = {
  id: string;
  text: string;
  type: QuestionType;
  required: boolean;
  choices: RecruitmentQuestionChoice[];
};

/** 생성·수정 페이로드용 — id 는 수정 시 왕복(신규 항목은 null), 서버가 발급·보존한다. */
export type QuestionChoicePayload = {
  id?: string | null;
  label: string;
};

export type QuestionItemPayload = {
  id?: string | null;
  text: string;
  type: QuestionType;
  required: boolean;
  choices: QuestionChoicePayload[];
};
```

`RecruitmentDetail` 에 추가: `questionItems?: RecruitmentQuestionItem[];` (optional — 구 BE 응답 fallback, `// TODO(legacy-questions-v1): 구 BE 소멸 후 required 로 승격`). `CreateRecruitmentPayload`/`UpdateRecruitmentPayload` 에 `questionItems?: QuestionItemPayload[];` 추가 (기존 `questions?: string[]` 는 `// TODO(legacy-questions-v1): 신 FE 는 사용하지 않음 — 제거 예정` 마커만).

- [ ] **Step 2: Zod 스키마** — `schemas/src/index.ts` 의 두 모집 스키마에 questionItems 추가:

```ts
const questionChoiceItemSchema = z.object({
  id: z.string().nullable().optional(),
  label: z
    .string()
    .trim()
    .min(1, '선택지를 입력해주세요.')
    .max(200, '선택지는 200자 이하여야 합니다.'),
});

export const questionItemSchema = z
  .object({
    id: z.string().nullable().optional(),
    text: z
      .string()
      .trim()
      .min(1, '질문 내용을 입력해주세요.')
      .max(500, '질문은 500자 이하여야 합니다.'),
    type: z.enum(['TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE']),
    required: z.boolean(),
    choices: z
      .array(questionChoiceItemSchema)
      .max(20, '선택지는 질문당 최대 20개까지 등록할 수 있습니다.'),
  })
  .superRefine((item, ctx) => {
    if (item.type === 'TEXT') {
      if (item.choices.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '주관식 질문에는 선택지를 둘 수 없습니다.',
          path: ['choices'],
        });
      }
      return;
    }
    if (item.choices.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '선택형 질문은 선택지를 2개 이상 등록해야 합니다.',
        path: ['choices'],
      });
    }
    const labels = item.choices.map((choice) => choice.label.trim());
    if (new Set(labels).size !== labels.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '같은 질문 안에서 선택지 내용이 중복될 수 없습니다.',
        path: ['choices'],
      });
    }
  });
```

`createRecruitmentSchema`: `questions` 항목을 `questionItems: z.array(questionItemSchema).max(50, '질문은 최대 50개까지 등록할 수 있습니다.').optional()` 로 **교체**하고 SELF refine 을 questionItems 기준으로 변경(`'자체 폼 모집은 질문을 최소 1개 이상 등록해야 합니다.'` 메시지 유지). `updateRecruitmentSchema` 의 `questions` 도 동일 교체. Zod v3/v4 문법은 파일 상단 import 로 확인해 맞춘다(`z.ZodIssueCode.custom` 미존재 시 v4 스타일 `ctx.addIssue({ code: 'custom', ... })`).

주의: 스키마의 questions 교체는 `RecruitmentForm.tsx` 컴파일을 깨뜨릴 수 있다 — **Task 2 에서 함께 고치므로, 이 태스크에서는 `pnpm typecheck` 로 깨지는 파일 목록만 수집**하고, 깨짐이 RecruitmentForm 계열뿐인지 확인한다(그 외가 깨지면 보고). 깨짐 범위가 그 외로 넓으면 Task 1 커밋을 Task 2 와 합친다.

- [ ] **Step 3: 커밋** — typecheck 가 green 이면 단독 커밋 `feat(web): 질문 유형 타입·스키마 추가`, 깨지면 Task 2 에 합류.

---

## Task 2: 리더 질문 빌더 (QuestionBuilder + RecruitmentForm + 페이지 배선)

**Files:**
- Rewrite: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/_components/QuestionBuilder.tsx`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm.tsx`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/new/page.tsx`, `.../[recruitmentId]/edit/page.tsx` (Read 후 payload 배선)
- Test: `frontend/apps/web/test/manage/recruitment-form.test.tsx` (확장 — 기존 케이스 어댑트)

- [ ] **Step 1: 실패하는 테스트 작성** — 기존 recruitment-form 테스트를 Read 해 렌더/제출 스파이 패턴 확인 후:

```tsx
// 1. "질문 유형을 객관식(단일)로 바꾸면 선택지 입력이 나타나고 payload 에 choices 가 실린다"
//    → 질문 추가 → 유형 라디오 '객관식(단일 선택)' 클릭 → 선택지 2개 입력 → 제출 →
//      onSubmit 스파이의 questionItems[0] 이 { text, type: 'SINGLE_CHOICE', required: true,
//      choices: [{ id: null, label: '1학년' }, { id: null, label: '2학년' }] } 형태 단언
// 2. "필수 체크박스는 기본 선택이고 해제하면 required=false 로 제출된다"
// 3. "선택지가 1개인 객관식은 검증 메시지로 제출이 막힌다" ('선택형 질문은 선택지를 2개 이상…')
// 4. "edit 모드는 questionItems 의 id 를 보존해 제출한다"
//    → initialValues.questionItems 에 id 있는 질문 → 텍스트만 수정 → 제출 → id 그대로 단언
// 5. (회귀) 기존 상시모집/면접 케이스 — questions 관련 단언만 questionItems 로 어댑트
```

- [ ] **Step 2: 실패 확인** — `cd frontend && pnpm test -- manage` → FAIL.

- [ ] **Step 3: QuestionBuilder 전면 재작성** — 기존 slate 팔레트·행 구조(번호·▲▼·✕)를 유지하면서 카드형으로 확장:

```tsx
'use client';

import { useRef } from 'react';
import type { QuestionItemPayload, QuestionType, RecruitmentQuestionItem } from '@duing/types';

export type BuilderChoice = { key: string; id: string | null; label: string };
export type BuilderQuestion = {
  key: string;
  id: string | null;
  text: string;
  type: QuestionType;
  required: boolean;
  choices: BuilderChoice[];
};

const QUESTION_TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
  { value: 'TEXT', label: '주관식' },
  { value: 'SINGLE_CHOICE', label: '객관식(단일 선택)' },
  { value: 'MULTIPLE_CHOICE', label: '객관식(복수 선택)' },
];

/** 상세 응답 → 빌더 상태. questionItems 부재(구 BE 시차) 시 questions 텍스트로 fallback. */
export function toBuilderQuestions(
  items: RecruitmentQuestionItem[] | undefined,
  legacyTexts: string[],
  nextKey: () => string,
): BuilderQuestion[] {
  if (items && items.length > 0) {
    return items.map((item) => ({
      key: nextKey(),
      id: item.id,
      text: item.text,
      type: item.type,
      required: item.required,
      choices: item.choices.map((choice) => ({ key: nextKey(), id: choice.id, label: choice.label })),
    }));
  }
  return legacyTexts.map((text) => ({
    key: nextKey(), id: null, text, type: 'TEXT', required: true, choices: [],
  }));
}

/** 빌더 상태 → 제출 페이로드. TEXT 는 남아 있던 선택지 초안을 버린다(실수 복구 여지는 상태에만 유지). */
export function toQuestionItemsPayload(questions: BuilderQuestion[]): QuestionItemPayload[] {
  return questions.map((question) => ({
    id: question.id,
    text: question.text,
    type: question.type,
    required: question.required,
    choices:
      question.type === 'TEXT'
        ? []
        : question.choices.map((choice) => ({ id: choice.id, label: choice.label })),
  }));
}

type QuestionBuilderProps = {
  questions: BuilderQuestion[];
  onChange: (questions: BuilderQuestion[]) => void;
  nextKey: () => string;
};

export function QuestionBuilder({ questions, onChange, nextKey }: QuestionBuilderProps) {
  function updateQuestion(targetKey: string, patch: Partial<Omit<BuilderQuestion, 'key' | 'id'>>) {
    onChange(questions.map((question) =>
      question.key === targetKey ? { ...question, ...patch } : question));
  }
  // handleAdd: [...questions, { key: nextKey(), id: null, text: '', type: 'TEXT', required: true, choices: [] }]
  // handleRemove/handleMoveUp/handleMoveDown: 기존 구현과 동일한 인덱스 스왑을 key 기반으로 유지
  // handleAddChoice(questionKey): choices 에 { key: nextKey(), id: null, label: '' } 추가
  // handleRemoveChoice(questionKey, choiceKey) / handleChoiceLabel(questionKey, choiceKey, label)
  // 렌더:
  //  - 카드(border rounded-md p-4 space-y-3)마다: 번호 + 텍스트 input(기존 클래스) + ▲▼✕(기존 버튼)
  //  - 유형: <fieldset> 가로 라디오 3개, name={`question-type-${question.key}`} —
  //    RecruitmentForm 의 applicationMode 라디오 마크업 패턴 준수
  //  - <label className="flex items-center gap-2 text-sm"><input type="checkbox"
  //      checked={question.required} onChange={...} className="h-4 w-4 rounded border-slate-300" /> 필수 질문</label>
  //  - type !== 'TEXT' 이면 선택지 목록: 각 행 input + ✕, 하단 "+ 선택지 추가",
  //    선택지 2개 미만이면 <p className="text-xs text-slate-400">선택지를 2개 이상 등록해주세요.</p> 힌트
  //  - 하단 "+ 질문 추가" 버튼은 기존 스타일 그대로
}
```

렌더·핸들러 주석 부분은 전부 실제 코드로 구현한다(위 명세대로, 기존 파일의 클래스 문자열 재사용).

- [ ] **Step 4: RecruitmentForm 배선**

- 상태: `const keyCounter = useRef(0); const nextKey = () => \`bq-${keyCounter.current += 1}\`;`
  `const [questionItems, setQuestionItems] = useState<BuilderQuestion[]>(() => isEditMode ? toBuilderQuestions(initialData?.questionItems, initialData?.questions ?? [], nextKey) : []);`
- `CreateFormValues`/`EditFormValues`: `questions: string[]` → `questionItems: QuestionItemPayload[]`
- safeParse 입력: `questionItems: applicationMode === 'SELF' ? toQuestionItemsPayload(questionItems) : undefined` (edit 도 동일 — edit 의 SELF 판정은 기존 `initialData?.applicationMode === 'SELF'` 사용)
- onSubmit 전달값: `questionItems: parsed.data.questionItems ?? []`
- 빌더 노출 블록: `<QuestionBuilder questions={questionItems} onChange={setQuestionItems} nextKey={nextKey} />`
- `new/page.tsx`·`edit/page.tsx`: FormValues → `CreateRecruitmentPayload`/`UpdateRecruitmentPayload` 변환에서 `questions` 대신 `questionItems` 전달 (create 는 SELF 일 때만, edit 은 questionItems 를 항상 포함하던 기존 questions 로직과 동일 조건 유지 — 기존 페이지 코드를 Read 해 조건을 그대로 이식)

- [ ] **Step 5: 통과 확인** — `pnpm test -- manage && pnpm typecheck` → PASS.

- [ ] **Step 6: 커밋** — `feat(web): 리더 지원서 빌더에 질문 유형·필수·선택지 편집 추가`

---

## Task 3: 지원자 작성 화면 (유형별 렌더 + JS 통합 검증 + 신형 제출/임시저장)

**Files:**
- Modify: `frontend/packages/types/src/application.ts` (`SubmitApplicationPayload`), `frontend/packages/types/src/draft.ts` (`DraftAnswer`)
- Rewrite: `frontend/apps/web/app/apply/[recruitmentId]/_components/ApplyAnswersStep.tsx`
- Modify: `frontend/apps/web/app/apply/[recruitmentId]/_components/ApplyForm.tsx`, `.../page.tsx`
- Test: `frontend/apps/web/test/apply/apply-page.test.tsx` (확장 + 픽스처에 questionItems 추가)

- [ ] **Step 1: 타입 전환** — breaking 이므로 이 태스크 안에서 소비처를 전부 고친다:

```ts
// draft.ts
export type DraftAnswer = {
  questionId: string; // 질문 UUID (V78 이후 서버 표준)
  values: string[];   // TEXT=본문 1개, SINGLE=choiceId 0~1개, MULTIPLE=choiceId 목록
};
// application.ts
export type SubmitAnswerItem = { questionId: string; values: string[] };
export type SubmitApplicationPayload = { answerItems: SubmitAnswerItem[] };
```

`pnpm typecheck` 로 소비처 전수 확인(ApplyForm/page/useAutosaveDraft/테스트 외 다른 소비처가 나오면 함께 어댑트 후 보고).

- [ ] **Step 2: 실패하는 테스트 작성** — apply-page.test 의 recruitment detail 픽스처에 `questionItems`(TEXT 필수 + SINGLE 필수 2지선다 + MULTI 선택 2지선다) 추가 후:

```tsx
// 1. "질문 유형에 따라 textarea·radio·checkbox 가 렌더된다"
//    → getByRole('radio', { name: '1학년' }), getByRole('checkbox', { name: '기획' }) 등
// 2. "필수 질문을 비우고 제출하면 질문별 안내가 뜨고 요청이 나가지 않는다"
//    → 제출 클릭 → findAllByRole('alert') 에 '필수 질문입니다…' 포함, 제출 핸들러 미호출(MSW spy),
//      첫 위반 컨트롤에 포커스 이동 단언(document.activeElement)
// 3. "선택 질문은 비워도 제출되고 payload 는 answerItems 형태다"
//    → TEXT 입력 + radio 선택, MULTI 는 비움 → 제출 → 캡처된 body 가
//      { answerItems: [{questionId, values: ['열정']}, {questionId, values: ['<choiceId>']}, {questionId, values: []}] }
// 4. "임시저장은 uuid questionId 로 PUT 된다" (draft PUT 캡처 — 기존 autosave 예외 핸들러 활용)
// 5. "저장된 draft 의 유효하지 않은 choiceId 는 시드에서 걸러진다"
//    → draft GET 픽스처에 미지 choiceId 포함 → 체크박스 미체크 렌더 단언
// 6. (회귀) 409 인라인 에러·성공 라우팅 기존 케이스 어댑트 유지
```

- [ ] **Step 3: 실패 확인** — `pnpm test -- apply` → FAIL.

- [ ] **Step 4: 구현**

`ApplyAnswersStep.tsx` 전면 재작성 (기존 크림 팔레트 클래스 재사용):

```tsx
'use client';

import type { DraftAnswer, RecruitmentQuestionItem } from '@duing/types';

type Props = {
  questions: RecruitmentQuestionItem[];
  answers: DraftAnswer[];
  errors: Record<string, string>;
  onChange: (next: DraftAnswer[]) => void;
  disabled?: boolean;
};

const textareaClass = /* 기존 textarea 클래스 문자열 그대로 */;

export function ApplyAnswersStep({ questions, answers, errors, onChange, disabled = false }: Props) {
  function valuesOf(questionId: string): string[] {
    return answers.find((answer) => answer.questionId === questionId)?.values ?? [];
  }
  function updateValues(questionId: string, values: string[]) {
    onChange(answers.map((answer) =>
      answer.questionId === questionId ? { questionId, values } : answer));
  }
  function toggleChoice(questionId: string, choiceId: string) {
    const current = valuesOf(questionId);
    updateValues(questionId, current.includes(choiceId)
      ? current.filter((value) => value !== choiceId)
      : [...current, choiceId]);
  }

  if (questions.length === 0) { /* 기존 안내 문구 유지 */ }

  return (
    <div className="space-y-7">
      {questions.map((question, index) => {
        const error = errors[question.id];
        const describedBy = error ? `q-${question.id}-error` : undefined;
        return (
          <fieldset key={question.id} className="space-y-2.5" aria-describedby={describedBy}>
            <legend className="block text-sm font-semibold tracking-body text-charcoal">
              <span className="mr-1.5 font-mono font-semibold text-ink">{index + 1}.</span>
              {question.text}
              {question.required ? (
                <span aria-hidden="true" className="ml-1 text-coral">*</span>
              ) : (
                <span className="ml-1.5 text-xs font-normal text-charcoal-3">(선택)</span>
              )}
            </legend>

            {question.type === 'TEXT' && (
              <textarea
                id={`q-${question.id}`}
                disabled={disabled}
                aria-required={question.required}
                aria-invalid={Boolean(error)}
                aria-describedby={describedBy}
                value={valuesOf(question.id)[0] ?? ''}
                onChange={(event) => updateValues(question.id, [event.target.value])}
                className={textareaClass}
                style={{ minHeight: '180px' }}
              />
            )}

            {question.type === 'SINGLE_CHOICE' && (
              <div id={`q-${question.id}`} role="radiogroup" aria-required={question.required}
                   aria-invalid={Boolean(error)} aria-describedby={describedBy}
                   className="space-y-2" tabIndex={-1}>
                {question.choices.map((choice) => (
                  <label key={choice.id} className="flex items-center gap-2.5 text-sm text-charcoal">
                    <input
                      type="radio"
                      name={`question-${question.id}`}
                      value={choice.id}
                      disabled={disabled}
                      checked={valuesOf(question.id)[0] === choice.id}
                      onChange={() => updateValues(question.id, [choice.id])}
                      className="h-4 w-4 accent-[#2e6149]"
                    />
                    {choice.label}
                  </label>
                ))}
              </div>
            )}

            {question.type === 'MULTIPLE_CHOICE' && (
              <div id={`q-${question.id}`} aria-invalid={Boolean(error)} aria-describedby={describedBy}
                   className="space-y-2" tabIndex={-1}>
                {question.choices.map((choice) => (
                  <label key={choice.id} className="flex items-center gap-2.5 text-sm text-charcoal">
                    <input
                      type="checkbox"
                      value={choice.id}
                      disabled={disabled}
                      checked={valuesOf(question.id).includes(choice.id)}
                      onChange={() => toggleChoice(question.id, choice.id)}
                      className="h-4 w-4 rounded accent-[#2e6149]"
                    />
                    {choice.label}
                  </label>
                ))}
              </div>
            )}

            {error && (
              <p id={`q-${question.id}-error`} role="alert" className="text-sm text-coral">
                {error}
              </p>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
```

(radio/checkbox 의 accent 색은 지원 페이지의 기존 포인트 컬러 토큰이 있으면 그것을 사용 — `text-ink` 계열 확인. `as` 단언 없이 작성.)

`ApplyForm.tsx`:

```tsx
// props: recruitment + questionItems: RecruitmentQuestionItem[] + initialAnswers: DraftAnswer[]
const [answers, setAnswers] = useState<DraftAnswer[]>(initialAnswers);
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

function validateAnswers(): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const question of questionItems) {
    if (!question.required) continue;
    const values = answers.find((answer) => answer.questionId === question.id)?.values ?? [];
    if (question.type === 'TEXT' && !(values[0] ?? '').trim()) {
      errors[question.id] = '필수 질문입니다. 답변을 입력해주세요.';
    }
    if (question.type !== 'TEXT' && values.length === 0) {
      errors[question.id] = '필수 질문입니다. 항목을 선택해주세요.';
    }
  }
  return errors;
}

async function handleSubmit(event: FormEvent) {
  event.preventDefault();
  setError(null);
  const nextFieldErrors = validateAnswers();
  setFieldErrors(nextFieldErrors);
  const firstInvalidQuestionId = questionItems
    .map((question) => question.id)
    .find((questionId) => nextFieldErrors[questionId]);
  if (firstInvalidQuestionId) {
    document.getElementById(`q-${firstInvalidQuestionId}`)?.focus();
    return;
  }
  try {
    const payload = {
      answerItems: answers.map(({ questionId, values }) => ({ questionId, values })),
    };
    // 이하 기존 mutateAsync → invalidate → push → catch(ApiError) 흐름 유지
```

`ApplyAnswersStep` 에 `errors={fieldErrors}` 전달. 입력 변경 시 해당 질문 에러 해제(`handleAnswersChange` 에서 `setFieldErrors((prev) => { ... delete next[questionId] ... })` — 변경된 questionId 는 diff 로 찾거나 onChange 시그니처에 함께 전달).

`page.tsx` 시드 교체:

```tsx
const questionItems: RecruitmentQuestionItem[] =
  recruitment.questionItems ??
  recruitment.questions.map((text, index) => ({
    // 구 BE 시차 fallback — 제출은 신 BE 배포 전까지 400 으로 명확히 실패한다 (스펙 §3).
    id: `legacy-${index}`, text, type: 'TEXT', required: true, choices: [],
  }));

const initialAnswers: DraftAnswer[] = questionItems.map((question) => {
  const saved = draft?.exists
    ? draft.answers.find((answer) => answer.questionId === question.id)
    : undefined;
  const savedValues = saved?.values ?? [];
  const values = question.type === 'TEXT'
    ? savedValues.slice(0, 1)
    : savedValues.filter((value) => question.choices.some((choice) => choice.id === value));
  return { questionId: question.id, values };
});
```

`ApplyForm` 에 `questionItems` prop 추가 전달. `useAutosaveDraft` 는 타입 전파 외 변경 없음(직렬화 비교·2초 debounce·410 처리 유지).

- [ ] **Step 5: 통과 확인** — `pnpm test -- apply && pnpm typecheck` → PASS.

- [ ] **Step 6: 커밋** — `feat(web): 지원서 작성 화면 질문 유형 렌더링·필수 검증·신형 제출 전환`

---

## Task 4: 품질 게이트 + PR

- [ ] `cd frontend && pnpm lint && pnpm test && pnpm build` → 전부 통과 (출력 직접 확인)
- [ ] 브랜치 adversarial 리뷰 1회 (API contract 전환)
- [ ] self-check 7항목
- [ ] push + PR 생성 (제목: `feat(web): 지원서 질문 유형·필수 여부 UI 지원`, 본문 🚀/🤔/💬, **머지 금지 — 사용자 지시 대기**)

---

## (플랜 외) 최종 E2E — 메인 세션 담당

PR-3·PR-4 코드가 준비되면(머지 전 로컬 브랜치 조합으로도 가능) 메인 세션이 직접:
1. 로컬 BE(`cd backend && ./gradlew bootRun` — Docker/PG 기동 확인) + FE(`cd frontend && pnpm dev`, :3000 고정, stale next-server 잔존 시 부모→워커→포트 순 kill)
2. playwright MCP 로: 리더 로그인 → 3유형 질문 모집 생성 → 학생 로그인 → 지원하기(사전 가드 토스트 확인: 마감/중복 케이스) → 유형별 작성(필수 검증 확인) → 제출 → 내 지원서 표시 → 운영진 열람 표시
3. 종료 후 dev 서버·bootRun 정리
