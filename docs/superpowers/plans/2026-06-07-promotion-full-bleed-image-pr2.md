# FULL_BLEED_IMAGE PR2 — 어드민 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec `docs/superpowers/specs/2026-06-07-promotion-full-bleed-image-design.md` §6 의 어드민 UI 단계를 구현한다 — 폼 최상단 모드 라디오, Alt Text input, 모드 전환 가드, 이미지 권장 비율 경고, 모드별 라이브 미리보기 분기, 어드민 목록 모드 배지.

**Architecture:** 프론트엔드 단독 변경. PR1 (`#278`) 머지로 백엔드 응답이 이미 `renderMode` / `imageAltText` 를 노출 중이므로 폼 state 와 submit payload 만 새 필드를 흘려보내면 된다. 공개 렌더링(BannerCarousel) 은 PR3 에서. 어드민 폼의 \"입력 UI 자체는 항상 유지, 의미만 모드별로 분기\" 원칙(spec §6.2) 을 그대로 따른다 — 모드 토글이 입력 데이터를 삭제하지 않는다.

**Tech Stack:** Next.js 15 / React 19 / TypeScript / Tailwind / TanStack Query / Vitest + React Testing Library / pnpm workspaces.

**Branch:** `feat/promotion-full-bleed-admin-ui` (cut from latest develop)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx` | 모드 라디오, Alt Text input, 전환 가드, 권장 비율 경고, 라이브 미리보기 분기, submit 매핑 |
| Modify | `frontend/apps/web/app/admin/promotions/_components/AdminPromotionsTable.tsx` | 유형 컬럼 + SYSTEM/FULL_BLEED 배지 |
| Modify | `frontend/apps/web/app/admin/promotions/_lib/promotionLabels.ts` | RENDER_MODE_LABEL / RENDER_MODE_BADGE_CLASS 매핑 |
| Create | `frontend/apps/web/test/admin/promotions/admin-promotion-form-render-mode.test.tsx` | 모드 라디오 / 가드 / 미리보기 분기 / 권장 비율 경고 RTL 테스트 |
| Create | `frontend/apps/web/test/admin/promotions/admin-promotions-table-render-mode.test.tsx` | 목록 테이블 유형 배지 표시 RTL 테스트 |

`AdminPromotionForm.tsx` 가 본 PR 로 ~700줄 수준이 되지만 단일 책임(어드민 배너 폼) 이라 split 없이 진행. 700줄을 넘기 시작하면 후속 리팩토링 PR 에서 `_components/` 하위로 섹션 분리를 고려한다.

---

## Task 0: 브랜치 생성

**Files:** none

- [ ] **Step 1: develop 동기화 + 브랜치 생성**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop
git pull origin develop
git checkout -b feat/promotion-full-bleed-admin-ui
```

Expected: `Switched to a new branch 'feat/promotion-full-bleed-admin-ui'`

---

## Task 1: FormState 확장 + 모드 라디오 + submit 매핑

**Files:**
- Modify: `frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx`

- [ ] **Step 1: import 갱신**

`'use client'` 다음 import 영역에서 `@duing/types` import 에 `PromotionRenderMode` 추가:

```tsx
import type {
  AdminPromotionSummary,
  CreatePromotionPayload,
  PromotionPalette,
  PromotionRenderMode,
  UpdatePromotionPayload,
} from '@duing/types';
```

- [ ] **Step 2: FormState 에 두 필드 추가**

기존 `FormState` (line 34 근처) 의 끝에 `renderMode`, `imageAltText` 추가:

```tsx
type FormState = {
  // ... 기존 필드들 ...
  scheduleMode: ScheduleMode;
  startAt: string;
  endAt: string;
  renderMode: PromotionRenderMode;
  imageAltText: string;
};
```

- [ ] **Step 3: buildInitialState 갱신**

create 분기 (`if (!initialValues)` 안) 끝에:

```tsx
scheduleMode: 'ALWAYS',
startAt: '',
endAt: '',
renderMode: 'SYSTEM_COMPOSED',
imageAltText: '',
```

edit 분기 (`return { ... };` 안) 끝에:

```tsx
scheduleMode: hasSchedule ? 'SCHEDULED' : 'ALWAYS',
startAt: toDateTimeLocalValue(initialValues.startAt),
endAt: toDateTimeLocalValue(initialValues.endAt),
renderMode: initialValues.renderMode,
imageAltText: initialValues.imageAltText ?? '',
```

- [ ] **Step 4: 모드 라디오 UI 폼 최상단 삽입**

