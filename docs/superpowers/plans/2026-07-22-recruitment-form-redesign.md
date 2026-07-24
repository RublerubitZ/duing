# 모집 작성 화면(Recruitment Form) 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모집 생성/수정/복제 화면을 4섹션 카드 + 우측 Sticky Preview(지원자 시점) 구조로 리디자인하고, 안내문(content)을 학생 지원 화면에 Markdown으로 노출하는 정책 전환을 함께 반영한다.

**Architecture:** `RecruitmentForm`의 상태 모델·`handleSubmit`·zod 검증·legacy BE 가드는 **무변경**으로 두고 마크업만 4섹션(기본 정보→모집 설정→안내문→지원서 질문)으로 재구성한다. 폼 컴포넌트가 `#737` 선례(`ClubInfoForm`)처럼 그리드+aside(Preview)를 직접 소유하고, Preview는 폼 로컬 상태에서만 파생(쿼리 0)한다. 안내문 학생 노출은 apply 화면이 이미 받는 `RecruitmentDetail.content`를 렌더하는 FE-only 변경이며, Markdown은 기설치된 `react-markdown`+`remark-gfm`(공지 선례 `NoticeMarkdown`)을 공용 `MarkdownProse`로 재사용한다. 상시모집 공고 수정 불가 버그(edit 제출 시 zod endDate 필수)를 이번에 고친다.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query, Zod(`@duing/schemas`), react-markdown+remark-gfm(기설치), Vitest + Testing Library + MSW.

## Global Constraints

- **폼 로직 무변경**: `RecruitmentForm`의 useState 상태 모델·`handleSubmit` 분기·`isLegacyQuestionsBackend` 가드·cloneSeed 시드 규칙(기간 5종 미시드)은 수정하지 않는다. 유일한 로직 변경은 Task 2의 상시모집 edit 버그 픽스(endDate 생략 분기)뿐이다.
- 섹션 순서 고정: ① 기본 정보(제목·기간·상시모집·정원) ② 모집 설정 ③ 안내문 ④ 지원서 질문. 전형 단계는 독립 섹션 금지 — ②의 면접 진행 행 아래 파생 칩(`recruitmentStageLabels`)으로만 표시.
- 안내문(content) 정책: 학생 apply 화면에서 **모집 정보(헤더) → 안내문 → 지원서 질문 → 제출** 순서로 노출. Markdown(제목·리스트·강조·링크) 지원 — 렌더는 `MarkdownProse` 하나로 apply·Preview·운영자 상세 3곳 통일. 저장은 기존 TEXT 그대로(백엔드 무변경).
- Preview: 우측 380px, `hidden xl:sticky xl:top-6 xl:block`(xl 미만 숨김 — `ClubInfoForm.tsx:626` 선례). 순서: 모집 정보 → 안내문 → 지원서 질문(SELF)/외부 폼 안내(EXTERNAL) → 제출 버튼(장식). 데이터는 전부 로컬 폼 상태 파생 — 추가 쿼리 금지.
- 저장 버튼: 페이지 헤더 우측 + 폼 하단 병행(같은 form을 `form` 속성으로 공유, pending 동기화). 버튼명: 생성 "모집 시작" / 수정 "수정 저장" / 복제 "복제하여 모집 시작". 취소: 생성·복제→모집 관리 목록, 수정→상세.
- 질문 빌더: 조작 로직(추가/삭제/▲▼/유형/필수/선택지) 무변경, 디자인만 개선. 드래그(dnd-kit)·단답/장문 구분 미도입.
- edit 모드 정책 표기: applicationMode·externalFormUrl·targetRole·상시모집 전환은 변경 불가(백엔드 DTO에 없음) — 잠금 표시 + 외부 폼은 "URL 오타 시 마감 후 재생성 필요" 안내.
- 디자인은 듀잉 토큰(`.card`/`.btn`/`.pill`, ink/sage/cream/charcoal/line)으로 통일 — slate 팔레트 제거. `SectionCard`는 `manage/_components`로 승격(2번째 소비처 발생).
- 기존 기능 삭제 금지: 1절 조사 보고서의 기능 인벤토리 전부 보존. 기존 테스트는 회귀 가드 — 마크업 전환으로 쿼리 방식이 바뀌는 단언만 검증 의도를 보존한 채 조정한다(예: radio→`getByRole('radio', { name })`).
- 타입 `type`만(interface 금지), `any`/`as` 금지(테스트 `as const`·기존 파일 관례 제외), 새 파일 `@/` alias, 서버 상태 TanStack Query만, TDD(RED→GREEN) 필수.
- 커밋: Conventional Commits 한국어, attribution 라인 금지.
- pnpm 명령은 `frontend/`에서 실행.

## Out of Scope (후속 제안으로만 기록)

- 질문 드래그 정렬(dnd-kit), TEXT의 단답/장문 분리, 기수·모집 구분·전형 단계 커스텀·최종 발표일(전부 백엔드 필드 필요)
- 동아리 상세의 학생 카드(`StudentRecruitmentProjection`)에 content 추가(백엔드 프로젝션 변경)
- 필드별 인라인 validation(현행 첫 에러 1줄 유지)
- `NoticeMarkdown` 리팩터링(공지는 기존 컴포넌트 유지)

---

### Task 1: `SectionCard` 공용 승격

**Files:**
- Create: `apps/web/app/manage/_components/SectionCard.tsx` (info 라우트에서 무수정 이동)
- Delete: `apps/web/app/manage/clubs/[clubId]/info/_components/SectionCard.tsx`
- Modify: `apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx` (import 경로만)

**Interfaces:**
- Produces: `SectionCard({ number: number, title: string, description?: string, children: ReactNode })` — Task 7(RecruitmentForm)이 소비. 사용처는 현재 `ClubInfoForm` 1곳뿐(grep 확인 완료).

- [ ] **Step 1: 파일 이동(내용 무수정)**

`apps/web/app/manage/clubs/[clubId]/info/_components/SectionCard.tsx`의 내용 전체를 그대로 `apps/web/app/manage/_components/SectionCard.tsx`로 옮기고 원본을 삭제한다:

```tsx
import type { ReactNode } from 'react';

type SectionCardProps = { number: number; title: string; description?: string; children: ReactNode };

/** 목업의 번호 배지 카드 (§6.1). 배지·제목 행 + 32px 들여쓴 본문. */
export function SectionCard({ number, title, description, children }: SectionCardProps) {
  return (
    <section className="mb-4 rounded-[18px] border border-[#d9d4c3] bg-white p-[22px]">
      <div className={`flex items-baseline gap-2.5 ${description ? 'mb-1' : 'mb-4'}`}>
        <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-[#e3e9e1] font-mono text-[12px] font-extrabold text-[#1f3a2e]">
          {number}
        </span>
        <h3 className="text-[16px] font-bold text-[#2a2f27]">{title}</h3>
      </div>
      {description && <p className="mb-4 ml-8 text-[12.5px] leading-relaxed text-[#8a8f83]">{description}</p>}
      <div className="ml-0 sm:ml-8">{children}</div>
    </section>
  );
}
```