`<form onSubmit={handleSubmit} className=\"space-y-6\">` 다음 줄에 첫 섹션으로 추가 (제목 입력 위):

```tsx
{/* 배너 유형 (모드 선택) — 가장 먼저 결정해야 다른 필드 의미가 정해진다. */}
<div className="space-y-2">
  <span className="block text-[12.5px] font-semibold text-charcoal-2">배너 유형</span>
  <div className="flex flex-col gap-2 text-[13.5px]">
    <label className="inline-flex items-start gap-2">
      <input
        type="radio"
        name="renderMode"
        checked={state.renderMode === 'SYSTEM_COMPOSED'}
        onChange={() => update('renderMode', 'SYSTEM_COMPOSED')}
        className="mt-1"
      />
      <div>
        <div className="font-semibold">시스템 조합형</div>
        <div className="text-charcoal-3 text-[12px]">제목/부제목/CTA/팔레트를 자동 조합해 렌더링합니다.</div>
      </div>
    </label>
    <label className="inline-flex items-start gap-2">
      <input
        type="radio"
        name="renderMode"
        checked={state.renderMode === 'FULL_BLEED_IMAGE'}
        onChange={() => update('renderMode', 'FULL_BLEED_IMAGE')}
        className="mt-1"
      />
      <div>
        <div className="font-semibold">완성 이미지형</div>
        <div className="text-charcoal-3 text-[12px]">업로드한 이미지를 가공 없이 그대로 노출합니다 (포스터/홍보물).</div>
      </div>
    </label>
  </div>
</div>
```

- [ ] **Step 5: handleSubmit 의 create 페이로드에 두 필드 추가**

`mode === 'create'` 분기의 payload 객체 끝에 (`emoji` 필드 다음, 닫는 중괄호 전):

```tsx
emoji: trimToNull(state.emoji),
startAt: scheduledStart,
endAt: scheduledEnd,
renderMode: state.renderMode,
imageAltText: trimToNull(state.imageAltText),
```

- [ ] **Step 6: handleSubmit 의 update 페이로드 매핑**

`else` (edit 모드) 분기에서 기존 `payload` 초기 객체에 `renderMode` 추가, 그리고 `imageAltText` 는 다른 nullable 필드와 동일한 assignOrClear 패턴 적용. 기존 `// 텍스트 필드들 — 동일 패턴.` 블록 다음에 다음 두 줄 추가:

```tsx
// renderMode 는 항상 명시적으로 전송 — 백엔드는 null=변경 안 함이지만 폼 state 에는 항상 값이 있다.
payload.renderMode = state.renderMode;

// Alt Text 는 nullable 필드와 동일한 assign-or-clear 패턴.
const altTrimmed = state.imageAltText.trim();
if (altTrimmed.length === 0) {
  if (initialValues.imageAltText !== null) payload.clearImageAltText = true;
} else {
  payload.imageAltText = altTrimmed;
}
```

- [ ] **Step 7: typecheck 통과 확인**

Run: `cd frontend && pnpm --filter web typecheck`
Expected: 종료 코드 0, `tsc --noEmit` 통과.

- [ ] **Step 8: 커밋**

```bash
git add frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx
git commit -m "feat(promotion): 어드민 폼 최상단 모드 라디오 + renderMode/imageAltText state·submit 매핑"
```

---

## Task 2: Alt Text input + 모드별 헬프 텍스트

**Files:**
- Modify: `frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx`

- [ ] **Step 1: Alt Text input 섹션 추가**

배너 이미지 섹션(`<ImageUploader ... />` 가 있는 블록) 바로 다음에 새 섹션을 삽입:

```tsx
{/* Alt Text — 완성 이미지형에서는 필수, 시스템 조합형에서는 보존만 (입력 UI 는 항상 유지). */}
<Field label={`Alt Text ${state.renderMode === 'FULL_BLEED_IMAGE' ? '(필수)' : '(선택)'}`}>
  <input
    type="text"
    maxLength={200}
    value={state.imageAltText}
    onChange={(event) => update('imageAltText', event.target.value)}
    placeholder="2026 AI 학과 해커톤 참가자 모집"
    className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
  />
  <p className="mt-1 text-[12px] text-charcoal-3">
    {state.renderMode === 'FULL_BLEED_IMAGE'
      ? '포스터에 표시된 핵심 텍스트(제목, 일정 등) 를 그대로 적어주세요. 스크린리더와 SEO 가 이 텍스트를 읽습니다.'
      : '완성 이미지형 배너로 전환할 때 접근성·SEO 용도로 사용됩니다. 지금 입력해두면 모드 전환 시 자동 적용됩니다.'}
  </p>
</Field>
```

- [ ] **Step 2: typecheck**

Run: `cd frontend && pnpm --filter web typecheck`
Expected: 종료 코드 0.

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx
git commit -m "feat(promotion): 어드민 폼에 Alt Text input + 모드별 헬프 텍스트"
```

---

## Task 3: 모드 전환 인라인 경고 가드

**Files:**
- Modify: `frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx`

- [ ] **Step 1: 모드 라디오 섹션 바로 아래에 두 가드 추가**

Task 1 에서 추가한 \"배너 유형\" 섹션의 닫는 `</div>` 바로 다음에 두 가드를 추가:

```tsx
{/* FULL_BLEED 전환 가드 — 필수 필드가 비어 있을 때 인라인 경고 (저장은 백엔드 422 로 차단). */}
{state.renderMode === 'FULL_BLEED_IMAGE' && state.bannerImageUrl.trim() === '' && (
  <p className="rounded-md bg-coral/10 border border-coral/40 px-3 py-2 text-[12.5px] text-coral">
    완성 이미지형으로 전환하려면 배너 이미지 업로드가 필요합니다.
  </p>
)}
{state.renderMode === 'FULL_BLEED_IMAGE' && state.imageAltText.trim() === '' && (
  <p className="rounded-md bg-coral/10 border border-coral/40 px-3 py-2 text-[12.5px] text-coral">
    완성 이미지형으로 전환하려면 Alt Text 입력이 필요합니다.
  </p>
)}
```

두 가드는 독립적으로 동시 노출 가능 (둘 다 비어 있으면 두 줄 표시).

- [ ] **Step 2: typecheck**

Run: `cd frontend && pnpm --filter web typecheck`
Expected: 종료 코드 0.

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx
git commit -m "feat(promotion): FULL_BLEED 전환 시 이미지/Alt Text 미입력 인라인 가드"
```

---

## Task 4: 이미지 권장 비율 측정 + 경고

**Files:**
- Modify: `frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx`

- [ ] **Step 1: 이미지 dimension 측정 hook + 권장 비율 계산**

`import { useEffect, useState } from 'react';` 로 `useEffect` 추가 (이미 useState 만 import 중일 가능성).

`AdminPromotionForm` 함수 컴포넌트 본문에서 기존 `useState<FormState>(...)` 다음에 dimension state + effect 추가:

```tsx
// 권장 비율(1920×840, 16:7) 측정 — FULL_BLEED 모드에서만 경고 노출.
const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

useEffect(() => {
  if (!state.bannerImageUrl) {
    setImageDimensions(null);
    return;
  }
  const img = new window.Image();
  img.onload = () => setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
  img.onerror = () => setImageDimensions(null);
  img.src = state.bannerImageUrl;
}, [state.bannerImageUrl]);
```

`window.Image` 를 쓰는 이유: SSR / Next 환경에서 `new Image()` 가 노드의 Image 와 충돌하는 것 회피.

- [ ] **Step 2: 권장 비율 미달 경고 계산**

dimension 측정 다음 줄에 계산 로직 추가:

```tsx
const imageSizeWarning = (() => {
  if (state.renderMode !== 'FULL_BLEED_IMAGE') return null;
  if (!imageDimensions) return null;
  const { width, height } = imageDimensions;
  const shortSide = Math.min(width, height);
  const ratio = width / height;
  const targetRatio = 16 / 7;
  const tolerancePercent = 0.1;
  const ratioOff = Math.abs(ratio - targetRatio) / targetRatio > tolerancePercent;
  const tooSmall = shortSide < 840;
  if (!ratioOff && !tooSmall) return null;
  return `권장 사이즈(1920×840, 16:7) 와 다릅니다 — 모바일에서 이미지 일부가 잘릴 수 있습니다.`;
})();
```

- [ ] **Step 3: 경고 메시지 노출 위치**

`<ImageUploader ... />` 바로 다음 (배너 이미지 섹션 안, 기존 가이드 문구 옆) 에 경고 노출:

```tsx
{imageSizeWarning && (
  <p className="mt-1 text-[12px] text-warning">
    {imageSizeWarning}
  </p>
)}
```

만약 `text-warning` 토큰이 프로젝트에 없으면 `text-amber-600` 또는 인라인 `style={{ color: '#B45309' }}` 로 대체. 기존 코드의 색상 토큰 (`text-coral`, `text-charcoal-3`) 패턴을 grep 으로 확인 후 결정.

- [ ] **Step 4: typecheck**