- [ ] **Step 2: `ClubInfoForm.tsx`의 SectionCard import를 새 경로로 교체**

기존 `import { SectionCard } from './SectionCard';` → `import { SectionCard } from '@/app/manage/_components/SectionCard';`

- [ ] **Step 3: 회귀 테스트**

Run: `pnpm --filter @duing/web test -- run test/manage/club-info-form.test.tsx test/manage/club-info-repeaters.test.tsx`
Expected: PASS (info 폼 전 케이스). `pnpm --filter @duing/web typecheck`도 클린.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/app/manage/_components/SectionCard.tsx apps/web/app/manage/clubs/'[clubId]'/info/_components/
git commit -m "refactor(frontend): SectionCard를 manage 공용 컴포넌트로 승격"
```

---

### Task 2: 상시모집 공고 수정 불가 버그 픽스

배경: edit 제출은 `endDate` state('')를 무조건 `updateRecruitmentSchema`에 넣는데 스키마가 endDate를 non-null 필수 regex로 요구해, 상시모집(endDate null) 공고는 어떤 필드를 고쳐도 "날짜 형식이 올바르지 않습니다"로 저장이 막힌다. 백엔드는 endDate 생략=미변경이므로 생략이 정답.

**Files:**
- Modify: `packages/schemas/src/index.ts` (updateRecruitmentSchema.endDate → optional)
- Modify: `apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm.tsx` (edit 제출 분기 + EditFormValues 타입)
- Modify: `apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/edit/page.tsx` (payload 전달)
- Test: `apps/web/test/manage/recruitment-form.test.tsx` (케이스 추가)

**Interfaces:**
- Produces: `EditFormValues.endDate?: string`(상시모집이면 undefined → PATCH payload에서 키 생략). `UpdateRecruitmentPayload.endDate`는 이미 optional이라 타입 호환.

- [ ] **Step 1: 실패하는 테스트 작성**

`recruitment-form.test.tsx` 끝에 추가(기존 `baseRecruitmentDetail` 재사용):

```tsx
describe('RecruitmentForm — 상시모집 수정', () => {
  it('상시모집 공고는 endDate 없이 수정 저장이 가능하다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <RecruitmentForm
        mode="edit"
        initialValues={{ ...baseRecruitmentDetail, endDate: null }}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'), {
      target: { value: '수정된 상시모집' },
    });
    fireEvent.click(screen.getByRole('button', { name: '수정 저장' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ title: '수정된 상시모집' });
    expect(onSubmit.mock.calls[0]?.[0].endDate).toBeUndefined();
    expect(screen.queryByText('날짜 형식이 올바르지 않습니다.')).not.toBeInTheDocument();
  });
});
```

주의: 이 시점(Task 2)에는 제출 버튼이 아직 "수정 저장" 라벨이다(현행 그대로). Task 7 이후에도 라벨은 동일하므로 조정 불요.

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitment-form.test.tsx`
Expected: FAIL — onSubmit 미호출("날짜 형식이 올바르지 않습니다." 검증 에러 표시)

- [ ] **Step 3: 스키마 수정**

`packages/schemas/src/index.ts`의 `updateRecruitmentSchema`에서:

```ts
    // 상시모집(endDate null) 공고는 endDate 를 보내지 않는다(생략=미변경). 기간 모집은 폼 native required 가 빈 값을 차단한다.
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.')
      .optional(),
```

그리고 해당 refine을 undefined-safe로:

```ts
  .refine((data) => data.endDate === undefined || data.endDate >= data.startDate, {
    message: '모집 종료일은 시작일보다 빠를 수 없습니다.',
    path: ['endDate'],
  })
```

- [ ] **Step 4: `RecruitmentForm.tsx` edit 제출 분기 수정**

`EditFormValues`의 `endDate: string;` → `endDate?: string;` 로 변경.

edit 경로 safeParse 입력에서 `endDate,` → `endDate: isAlwaysOpen ? undefined : endDate,` 로 변경 (edit 모드의 `isAlwaysOpen`은 `initialData?.endDate === null`로 초기화돼 있음).

onSubmit 전달부의 `endDate: parsed.data.endDate,` 는 그대로 둔다(undefined면 undefined 전달).

- [ ] **Step 5: `edit/page.tsx` payload 전달 확인/수정**

`handleSubmit`의 `endDate: values.endDate,` 는 그대로 유효(undefined면 JSON 직렬화에서 키 생략 — `UpdateRecruitmentPayload.endDate?: string`). 수정 불필요하면 무변경으로 확인만 기록.

- [ ] **Step 6: 테스트 통과 + 회귀 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitment-form.test.tsx test/manage/recruitment-form-interview.test.tsx && pnpm --filter @duing/schemas test -- --run 2>/dev/null || true`
Expected: 폼 테스트 전체 PASS(기존 기간 모집 edit 케이스 포함). `pnpm --filter @duing/web typecheck` 클린.

- [ ] **Step 7: Commit**

```bash
git add packages/schemas/src/index.ts apps/web/app/manage/clubs/'[clubId]'/recruitments/_components/RecruitmentForm.tsx apps/web/app/manage/clubs/'[clubId]'/recruitments/'[recruitmentId]'/edit/page.tsx apps/web/test/manage/recruitment-form.test.tsx
git commit -m "fix(frontend): 상시모집 공고 수정 시 endDate 생략으로 저장 불가 버그 해소"
```

---

### Task 3: 폼 컨트롤 프리미티브 (FormSegment · FormSwitch · SettingRow)

**Files:**
- Create: `apps/web/app/manage/clubs/[clubId]/recruitments/_components/form-controls.tsx` (라우트 로컬 — 소비처 1곳)
- Test: `apps/web/test/manage/recruitments/form-controls.test.tsx`

**Interfaces:**
- Produces (Task 6·7이 소비):
  - `FormSegment<Value extends string>({ options: ReadonlyArray<{ value: Value; label: string }>, value: Value, onChange: (next: Value) => void, ariaLabel: string, disabled?: boolean })` — role=radiogroup/radio + aria-checked (`FeeCycleSegment` 패턴 일반화, jest-dom `toBeChecked()` 호환)
  - `FormSwitch({ checked: boolean, onChange: (next: boolean) => void, ariaLabel: string, disabled?: boolean })` — role=switch + aria-checked
  - `SettingRow({ title: string, desc?: string, children: ReactNode })` — cream 설정 행 카드(우측 컨트롤)

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/test/manage/recruitments/form-controls.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  FormSegment,
  FormSwitch,
  SettingRow,
} from '@/app/manage/clubs/[clubId]/recruitments/_components/form-controls';

describe('FormSegment', () => {
  const options = [
    { value: 'SELF', label: '자체 폼' },
    { value: 'EXTERNAL', label: '외부 폼' },
  ] as const;

  it('radiogroup/radio 시맨틱으로 렌더하고 선택 상태를 aria-checked 로 표현한다', () => {
    render(<FormSegment options={options} value="SELF" onChange={vi.fn()} ariaLabel="지원 방식" />);
    expect(screen.getByRole('radiogroup', { name: '지원 방식' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '자체 폼' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '외부 폼' })).not.toBeChecked();
  });

  it('클릭 시 해당 value 로 onChange 를 호출한다', () => {
    const onChange = vi.fn();
    render(<FormSegment options={options} value="SELF" onChange={onChange} ariaLabel="지원 방식" />);
    fireEvent.click(screen.getByRole('radio', { name: '외부 폼' }));
    expect(onChange).toHaveBeenCalledWith('EXTERNAL');
  });
});

describe('FormSwitch', () => {
  it('switch 시맨틱 + 클릭 시 반전 값으로 onChange', () => {
    const onChange = vi.fn();
    render(<FormSwitch checked={false} onChange={onChange} ariaLabel="면접 진행" />);
    const toggle = screen.getByRole('switch', { name: '면접 진행' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('SettingRow', () => {
  it('제목·설명·컨트롤을 렌더한다', () => {
    render(
      <SettingRow title="지원자 수 공개" desc="모집 페이지에 현재 지원자 수를 보여줄지">
        <span>컨트롤</span>
      </SettingRow>,
    );
    expect(screen.getByText('지원자 수 공개')).toBeInTheDocument();
    expect(screen.getByText('모집 페이지에 현재 지원자 수를 보여줄지')).toBeInTheDocument();
    expect(screen.getByText('컨트롤')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/form-controls.test.tsx`