Run: `cd frontend && pnpm --filter web typecheck`
Expected: 종료 코드 0.

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx
git commit -m "feat(promotion): FULL_BLEED 모드에서 권장 이미지 비율(16:7, 1920×840) 즉시 경고"
```

---

## Task 5: 라이브 미리보기 모드별 분기

**Files:**
- Modify: `frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx`

- [ ] **Step 1: 기존 라이브 미리보기 박스를 mode 분기로 감싸기**

기존 `{/* 라이브 미리보기 */}` 주석부터 시작하는 `<div>` 블록을 찾아, 기존 SYSTEM_COMPOSED 미리보기 div 를 `state.renderMode === 'SYSTEM_COMPOSED'` 분기 안으로 옮기고 FULL_BLEED 분기를 추가:

```tsx
{/* 라이브 미리보기 — 모드별 분기 */}
<div>
  <span className="block text-[12.5px] font-semibold text-charcoal-2 mb-1.5">미리보기</span>
  {state.renderMode === 'FULL_BLEED_IMAGE' ? (
    <div className="relative h-[200px] overflow-hidden rounded-xl bg-graysoft">
      {state.bannerImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드 스토리지 URL. 깨지면 회색 배경이 그대로 노출되도록 onError 에서 숨김.
        <img
          src={state.bannerImageUrl}
          alt={state.imageAltText || ''}
          className="block h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-charcoal-3 text-[13px]">
          배너 이미지를 업로드해주세요
        </div>
      )}
      {state.bannerImageUrl && state.imageAltText.trim() === '' && (
        <span className="absolute right-2 top-2 rounded bg-coral/90 px-2 py-1 text-[11px] font-bold text-paper">
          ⚠ Alt 미입력
        </span>
      )}
    </div>
  ) : (
    <div
      className="relative flex h-[200px] flex-col justify-between overflow-hidden rounded-xl px-8 py-7"
      style={{
        background: previewStyle.bg,
        color: hasBannerImage ? '#fff' : previewStyle.fg,
      }}
    >
      {/* ↑ 기존 SYSTEM_COMPOSED 미리보기 내용 그대로 (이미지/그라데이션/이모지/태그/제목/부제/CTA) — 들여쓰기만 조정 */}
    </div>
  )}
</div>
```

기존 SYSTEM_COMPOSED 미리보기 div 의 내부 JSX (이미지/그라데이션/이모지/태그/제목/CTA) 는 그대로 옮기되, 들여쓰기만 조정하면 된다. **기존 내용을 절대 삭제하지 마세요** — 단순히 `{state.renderMode === 'FULL_BLEED_IMAGE' ? <FullBleed/> : <Existing/>}` 의 else 분기로 감쌉니다.

- [ ] **Step 2: typecheck + lint**

Run: `cd frontend && pnpm --filter web typecheck`
Expected: 0.

Run: `cd frontend && pnpm --filter web lint 2>&1 | grep -E "Warning|Error" | head -5`
Expected: 기존 경고만 (PromotionPalette unused, no-img-element on existing files), 신규 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx
git commit -m "feat(promotion): 라이브 미리보기를 모드별로 분기 (FULL_BLEED 는 이미지만 + Alt 미입력 배지)"
```

---

## Task 6: 어드민 목록 RenderMode 배지

**Files:**
- Modify: `frontend/apps/web/app/admin/promotions/_lib/promotionLabels.ts`
- Modify: `frontend/apps/web/app/admin/promotions/_components/AdminPromotionsTable.tsx`

- [ ] **Step 1: promotionLabels.ts 에 RenderMode 매핑 추가**

`frontend/apps/web/app/admin/promotions/_lib/promotionLabels.ts` 의 끝 (이미 있는 export 들 다음) 에 추가:

```ts
import type { PromotionRenderMode } from '@duing/types';

export const RENDER_MODE_LABEL: Record<PromotionRenderMode, string> = {
  SYSTEM_COMPOSED: 'SYSTEM',
  FULL_BLEED_IMAGE: 'FULL_BLEED',
};

export const RENDER_MODE_BADGE_CLASS: Record<PromotionRenderMode, string> = {
  SYSTEM_COMPOSED: 'bg-graysoft text-charcoal-3',
  FULL_BLEED_IMAGE: 'bg-ink text-paper',
};
```

- [ ] **Step 2: AdminPromotionsTable.tsx 의 헤더에 유형 컬럼 추가**

기존 `<Th>` 들 중 `<Th>상태</Th>` 또는 `<Th>활성</Th>` 다음에 한 줄 추가:

```tsx
<Th>유형</Th>
```

- [ ] **Step 3: 각 행에 배지 셀 추가**

기존 상태 셀 (`getDisplayStatusBadgeClass` / `getDisplayStatusLabel` 또는 그 시점에 존재하는 패턴) 다음에 다음 `<Td>` 추가:

```tsx
<Td>
  <span
    className={`inline-block px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${RENDER_MODE_BADGE_CLASS[promotion.renderMode]}`}
  >
    {RENDER_MODE_LABEL[promotion.renderMode]}
  </span>
</Td>
```

`promotionLabels` 모듈의 새 export 두 개 import 도 갱신:

```ts
import {
  CURATION_LABEL,
  DISPLAY_STATUS_BADGE_CLASS,
  DISPLAY_STATUS_LABEL,
  RENDER_MODE_BADGE_CLASS,
  RENDER_MODE_LABEL,
  resolveDisplayStatus,
} from '../_lib/promotionLabels';
```

- [ ] **Step 4: typecheck + lint**

Run: `cd frontend && pnpm --filter web typecheck`
Expected: 0.

Run: `cd frontend && pnpm --filter web lint 2>&1 | grep -E "Warning|Error" | head -5`
Expected: 기존 경고만.

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/promotions/_lib/promotionLabels.ts \
        frontend/apps/web/app/admin/promotions/_components/AdminPromotionsTable.tsx
git commit -m "feat(promotion): 어드민 목록에 SYSTEM/FULL_BLEED 유형 배지 컬럼 추가"
```

---

## Task 7: 폼 / 목록 단위 테스트

**Files:**
- Create: `frontend/apps/web/test/admin/promotions/admin-promotion-form-render-mode.test.tsx`
- Create: `frontend/apps/web/test/admin/promotions/admin-promotions-table-render-mode.test.tsx`

- [ ] **Step 1: 폼 테스트 디렉터리 생성**

```bash
mkdir -p frontend/apps/web/test/admin/promotions
```

- [ ] **Step 2: 폼 테스트 작성**

`frontend/apps/web/test/admin/promotions/admin-promotion-form-render-mode.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../app/_components/ImageUploader', () => ({
  ImageUploader: (props: { value: string; onChange: (url: string) => void }) => (
    <input
      data-testid="banner-uploader"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  ),
}));

vi.mock('../../../app/admin/promotions/_components/ClubSelector', () => ({
  ClubSelector: () => <div data-testid="club-selector" />,
}));

import { AdminPromotionForm } from '../../../app/admin/promotions/_components/AdminPromotionForm';