Expected: FAIL — Cannot find module '.../form-controls'

- [ ] **Step 3: 구현**

`apps/web/app/manage/clubs/[clubId]/recruitments/_components/form-controls.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';

type FormSegmentProps<Value extends string> = {
  options: ReadonlyArray<{ value: Value; label: string }>;
  value: Value;
  onChange: (next: Value) => void;
  ariaLabel: string;
  disabled?: boolean;
};

/** 세그먼트 토글 — FeeCycleSegment 패턴의 일반화(role=radiogroup/radio, 듀잉 토큰). */
export function FormSegment<Value extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: FormSegmentProps<Value>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex flex-wrap gap-[3px] rounded-[11px] bg-graysoft p-[3px]">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-[9px] px-3.5 py-2 text-[13px] font-bold transition-colors disabled:cursor-default ${
              selected ? 'bg-paper text-ink-deep shadow-sm' : 'bg-transparent text-charcoal-3 hover:text-charcoal-2'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

type FormSwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
};

/** ON/OFF 스위치 — role=switch, ink 트랙 + 흰 노브. */
export function FormSwitch({ checked, onChange, ariaLabel, disabled = false }: FormSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors disabled:cursor-default ${
        checked ? 'bg-ink' : 'bg-charcoal-3/50'
      }`}
    >
      <span
        className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-[left] ${
          checked ? 'left-[23px]' : 'left-[3px]'
        }`}
      />
    </button>
  );
}

type SettingRowProps = {
  title: string;
  desc?: string;
  children: ReactNode;
};

/** 설정 행 카드 — 좌측 제목·설명 + 우측 컨트롤. */
export function SettingRow({ title, desc, children }: SettingRowProps) {
  return (
    <div className="mb-2.5 flex items-center gap-4 rounded-[13px] border border-line bg-cream px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-bold text-ink-deep">{title}</div>
        {desc && <div className="mt-0.5 text-xs leading-relaxed text-charcoal-3">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/form-controls.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/manage/clubs/'[clubId]'/recruitments/_components/form-controls.tsx apps/web/test/manage/recruitments/form-controls.test.tsx
git commit -m "feat(frontend): 모집 작성용 세그먼트·스위치·설정 행 프리미티브 추가"
```

---

### Task 4: `MarkdownProse` 공용 + 학생 apply 화면 안내문 노출 + 운영자 상세 통일

**Files:**
- Create: `apps/web/components/markdown/MarkdownProse.tsx`
- Modify: `apps/web/app/apply/[recruitmentId]/_components/ApplyForm.tsx` (안내문 블록 삽입)
- Modify: `apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/page.tsx` (content 렌더를 MarkdownProse로)
- Test: `apps/web/test/markdown/markdown-prose.test.tsx`, `apps/web/test/apply/apply-page.test.tsx` (케이스 추가)

**Interfaces:**
- Produces: `MarkdownProse({ content: string, className?: string })` — Task 5(Preview)도 소비. `NoticeMarkdown`(공지 전용)은 건드리지 않는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/test/markdown/markdown-prose.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MarkdownProse } from '@/components/markdown/MarkdownProse';