function renderCreateForm() {
  return render(
    <AdminPromotionForm
      mode="create"
      isSubmitting={false}
      onSubmit={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

describe('AdminPromotionForm — renderMode UI', () => {
  it('초기 렌더는 SYSTEM_COMPOSED 라디오가 선택돼 있다', () => {
    renderCreateForm();
    const systemRadio = screen.getByRole('radio', { name: /시스템 조합형/ });
    expect(systemRadio).toBeChecked();
    expect(screen.getByRole('radio', { name: /완성 이미지형/ })).not.toBeChecked();
  });

  it('FULL_BLEED 라디오를 선택하면 이미지/Alt Text 가드가 노출된다', () => {
    renderCreateForm();
    fireEvent.click(screen.getByRole('radio', { name: /완성 이미지형/ }));
    expect(
      screen.getByText(/배너 이미지 업로드가 필요합니다/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Alt Text 입력이 필요합니다/),
    ).toBeInTheDocument();
  });

  it('FULL_BLEED + 이미지 입력 시 이미지 가드는 사라지지만 Alt 가드는 남는다', () => {
    renderCreateForm();
    fireEvent.click(screen.getByRole('radio', { name: /완성 이미지형/ }));
    fireEvent.change(screen.getByTestId('banner-uploader'), {
      target: { value: 'https://example.com/poster.png' },
    });
    expect(
      screen.queryByText(/배너 이미지 업로드가 필요합니다/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Alt Text 입력이 필요합니다/),
    ).toBeInTheDocument();
  });

  it('FULL_BLEED + 이미지 + Alt 모두 입력 시 가드가 모두 사라진다', () => {
    renderCreateForm();
    fireEvent.click(screen.getByRole('radio', { name: /완성 이미지형/ }));
    fireEvent.change(screen.getByTestId('banner-uploader'), {
      target: { value: 'https://example.com/poster.png' },
    });
    fireEvent.change(screen.getByPlaceholderText(/2026 AI 학과 해커톤/), {
      target: { value: '2026 해커톤 포스터' },
    });
    expect(
      screen.queryByText(/배너 이미지 업로드가 필요합니다/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Alt Text 입력이 필요합니다/),
    ).not.toBeInTheDocument();
  });

  it('SYSTEM_COMPOSED 모드에서는 어떤 입력 상태라도 FULL_BLEED 전용 가드는 노출되지 않는다', () => {
    renderCreateForm();
    expect(
      screen.queryByText(/배너 이미지 업로드가 필요합니다/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Alt Text 입력이 필요합니다/),
    ).not.toBeInTheDocument();
  });

  it('SYSTEM_COMPOSED 에서 입력한 Alt Text 가 FULL_BLEED 로 전환해도 보존된다', () => {
    renderCreateForm();
    fireEvent.change(screen.getByPlaceholderText(/2026 AI 학과 해커톤/), {
      target: { value: '미리 입력한 alt' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /완성 이미지형/ }));
    expect(screen.getByDisplayValue('미리 입력한 alt')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 목록 테스트 작성**

`frontend/apps/web/test/admin/promotions/admin-promotions-table-render-mode.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminPromotionSummary } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('../../../app/_components/ImageWithFallback', () => ({
  ImageWithFallback: () => <div data-testid="image-fallback" />,
}));

import { AdminPromotionsTable } from '../../../app/admin/promotions/_components/AdminPromotionsTable';

function makeRow(overrides: Partial<AdminPromotionSummary>): AdminPromotionSummary {
  return {
    id: 1,
    club: null,
    title: '테스트 배너',
    bannerImageUrl: null,
    linkUrl: null,
    active: true,
    displayOrder: 0,
    createdBy: { id: 99, name: '관리자' },
    createdAt: '2026-06-01T00:00:00',
    updatedAt: '2026-06-01T00:00:00',
    tag: null,
    subtitle: null,
    ctaLabel: null,
    emoji: null,
    palette: 'INK',
    startAt: null,
    endAt: null,
    renderMode: 'SYSTEM_COMPOSED',
    imageAltText: null,
    ...overrides,
  };
}

describe('AdminPromotionsTable — renderMode 배지', () => {
  it('SYSTEM_COMPOSED 행은 SYSTEM 배지가 표시된다', () => {
    render(
      <AdminPromotionsTable
        items={[makeRow({ id: 1, renderMode: 'SYSTEM_COMPOSED' })]}
        onDeleteClick={vi.fn()}
      />,
    );
    expect(screen.getByText('SYSTEM')).toBeInTheDocument();
  });

  it('FULL_BLEED_IMAGE 행은 FULL_BLEED 배지가 표시된다', () => {
    render(
      <AdminPromotionsTable
        items={[makeRow({ id: 2, renderMode: 'FULL_BLEED_IMAGE' })]}
        onDeleteClick={vi.fn()}
      />,
    );
    expect(screen.getByText('FULL_BLEED')).toBeInTheDocument();
  });

  it('두 모드가 섞인 목록도 각각 올바른 배지로 표시된다', () => {
    render(
      <AdminPromotionsTable
        items={[
          makeRow({ id: 1, renderMode: 'SYSTEM_COMPOSED' }),
          makeRow({ id: 2, renderMode: 'FULL_BLEED_IMAGE' }),
        ]}
        onDeleteClick={vi.fn()}
      />,
    );
    expect(screen.getByText('SYSTEM')).toBeInTheDocument();
    expect(screen.getByText('FULL_BLEED')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: 테스트 실행**

Run: `cd frontend && pnpm --filter web test -- admin-promotion-form-render-mode admin-promotions-table-render-mode`
Expected: 두 파일 9개 케이스 모두 PASS.

만약 `useRouter` / `usePathname` / `useApiClient` mock 부족으로 인한 import 에러가 발생하면, 기존 `admin-club-create-form.test.tsx` (`frontend/apps/web/test/admin/clubs/`) 를 참조해 동일 패턴으로 mock 추가.

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/test/admin/promotions/
git commit -m "test(promotion): 어드민 폼 모드 라디오/가드/미리보기 + 목록 유형 배지 RTL 테스트"
```

---

## Task 8: 최종 회귀 + 브라우저 sanity + PR + 머지

**Files:** none

- [ ] **Step 1: 전체 typecheck + lint 회귀**

Run: `cd frontend && pnpm --filter web typecheck`
Expected: 종료 코드 0.

Run: `cd frontend && pnpm --filter web lint`
Expected: 기존 경고만 (이번 변경으로 신규 경고/에러 없음).

- [ ] **Step 2: 전체 web 테스트 회귀**

Run: `cd frontend && pnpm --filter web test`
Expected: 모든 테스트 PASS (신규 9건 + 기존).

- [ ] **Step 3: 브라우저 sanity (UI 검증)**

CLAUDE.md 의 \"UI 변경은 dev server 띄워 브라우저에서 확인\" 가이드 준수. 시간이 허락하면:

```bash
cd frontend && pnpm dev
```

별도 터미널에서 `http://localhost:3000/admin/promotions/new` 접속, 다음 확인:
- (1) 폼 최상단 모드 라디오가 노출, 기본 SYSTEM_COMPOSED 선택
- (2) FULL_BLEED 클릭 시 두 가드 인라인 메시지 표시
- (3) Alt Text 헬프 텍스트가 모드에 따라 바뀜
- (4) FULL_BLEED 모드에서 이미지 업로드 후 권장 비율 미달이면 경고 표시
- (5) 라이브 미리보기가 모드별로 다르게 그려짐 (SYSTEM 은 텍스트+팔레트, FULL_BLEED 는 이미지만)
- (6) `/admin/promotions` 목록에서 새 \"유형\" 컬럼이 보이고 SYSTEM/FULL_BLEED 배지 표시

브라우저 확인이 어려운 환경이면 스킵하고 \"실제 UI 검증은 PR 리뷰어가 수행\" 로 PR 본문에 명시.

- [ ] **Step 4: 브랜치 push**

```bash
git push -u origin feat/promotion-full-bleed-admin-ui
```

- [ ] **Step 5: PR 생성**

```bash
gh pr create --base develop --title "feat(promotion): FULL_BLEED_IMAGE PR2 — 어드민 UI (모드 라디오 + 가드 + 미리보기 + 배지)" --body "$(cat <<'EOF'
## 🚀 작업 내용
spec `docs/superpowers/specs/2026-06-07-promotion-full-bleed-image-design.md` §6 의 어드민 UI 단계를 구현했습니다. PR1 (#278) 머지로 백엔드 응답에 `renderMode` / `imageAltText` 가 노출되고 있어, 폼 state 와 submit payload 가 새 필드를 자연스럽게 흘려보내기만 하면 됩니다.

어드민 폼 최상단에 "시스템 조합형 / 완성 이미지형" 라디오 그룹을 두고, 모드 선택이 다른 입력 의미를 좌우하므로 가장 먼저 결정하도록 배치했습니다. Alt Text input 은 항상 노출되지만 헬프 텍스트와 라벨이 모드에 따라 다릅니다 (FULL_BLEED 면 "(필수)" + 포스터 텍스트 가이드, SYSTEM_COMPOSED 면 "(선택)" + 모드 전환용 보존 안내). FULL_BLEED 로 전환했는데 이미지 또는 Alt 가 비어 있으면 인라인 경고로 즉시 알려주고, 저장 시도는 백엔드 422 검증으로 막힙니다.

라이브 미리보기는 모드별로 완전히 다른 컴포넌트를 보여줍니다. SYSTEM_COMPOSED 는 기존 미리보기 (이미지 위에 그라데이션 + 텍스트 + CTA 합성) 그대로, FULL_BLEED_IMAGE 는 업로드한 이미지만 풀-블리드로 표시하고 Alt 가 비어 있으면 우측 상단에 ⚠ 배지를 띄웁니다. 어드민이 모드 전환 결과를 보기 전에 시각적으로 확인할 수 있도록 했습니다.

FULL_BLEED 모드에서는 이미지 업로드 직후 권장 비율 (1920×840, 16:7 ±10%) 을 측정해 미달일 때 경고를 노출합니다. 저장은 차단하지 않으므로 운영자가 의도적으로 다른 비율을 쓰는 것도 가능합니다.

어드민 목록 테이블에는 SYSTEM / FULL_BLEED 배지 컬럼을 추가해 운영자가 한눈에 모드를 구분할 수 있습니다.

## 🤔 고민했던 내용
"입력 UI 자체는 항상 유지, 의미만 분기" 라는 spec §6.2 원칙을 어떻게 시각적으로 표현할지가 핵심이었습니다. 모드 전환 시 입력란을 숨기는 UX 가 직관적이지만 데이터 손실 오해를 부르고, 항상 표시하면 "왜 이게 화면에 안 보이지?" 라는 혼란이 생깁니다. 절충안으로 (1) 입력 UI 는 모든 모드에서 항상 표시, (2) 라벨에 "(필수) / (선택)" 명시, (3) 헬프 텍스트가 모드에 따라 의미를 설명하는 방식을 택했습니다.

이미지 권장 비율 측정은 `ImageUploader.onChange` 시점이 아닌 `useEffect` 에서 `bannerImageUrl` 이 바뀔 때마다 `new window.Image()` 로 dimension 을 측정하는 방식으로 했습니다. ImageUploader 컴포넌트를 손대지 않고 폼 측에서 완결되도록 했고, SSR / Next 환경에서 노드의 `Image` 와 충돌하지 않도록 `window.Image` 를 명시했습니다.

`AdminPromotionForm.tsx` 가 본 PR 로 ~700 줄에 도달했습니다. 단일 책임(어드민 배너 폼) 이라 split 없이 머지하고, 700 줄을 넘기 시작하면 후속 PR 에서 `_components/` 하위로 섹션 분리를 고려할 예정입니다.

## 💬 리뷰 중점사항
- 모드 라디오를 폼 최상단에 둔 위치가 어드민 UX 면에서 자연스러운지
- FULL_BLEED 전환 가드 두 개가 \"이미지 미입력\", \"Alt 미입력\" 시 각각 독립적으로 노출되는지 (둘 다 비면 두 줄)
- 모드 전환 시 기존 입력 값(tag/subtitle/CTA/이모지/팔레트/Alt Text) 이 보존되는지 — spec §8 의 \"보존 정책\" 가드
- 라이브 미리보기가 모드에 따라 시각적으로 다른지, FULL_BLEED 미리보기에서 Alt 미입력 ⚠ 배지가 정확히 우측 상단에 뜨는지
- 어드민 목록 새 \"유형\" 컬럼 배지의 시각적 대비가 충분한지
- 신규 9개 RTL 테스트가 핵심 UX 시나리오(모드 전환, 가드 노출/소멸, 데이터 보존, 배지 표시) 를 커버하는지
EOF
)"
```

- [ ] **Step 6: PR 번호 캡처 후 머지**

```bash
PR_NUMBER=$(gh pr view --json number --jq .number)
gh pr merge $PR_NUMBER --squash --delete-branch
gh pr view $PR_NUMBER --json state,mergedAt
```

Expected: `"state":"MERGED"`.

- [ ] **Step 7: develop 동기화**

```bash
git checkout develop
git pull origin develop
```

Expected: 로컬 develop 가 squash merge 결과까지 fast-forward.

---

## Self-Review (작성자 체크리스트)

**Spec coverage (spec §6):**
- §6.1 폼 최상단 모드 라디오 → Task 1 (Step 4)
- §6.2 모드별 입력 UI (입력 UI 항상 유지) → Task 2 (Alt Text input) + 기존 모든 입력 그대로 유지 (다른 필드는 손대지 않음)
- §6.3 모드 전환 가드 (두 가드 독립적) → Task 3
- §6.4 권장 비율 즉시 경고 → Task 4
- §6.5 라이브 미리보기 분기 → Task 5
- §6.6 어드민 목록 배지 → Task 6

**Spec §10 PR2 검증 항목:**
- 신규 등록 / 수정 모드 토글에 따른 데이터 보존 → Task 7 (\"입력한 Alt Text 가 모드 전환해도 보존된다\" 케이스)
- 권장 비율 경고가 부정확한 이미지에서만 뜨는지 → 브라우저 sanity (Task 8 Step 3) — 단위 테스트로는 image dimension 측정이 어려워 sanity 로 위임
- 목록 배지 표시 → Task 7 (목록 테스트 3 케이스)

**Placeholder scan:** \"TBD\", \"TODO\", \"appropriate error handling\" 등 패턴 검색 결과 zero.

**Type consistency:**
- `PromotionRenderMode` 식별자 일관 사용
- `state.renderMode` / `state.imageAltText` 등 폼 state 키가 모든 Task 에서 동일
- `RENDER_MODE_LABEL` / `RENDER_MODE_BADGE_CLASS` export 이름이 promotionLabels.ts 와 AdminPromotionsTable 임포트에서 일치

---

## 참고

- spec: `docs/superpowers/specs/2026-06-07-promotion-full-bleed-image-design.md`
- 선행 PR: PR1 `#278` (스키마 + enum + 응답 노출) — 이미 develop 에 머지됨
- 후속 PR3: 공개 렌더링 (BannerCarousel 의 FullBleedSlide 분리) — 본 PR2 머지 후 별도 plan 작성
- 메모리 가이드 준수: Conventional Commits, `[#이슈번호]` 형식 금지, Co-Authored-By 라인 금지, `gh pr checks --watch` 금지.