describe('MarkdownProse', () => {
  it('제목·리스트·강조·링크 Markdown 을 렌더한다', () => {
    render(
      <MarkdownProse content={'## 모집 안내\n\n- 4주 세미나\n- **팀 프로젝트**\n\n[동아리 소개](https://example.com)'} />,
    );
    expect(screen.getByRole('heading', { level: 2, name: '모집 안내' })).toBeInTheDocument();
    expect(screen.getByText('4주 세미나')).toBeInTheDocument();
    expect(screen.getByText('팀 프로젝트').tagName).toBe('STRONG');
    const link = screen.getByRole('link', { name: '동아리 소개' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('raw HTML 은 이스케이프된다(react-markdown 기본 동작 가드)', () => {
    render(<MarkdownProse content={'<img src=x onerror=alert(1)>안전'} />);
    expect(document.querySelector('img')).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @duing/web test -- run test/markdown/markdown-prose.test.tsx`
Expected: FAIL — Cannot find module '@/components/markdown/MarkdownProse'

- [ ] **Step 3: `MarkdownProse` 구현** (NoticeMarkdown 패턴의 소형 스케일 변형)

`apps/web/components/markdown/MarkdownProse.tsx`:

```tsx
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/app/_lib/cn';

type Props = {
  content: string;
  className?: string;
};

/**
 * 모집 안내문 등 사용자 작성 Markdown 의 공용 렌더러(제목·리스트·강조·링크 수준).
 * react-markdown 은 raw HTML 을 이스케이프하므로 dangerouslySetInnerHTML 없이 안전하다.
 * 공지(NoticeMarkdown)는 자체 스케일을 유지한다 — 이 컴포넌트는 본문 14px 스케일.
 */
export function MarkdownProse({ content, className }: Props) {
  return (
    <div
      className={cn(
        'whitespace-pre-wrap text-sm leading-[1.75] text-charcoal-2 [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-charcoal-3 [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[16px] [&_h2]:font-bold [&_h2]:text-ink-deep [&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-[14.5px] [&_h3]:font-bold [&_h3]:text-ink-deep [&_li]:mb-1 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_strong]:font-bold [&_strong]:text-ink-deep [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-unused-vars -- react-markdown 의 node prop 은 DOM 으로 전파 금지
          a: ({ node: _node, ...rest }) => <a {...rest} target="_blank" rel="noreferrer" />,
        }}
      >{content}</ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 4: apply 화면에 안내문 블록 삽입**

`ApplyForm.tsx` — 마감 알림 블록(`{isClosedByDraft && (...)}`) **아래**, `<form onSubmit={handleSubmit} ...>` **위**에 삽입:

```tsx
        {/* 모집 안내문 — 모집 정보(헤더) → 안내문 → 지원서 질문 순서 정책. content 없으면 미표시 */}
        {recruitment.content && (
          <section aria-label="모집 안내" className="mb-9">
            <h2 className="mb-3 text-[13px] font-bold tracking-wide text-ink">모집 안내</h2>
            <MarkdownProse content={recruitment.content} className="text-[14.5px]" />
          </section>
        )}
```

상단 import에 `import { MarkdownProse } from '@/components/markdown/MarkdownProse';` 추가.

- [ ] **Step 5: apply 페이지 테스트 케이스 추가**

`apps/web/test/apply/apply-page.test.tsx`의 기존 픽스처/헬퍼를 재사용해 케이스 2개 추가(파일의 기존 MSW·렌더 패턴을 그대로 따를 것 — 상세 응답 픽스처의 `content` 필드만 오버라이드):

```tsx
  it('안내문(content)이 있으면 질문보다 먼저 Markdown 으로 렌더한다', async () => {
    // 기존 상세 핸들러 픽스처에서 content 만 '## 환영합니다\n\n- OT 9/30' 로 오버라이드해 렌더
    // (파일의 기존 헬퍼 시그니처에 맞춰 작성)
    expect(await screen.findByRole('heading', { name: '환영합니다' })).toBeInTheDocument();
    expect(screen.getByText('OT 9/30')).toBeInTheDocument();
    const notice = screen.getByRole('region', { name: '모집 안내' });
    const firstQuestion = screen.getAllByText(/./, { selector: 'form *' })[0];
    expect(
      notice.compareDocumentPosition(firstQuestion as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('content 가 null 이면 모집 안내 섹션을 렌더하지 않는다', async () => {
    // content: null 픽스처로 렌더
    expect(screen.queryByRole('region', { name: '모집 안내' })).not.toBeInTheDocument();
  });
```

(위 두 케이스의 렌더 보일러플레이트는 파일 기존 패턴을 따르고, 순서 단언이 기존 구조상 번거로우면 "안내 섹션 존재 + form 이전 위치"를 DOM 순서 비교로 단순화해도 된다 — 검증 의도: ① Markdown 렌더 ② 질문보다 먼저 ③ null이면 미표시.)

- [ ] **Step 6: 운영자 상세 페이지 content 렌더 교체**

`[recruitmentId]/page.tsx`의:

```tsx
          <p className="whitespace-pre-wrap text-sm text-slate-600">{recruitment.content}</p>
```

를:

```tsx
          <MarkdownProse content={recruitment.content} />
```

로 교체하고 import 추가. (해당 페이지의 나머지 slate 스타일 마이그레이션은 Out of Scope — 이 블록만.)

- [ ] **Step 7: 테스트 통과 + 회귀**

Run: `pnpm --filter @duing/web test -- run test/markdown/markdown-prose.test.tsx test/apply/apply-page.test.tsx test/manage/recruitments/recruitment-detail-page.test.tsx`
Expected: 전체 PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/markdown/MarkdownProse.tsx apps/web/app/apply/'[recruitmentId]'/_components/ApplyForm.tsx apps/web/app/manage/clubs/'[clubId]'/recruitments/'[recruitmentId]'/page.tsx apps/web/test/markdown/markdown-prose.test.tsx apps/web/test/apply/apply-page.test.tsx
git commit -m "feat(frontend): 모집 안내문을 학생 지원 화면에 Markdown 으로 노출"
```

---

### Task 5: `RecruitmentPreview` — 지원자 시점 Sticky Preview

**Files:**
- Create: `apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentPreview.tsx`
- Test: `apps/web/test/manage/recruitments/RecruitmentPreview.test.tsx`

**Interfaces:**
- Consumes: `MarkdownProse`(Task 4), `BuilderQuestion`(기존 QuestionBuilder), `recruitmentDaysLeft`(기존 `@/app/_lib/recruitmentDisplay`).
- Produces: `RecruitmentPreview({ data: RecruitmentPreviewData })`, `type RecruitmentPreviewData = { title: string; startDate: string; endDate: string | null; capacity: number; applicationMode: 'SELF' | 'EXTERNAL'; externalFormUrl: string; useInterview: boolean; targetRole: 'MEMBER' | 'OFFICER'; content: string; questions: BuilderQuestion[] }` — Task 7(RecruitmentForm)이 로컬 상태에서 조립해 소비. 쿼리 사용 금지(순수 프레젠테이션).

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/test/manage/recruitments/RecruitmentPreview.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { RecruitmentPreviewData } from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentPreview';
import { RecruitmentPreview } from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentPreview';

function previewData(over: Partial<RecruitmentPreviewData> = {}): RecruitmentPreviewData {
  return {
    title: '10기 신입 모집',
    startDate: '2026-09-15',
    endDate: '2026-09-27',
    capacity: 20,
    applicationMode: 'SELF',
    externalFormUrl: '',
    useInterview: true,
    targetRole: 'MEMBER',
    content: '',
    questions: [
      { key: 'q1', id: null, text: '지원 동기를 알려주세요', type: 'TEXT', required: true, choices: [] },
      {
        key: 'q2',
        id: null,
        text: '관심 분야는?',
        type: 'MULTIPLE_CHOICE',
        required: false,
        choices: [
          { key: 'c1', id: null, label: '웹' },
          { key: 'c2', id: null, label: '앱' },
        ],
      },
    ],
    ...over,
  };
}

describe('RecruitmentPreview', () => {
  it('자체 폼: 모집 정보 → 질문 목록 → 제출하기 순으로 렌더한다', () => {
    render(<RecruitmentPreview data={previewData()} />);
    expect(screen.getByText('10기 신입 모집')).toBeInTheDocument();
    expect(screen.getByText(/정원 20명/)).toBeInTheDocument();
    expect(screen.getByText('지원서 · 2문항')).toBeInTheDocument();
    expect(screen.getByText('지원 동기를 알려주세요')).toBeInTheDocument();
    expect(screen.getByText('웹')).toBeInTheDocument();
    expect(screen.getByText('제출하기')).toBeInTheDocument();
  });

  it('안내문이 있으면 질문보다 먼저 Markdown 으로 렌더한다', () => {
    render(<RecruitmentPreview data={previewData({ content: '## 환영합니다\n\n- OT 9/30' })} />);
    expect(screen.getByRole('heading', { name: '환영합니다' })).toBeInTheDocument();
    expect(screen.getByText('OT 9/30')).toBeInTheDocument();
  });

  it('외부 폼: 링크 안내 카드와 지원 폼 열기 버튼을 렌더하고 질문은 렌더하지 않는다', () => {
    render(
      <RecruitmentPreview
        data={previewData({ applicationMode: 'EXTERNAL', externalFormUrl: 'https://forms.gle/abc' })}
      />,
    );
    expect(screen.getByText('외부 폼으로 지원해요')).toBeInTheDocument();
    expect(screen.getByText('forms.gle/abc')).toBeInTheDocument();
    expect(screen.getByText('지원 폼 열기 →')).toBeInTheDocument();
    expect(screen.queryByText('지원 동기를 알려주세요')).not.toBeInTheDocument();
  });

  it('상시모집이면 상시모집 라벨, 제목 미입력이면 플레이스홀더를 보여준다', () => {
    render(<RecruitmentPreview data={previewData({ title: '', endDate: null })} />);
    expect(screen.getByText('상시모집')).toBeInTheDocument();
    expect(screen.getByText('모집명을 입력하세요')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/RecruitmentPreview.test.tsx`
Expected: FAIL — Cannot find module '.../RecruitmentPreview'

- [ ] **Step 3: 구현**

`apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentPreview.tsx`:

```tsx
'use client';

import type { BuilderQuestion } from './QuestionBuilder';
import { MarkdownProse } from '@/components/markdown/MarkdownProse';
import { recruitmentDaysLeft, recruitmentPeriodLabel } from '@/app/_lib/recruitmentDisplay';

export type RecruitmentPreviewData = {
  title: string;
  startDate: string;
  endDate: string | null;
  capacity: number;
  applicationMode: 'SELF' | 'EXTERNAL';
  externalFormUrl: string;
  useInterview: boolean;
  targetRole: 'MEMBER' | 'OFFICER';
  content: string;
  questions: BuilderQuestion[];
};

function statusPillLabel(data: RecruitmentPreviewData): string {
  if (data.endDate === null) return '상시모집';
  if (!data.startDate || !data.endDate) return '미리보기';
  const daysLeft = recruitmentDaysLeft(data.endDate);
  if (daysLeft === null) return '미리보기';
  return daysLeft >= 0 ? `모집중 · D-${daysLeft}` : '모집마감';
}

/** URL 표시용 — 프로토콜만 제거해 한 줄로. */
function displayUrl(rawUrl: string): string {
  return rawUrl.replace(/^https?:\/\//, '');
}

/**
 * 지원자 시점 미리보기 — 학생 apply 화면과 동일한 순서(모집 정보 → 안내문 → 질문 → 제출).
 * 전부 폼 로컬 상태에서 파생되는 순수 프레젠테이션(쿼리 금지). 인터랙션 없음(장식용).
 */
export function RecruitmentPreview({ data }: { data: RecruitmentPreviewData }) {
  const isExternal = data.applicationMode === 'EXTERNAL';
  const targetLabel = data.targetRole === 'OFFICER' ? '운영진' : '부원';

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2 text-xs font-bold tracking-wide text-charcoal-3">
        <span className="h-[7px] w-[7px] rounded-full bg-sage" />
        지원자에게 보이는 지원 화면
      </div>

      <div className="overflow-hidden rounded-[22px] border border-line bg-paper shadow-2">
        {/* 상단 헤더 스트립 */}
        <div className="flex h-16 items-end bg-gradient-to-br from-ink to-ink-soft p-4">
          <span className="rounded-full bg-sage px-2.5 py-1 text-[10.5px] font-bold text-ink-deep">
            {statusPillLabel(data)}
          </span>
        </div>

        <div className="p-[18px]">
          {/* 모집 정보 */}
          <div className="text-[17px] font-extrabold text-ink-deep">
            {data.title || <span className="font-medium text-charcoal-3">모집명을 입력하세요</span>}
          </div>
          <div className="mb-4 mt-1 text-xs text-charcoal-3">
            {recruitmentPeriodLabel(data.startDate || '—', data.endDate)} · 정원 {data.capacity}명 · {targetLabel}
            {data.useInterview ? ' · 면접 진행' : ''}
          </div>

          {/* 안내문 */}
          {data.content && (
            <div className="mb-4">
              <div className="mb-2 text-xs font-bold text-ink-deep">모집 안내</div>
              <MarkdownProse content={data.content} className="text-[12.5px] leading-[1.65]" />
            </div>
          )}

          {isExternal ? (
            <>
              <div className="mb-3 flex items-center gap-2 rounded-[13px] border border-line bg-cream px-3.5 py-3">
                <span className="text-xl">🔗</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-bold text-ink-deep">외부 폼으로 지원해요</div>
                  <div className="truncate font-mono text-[11px] text-charcoal-3">
                    {data.externalFormUrl ? displayUrl(data.externalFormUrl) : '외부 폼 URL을 입력하세요'}
                  </div>
                </div>
              </div>
              <p className="mb-4 text-[11.5px] leading-relaxed text-charcoal-3">
                버튼을 누르면 새 창에서 외부 폼이 열려요. 제출은 해당 폼에서 완료됩니다.
              </p>
              <span className="btn btn-primary pointer-events-none w-full justify-center">지원 폼 열기 →</span>
            </>
          ) : (
            <>
              <div className="mb-3 text-xs font-bold text-ink-deep">지원서 · {data.questions.length}문항</div>
              <div className="mb-4 flex flex-col gap-3.5">
                {data.questions.map((question, index) => (
                  <div key={question.key}>
                    <div className="mb-1.5 text-[12.5px] font-bold leading-snug text-ink-deep">
                      {question.text || (
                        <span className="font-medium text-charcoal-3">질문 {index + 1} (미입력)</span>
                      )}{' '}
                      {question.required && <span className="text-coral">*</span>}
                    </div>
                    {question.type === 'TEXT' ? (
                      <div className="rounded-[10px] border border-line bg-cream px-3 py-2.5 text-xs text-charcoal-3">
                        답변을 입력하세요…
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {question.choices.map((choice, choiceIndex) => (
                          <div
                            key={choice.key}
                            className="flex items-center gap-2 rounded-[10px] border border-line bg-paper px-3 py-2 text-xs text-charcoal-2"
                          >
                            <span
                              className={`h-4 w-4 shrink-0 border-[1.5px] border-line ${
                                question.type === 'MULTIPLE_CHOICE' ? 'rounded-[5px]' : 'rounded-full'
                              }`}
                            />
                            {choice.label || (
                              <span className="text-charcoal-3">선택지 {choiceIndex + 1}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <span className="btn btn-primary pointer-events-none w-full justify-center">제출하기</span>
            </>
          )}
        </div>
      </div>

      <p className="mt-3 text-center text-[11.5px] leading-relaxed text-charcoal-3">
        {isExternal ? '외부 폼은 링크 안내만 노출돼요.' : '자체 폼은 지원자가 이 화면에서 바로 작성해요.'}
      </p>
    </div>
  );
}
```

주의: `bg-ink`/`to-ink-soft`는 tailwind config의 `ink.DEFAULT`/`ink.soft`(#1F4A36/#2E6149) — 존재 확인됨. `shadow-2`가 config에 없으면 `shadow-lg`로 대체.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/RecruitmentPreview.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/manage/clubs/'[clubId]'/recruitments/_components/RecruitmentPreview.tsx apps/web/test/manage/recruitments/RecruitmentPreview.test.tsx
git commit -m "feat(frontend): 지원자 시점 모집 미리보기 컴포넌트 추가"
```

---

### Task 6: `QuestionBuilder` 디자인 정비 (로직 무변경)

**Files:**
- Modify: `apps/web/app/manage/clubs/[clubId]/recruitments/_components/QuestionBuilder.tsx` (JSX 스타일만)
- Test: 기존 `test/manage/recruitment-form.test.tsx`·`recruitment-form-interview.test.tsx`가 회귀 가드 (쿼리 방식이 바뀌는 단언만 조정)

**Interfaces:**
- Consumes: `FormSegment`(Task 3).
- 조작 로직(추가/삭제/▲▼/유형 변경/필수/선택지 — `handle*` 함수 전부)과 `toBuilderQuestions`/`toQuestionItemsPayload`는 **한 글자도 수정 금지**.

- [ ] **Step 1: JSX 스타일 전환**

`QuestionBuilder`의 return JSX만 아래 방침으로 재작성한다(핸들러 호출·조건 분기·자료 흐름은 동일 유지):

- 질문 카드: `rounded-md border-slate-200` → `rounded-[13px] border border-line bg-paper p-3.5`
- 질문 텍스트 input: slate 클래스 → `rounded-[10px] border border-line bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage`
- 유형 선택: 기존 radio 3개 fieldset → `<FormSegment options={QUESTION_TYPE_OPTIONS} value={question.type} onChange={(type) => handleChangeType(question.key, type)} ariaLabel={`질문 ${index + 1} 유형`} />` (QUESTION_TYPE_OPTIONS는 이미 `{value,label}[]` 형태라 그대로 전달 가능)
- 필수 질문: 체크박스 유지(라벨 텍스트 "필수 질문" 유지 — 기존 테스트 호환), `accent-ink` 클래스 추가
- ▲/▼/✕ 버튼: 기능·aria-label 유지, 색만 `text-charcoal-3 hover:bg-graysoft` / 삭제 `text-coral hover:bg-coral/10`
- 선택지 input·삭제·"+ 선택지 추가"·"+ 질문 추가" 버튼: 듀잉 토큰(`border-dashed border-line text-charcoal-3 hover:border-charcoal-3 hover:text-charcoal`)으로 교체, 텍스트·aria-label 유지
- "선택지를 2개 이상 등록해주세요." 안내 문구 유지

- [ ] **Step 2: 기존 테스트 조정(검증 의도 보존)**

radio → FormSegment 전환으로 깨지는 단언만 조정한다. 예: 유형 선택 관련 `getByLabelText('객관식(단일 선택)')` 류 → `getByRole('radio', { name: '객관식(단일 선택)' })` (FormSegment가 role=radio + aria-checked이므로 `.toBeChecked()` 단언은 그대로 동작). 필수 질문·질문 input placeholder·▲▼ aria-label 단언은 무변경이어야 한다 — 바뀌면 구현이 계약을 깬 것.

- [ ] **Step 3: 테스트 통과 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitment-form.test.tsx test/manage/recruitment-form-interview.test.tsx`
Expected: 전체 PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/manage/clubs/'[clubId]'/recruitments/_components/QuestionBuilder.tsx apps/web/test/manage/recruitment-form.test.tsx apps/web/test/manage/recruitment-form-interview.test.tsx
git commit -m "feat(frontend): 질문 빌더 듀잉 토큰 리디자인 — 유형 세그먼트 전환"
```

---

### Task 7: `RecruitmentForm` 4섹션 재구성 + 그리드/Preview 통합

**Files:**
- Modify: `apps/web/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm.tsx`
- Test: 기존 폼 테스트 2파일 조정 + 신규 단언 추가

**Interfaces:**
- Consumes: `SectionCard`(T1), `FormSegment`/`FormSwitch`/`SettingRow`(T3), `RecruitmentPreview`(T5), `recruitmentStageLabels`(기존 `_lib`).
- Produces: `export const RECRUITMENT_FORM_ID = 'recruitment-form'` (Task 8 페이지 헤더 버튼이 `form` 속성으로 소비), `CreateMode`/`EditMode`에 `submitLabel: string` prop 추가.
- **상태·handleSubmit·가드 로직 무변경** (Task 2 반영분 제외). JSX만 재구성.

- [ ] **Step 1: 실패하는 테스트 작성** — `recruitment-form.test.tsx`에 구조 단언 추가:

```tsx
describe('RecruitmentForm — 4섹션 구조', () => {
  it('기본 정보 → 모집 설정 → 안내문 → 지원서 질문 섹션과 전형 단계 칩을 렌더한다', () => {
    render(<RecruitmentForm mode="create" submitLabel="모집 시작" onSubmit={vi.fn()} isPending={false} />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((el) => el.textContent);
    expect(headings).toEqual(['기본 정보', '모집 설정', '안내문', '지원서 질문']);
    // 면접 미사용 기본 상태 — 전형 칩은 서류→최종
    expect(screen.getByText('1. 서류')).toBeInTheDocument();
    expect(screen.getByText('2. 최종')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '모집 시작' })).toBeInTheDocument();
  });

  it('면접 진행 스위치를 켜면 전형 칩에 면접이 들어가고 기간 입력이 나타난다', () => {
    render(<RecruitmentForm mode="create" submitLabel="모집 시작" onSubmit={vi.fn()} isPending={false} />);
    fireEvent.click(screen.getByRole('switch', { name: '면접 진행' }));
    expect(screen.getByText('2. 면접')).toBeInTheDocument();
    expect(screen.getByLabelText('면접 시작일')).toBeInTheDocument();
  });

  it('외부 폼 선택 시 지원서 질문 섹션이 안내 배너로 대체된다', () => {
    render(<RecruitmentForm mode="create" submitLabel="모집 시작" onSubmit={vi.fn()} isPending={false} />);
    fireEvent.click(screen.getByRole('radio', { name: '외부 폼' }));
    expect(screen.getByText(/외부 폼 사용 중/)).toBeInTheDocument();
    expect(screen.queryByText('+ 질문 추가')).not.toBeInTheDocument();
  });
});
```

기존 테스트 전체에 `submitLabel` prop이 필수로 추가되므로, 기존 `render(<RecruitmentForm mode="create" ...>)` 호출부에 `submitLabel="모집 시작"`(create)/`submitLabel="수정 저장"`(edit)을 일괄 추가한다. 기존 라벨 단언(`'모집 작성'` 버튼)은 `'모집 시작'`으로 조정(Task 2에서 추가한 상시모집 케이스의 `'수정 저장'`은 그대로).

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitment-form.test.tsx`
Expected: FAIL (submitLabel prop 부재 타입 에러 또는 섹션 구조 부재)

- [ ] **Step 3: `RecruitmentForm.tsx` JSX 재구성**

Props 변경(두 모드 공통 필드 추가):

```tsx
type CreateMode = {
  mode: 'create';
  cloneSeed?: RecruitmentDetail;   // 기존 주석 유지
  submitLabel: string;             // 페이지가 결정: 모집 시작 | 복제하여 모집 시작
  onSubmit: (values: CreateFormValues) => Promise<void>;
  isPending: boolean;
};

type EditMode = {
  mode: 'edit';
  initialValues: RecruitmentDetail;
  submitLabel: string;             // 수정 저장
  onSubmit: (values: EditFormValues) => Promise<void>;
  isPending: boolean;
};
```

`export const RECRUITMENT_FORM_ID = 'recruitment-form';` 를 파일 상단에 export.

return JSX 전면 교체(상태 선언~handleSubmit은 그대로 두고 그 아래만). 구조:

```tsx
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
          {/* 제목 input (라벨 '제목 *', placeholder 기존 유지: '모집 공고 제목을 입력하세요') */}
          {/* 시작일/종료일 grid sm:grid-cols-2 — 기존 라벨 '시작일'/'종료일'·required·disabled(상시) 로직 유지 */}
          {/* 상시모집 체크박스(create만)·edit 상시 안내 문구 — 기존 그대로 */}
          {/* 정원 input — 기존 그대로 */}
        </SectionCard>

        {/* ② 모집 설정 */}
        <SectionCard number={2} title="모집 설정">
          <SettingRow title="모집 대상" desc="이번 모집으로 뽑는 구성원">
            {isEditMode ? (
              <span className="text-sm font-bold text-charcoal-2">
                {initialData?.targetRole === 'OFFICER' ? '운영진' : '부원'} <span className="ml-1 text-xs font-medium text-charcoal-3">(변경 불가)</span>
              </span>
            ) : (
              <FormSegment
                options={[{ value: 'MEMBER', label: '부원' }, { value: 'OFFICER', label: '운영진' }]}
                value={targetRole}
                onChange={setTargetRole}
                ariaLabel="모집 대상"
              />
            )}
          </SettingRow>

          <SettingRow title="지원 방식" desc="자체 폼으로 받을지, 외부 폼 링크를 안내할지">
            {isEditMode ? (
              <span className="text-sm font-bold text-charcoal-2">
                {initialData?.applicationMode === 'EXTERNAL' ? '외부 폼' : '자체 폼'} <span className="ml-1 text-xs font-medium text-charcoal-3">(변경 불가)</span>
              </span>
            ) : (
              <FormSegment
                options={[{ value: 'SELF', label: '자체 폼' }, { value: 'EXTERNAL', label: '외부 폼' }]}
                value={applicationMode}
                onChange={setApplicationMode}
                ariaLabel="지원 방식"
              />
            )}
          </SettingRow>

          {/* 외부 폼 URL — create+EXTERNAL: sage-tint 박스에 URL input(라벨 '외부 폼 URL *', 기존 placeholder)
              + 안내: "외부 폼 사용 시 지원서 질문 기능은 사용하지 않아요. 지원자는 링크로 이동해 작성합니다." */}
          {/* edit+EXTERNAL: URL 표시 + "URL은 변경할 수 없어요. 잘못 입력했다면 마감 후 새 모집을 만들어주세요." 안내 */}

          <SettingRow title="면접 진행" desc="서류 후 면접 전형을 둘지 여부">
            <FormSwitch checked={useInterview} onChange={setUseInterview} ariaLabel="면접 진행" />
          </SettingRow>
          {/* useInterview 시: 면접 시작일/종료일 grid (기존 라벨 '면접 시작일'/'면접 종료일' 유지) */}
          {/* 전형 단계 파생 칩 — 편집 불가 표시 전용 */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-charcoal-3">전형 단계</span>
            {stageLabels.map((stage, index) => (
              <span key={stage} className="rounded-full bg-sage-tint px-3 py-1.5 text-xs font-semibold text-charcoal-2">
                {index + 1}. {stage}
              </span>
            ))}
          </div>

          <div className="mt-2.5">
            <SettingRow title="지원자 수 공개" desc="모집 페이지에 현재 지원자 수를 학생에게 보여줄지">
              <FormSwitch checked={showApplicantCount} onChange={setShowApplicantCount} ariaLabel="지원자 수 공개" />
            </SettingRow>
          </div>
        </SectionCard>

        {/* ③ 안내문 */}
        <SectionCard
          number={3}
          title="안내문"
          description="학생 지원 화면 상단에 노출돼요. Markdown(제목·리스트·강조·링크)을 쓸 수 있어요."
        >
          {/* content textarea rows=8 — 기존 placeholder를 '동아리 소개, 가입 후 일정, 회비 안내 등 지원 전에 알아야 할 내용을 적어주세요' 로 교체 */}
        </SectionCard>

        {/* ④ 지원서 질문 */}
        <SectionCard number={4} title="지원서 질문" description="자체 폼으로 받을 때 지원자가 작성할 항목이에요.">
          {/* isSelfForm && isLegacyQuestionsBackend: 기존 읽기 전용 안내 블록 그대로 */}
          {/* isSelfForm && !legacy: QuestionBuilder (기존 그대로) */}
          {/* !isSelfForm(EXTERNAL): 안내 배너 —
              "외부 폼 사용 중 — 지원서 질문 기능은 사용하지 않아요. 질문은 외부 폼에서 관리해주세요." (bg-graysoft rounded-md p-4 text-sm text-charcoal-2) */}
        </SectionCard>

        {/* 오류 + 하단 제출 (기존 에러 표시 로직 유지, 버튼 라벨만 submitLabel) */}
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
    </div>
  );
```

위 스켈레톤의 주석 자리는 **기존 JSX 블록을 듀잉 토큰으로만 재스타일해 그대로 옮긴다** — input 클래스는 `rounded-[10px] border border-line bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage`, 라벨은 `text-[12.5px] font-bold text-charcoal-2`, 필수 별표는 `text-coral`. 라벨 텍스트·placeholder·required·disabled 조건은 전부 기존 그대로(테스트 계약). `fieldLabelClass`/`fieldInputClass` 상수를 새 토큰으로 교체하는 방식이 diff를 최소화한다.

- [ ] **Step 4: 기존 테스트 조정**

- 지원 방식·모집 대상: radio→FormSegment이므로 `getByLabelText('외부 폼')`/`getByLabelText('운영진')` → `getByRole('radio', { name: ... })` (`.toBeChecked()` 유지).
- 면접 진행·지원자 수 공개: checkbox→switch이므로 `getByLabelText('면접 진행')` 류 → `getByRole('switch', { name: '면접 진행' })`.
- 상시모집 체크박스·시작일/종료일·면접 시작일/종료일 `getByLabelText` 단언은 무변경(라벨 유지 계약).
- interview 테스트 파일도 동일 방침.

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitment-form.test.tsx test/manage/recruitment-form-interview.test.tsx test/manage/recruitments/`
Expected: 전체 PASS. `pnpm --filter @duing/web typecheck` 클린 (new/edit 페이지가 아직 submitLabel을 안 넘겨 타입 에러가 나면 이 태스크에서 두 페이지에 최소 라인(`submitLabel="모집 시작"`/`"수정 저장"`)만 먼저 추가한다 — 전면 재작성은 Task 8).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/manage/clubs/'[clubId]'/recruitments/_components/RecruitmentForm.tsx apps/web/app/manage/clubs/'[clubId]'/recruitments/new/page.tsx apps/web/app/manage/clubs/'[clubId]'/recruitments/'[recruitmentId]'/edit/page.tsx apps/web/test/manage/recruitment-form.test.tsx apps/web/test/manage/recruitment-form-interview.test.tsx
git commit -m "feat(frontend): 모집 작성 폼 4섹션 카드·Sticky Preview 구조로 리디자인"
```

---

### Task 8: `new`/`edit` 페이지 재작성 — 헤더 액션·클론 배너·버튼명

**Files:**
- Modify: `apps/web/app/manage/clubs/[clubId]/recruitments/new/page.tsx`
- Modify: `apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/edit/page.tsx`
- Test: `apps/web/test/manage/recruitments/recruitment-clone.test.tsx` (버튼명·배너 단언 조정/추가)

**Interfaces:**
- Consumes: `RECRUITMENT_FORM_ID`·`submitLabel`(T7). 헤더 제출 버튼은 `<button form={RECRUITMENT_FORM_ID} type="submit">`로 폼 밖에서 제출.
- 버튼명: 생성 "모집 시작" / 복제 "복제하여 모집 시작" / 수정 "수정 저장". 취소: 생성·복제→`/manage/clubs/{clubId}/recruitments`, 수정→`/manage/clubs/{clubId}/recruitments/{id}`.

- [ ] **Step 1: 실패하는 테스트 작성** — `recruitment-clone.test.tsx`에 단언 추가/조정:

```tsx
  // 기존 케이스 1(빈 폼)에 추가:
  expect(screen.getAllByRole('button', { name: '모집 시작' }).length).toBeGreaterThanOrEqual(1);
  expect(screen.getByRole('link', { name: '취소' })).toHaveAttribute('href', '/manage/clubs/1/recruitments');

  // 기존 케이스 2(cloneFrom)에 추가:
  expect(screen.getAllByRole('button', { name: '복제하여 모집 시작' }).length).toBeGreaterThanOrEqual(1);
  expect(screen.getByRole('link', { name: '9기 신입 모집' })).toHaveAttribute(
    'href',
    '/manage/clubs/1/recruitments/9',
  );
```

(next/link·toRoute mock은 파일 기존 패턴 재사용. 원본 제목 링크는 클론 배너 안에 있다.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/recruitment-clone.test.tsx`
Expected: FAIL

- [ ] **Step 3: `new/page.tsx` 재작성**

기존 구조(파라미터·cloneFrom 처리·handleSubmit·LoadingGate 게이트)는 유지하고 렌더만 교체:

```tsx
  const submitLabel = cloneSource ? '복제하여 모집 시작' : '모집 시작';

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-9">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-ink-deep">
          {cloneSource ? '모집 양식 복제' : '신규 모집 작성'}
        </h1>
        <div className="flex items-center gap-2">
          <Link href={toRoute(`/manage/clubs/${clubId}/recruitments`)} className="btn btn-secondary">
            취소
          </Link>
          <button
            type="submit"
            form={RECRUITMENT_FORM_ID}
            disabled={createRecruitment.isPending}
            className="btn btn-primary disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </header>

      {cloneSource && (
        <div className="mb-5 rounded-[13px] border border-line bg-sage-tint px-4 py-3 text-[12.5px] leading-relaxed text-charcoal-2">
          <Link
            href={toRoute(`/manage/clubs/${clubId}/recruitments/${cloneSource.id}`)}
            className="font-bold text-ink-deep hover:underline"
          >
            {cloneSource.title}
          </Link>
          의 양식을 복제해 새 모집을 작성합니다. 원본 모집은 변경되지 않으며, 모집 기간은 새로 입력해주세요.
        </div>
      )}

      <RecruitmentForm
        mode="create"
        cloneSeed={cloneSource}
        submitLabel={submitLabel}
        onSubmit={handleSubmit}
        isPending={createRecruitment.isPending}
      />
    </div>
  );
```

import 추가: `Link`(next/link), `RECRUITMENT_FORM_ID`. 기존 배너 문구 테스트(`/원본 모집은 변경되지 않으며/`)는 새 배너에도 포함되므로 그대로 통과해야 한다.

- [ ] **Step 4: `edit/page.tsx` 재작성**

동일 프레임: 제목 "모집 수정", 취소 → 상세(`/manage/clubs/{clubId}/recruitments/{recruitmentId}`), 헤더 제출 버튼 `수정 저장`(`form={RECRUITMENT_FORM_ID}`, `disabled={updateRecruitment.isPending}`), CLOSED 가드 블록은 기존 유지, `<RecruitmentForm mode="edit" submitLabel="수정 저장" ... />`. 컨테이너 `max-w-[1240px] px-6 py-9`.

- [ ] **Step 5: 테스트 통과 + 회귀**

Run: `pnpm --filter @duing/web test -- run test/manage/recruitments/ test/manage/recruitment-form.test.tsx test/manage/recruitment-form-interview.test.tsx`
Expected: 전체 PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/manage/clubs/'[clubId]'/recruitments/new/page.tsx apps/web/app/manage/clubs/'[clubId]'/recruitments/'[recruitmentId]'/edit/page.tsx apps/web/test/manage/recruitments/recruitment-clone.test.tsx
git commit -m "feat(frontend): 모집 작성·수정 페이지 헤더 액션·클론 배너 리디자인"
```

---

### Task 9: 전체 검증 + 실브라우저 QA

**Files:** 없음(코드 변경 없음).

- [ ] **Step 1: 타입 체크** — `pnpm --filter @duing/web typecheck && pnpm --filter @duing/schemas build 2>/dev/null || pnpm --filter @duing/schemas typecheck 2>/dev/null || true` → 에러 없음
- [ ] **Step 2: 린트** — `pnpm --filter @duing/web lint` → 에러 없음
- [ ] **Step 3: 전체 테스트** — `pnpm --filter @duing/web test -- --run` → 전체 PASS
- [ ] **Step 4: 빌드** — `pnpm --filter @duing/web build` (로컬 `.env.local` HTTPS fail-fast 시 CI 동등 env 주입 — 직전 프로젝트 Task 9와 동일 방식) → 성공
- [ ] **Step 5: 실브라우저 QA** (dev 서버 :3000, 백엔드 :8080 — 좀비 정리·파일 리다이렉트·종료 후 PORTS_FREE 확인 절차는 직전 프로젝트 Task 9와 동일)

체크리스트(각 항목 스크린샷):
- 새 모집 작성: 4섹션 카드 렌더, xl에서 우측 Preview 표시·스크롤 시 sticky, xl 미만(1024px 이하)에서 Preview 숨김
- 제목·질문 입력이 Preview에 실시간 반영, 지원 방식 세그 전환 시 ④섹션·Preview 동기 전환
- 안내문에 Markdown(`## 제목`, `- 리스트`, `**강조**`, 링크) 입력 → Preview 렌더 확인
- 면접 진행 스위치 → 전형 칩 서류→면접→최종 전환
- 상단/하단 제출 버튼 모두 동작(상단 버튼이 form 속성으로 제출), 취소 링크 이동
- 복제 진입: 배너의 원본 링크, "복제하여 모집 시작" 버튼명
- 수정 진입: 잠금 표시(대상·방식), "수정 저장", **상시모집 공고 수정 저장 성공**(Task 2 버그 픽스 실검증 — 시드 데이터에 상시모집 CLOSED가 아닌 건이 없으면 확인 불가로 기록)
- 학생 apply 화면: 안내문이 질문보다 먼저 Markdown 렌더
- [ ] **Step 6: Commit 없음** — 문제 발견 시 해당 Task로 돌아가 수정.
