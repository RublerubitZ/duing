# 배너 UX Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec `docs/superpowers/specs/2026-06-07-promotion-banner-ux-refinements-design.md` 의 6가지 UX refinement 를 구현한다 — CTA 폴백 제거 / 보조 배너 부제 디자인 / FULL_BLEED 폼 입력란 단순화 / Alt 헬프 문구 / 메인 캐러셀 컨테이너 비율.

**Architecture:** 프론트엔드 단독 변경. 백엔드 데이터 모델·API·검증 변경 zero. 어드민 폼 state 보존 정책(spec §5) 그대로 유지하면서 UI 만 모드별로 분기. 메인 캐러셀 컨테이너의 비율 변경은 페이지 상단 차지 비중이 커지는 영향이 있어 반응형 캡처로 최종 확인.

**Tech Stack:** Next.js 15 / React 19 / TypeScript / Tailwind / Vitest + React Testing Library / pnpm workspaces.

**Branch:** `fix/promotion-banner-ux-refinements` (cut from latest develop)

---

## File Structure

| Action | Path | 변경 내용 |
|--------|------|----------|
| Modify | `frontend/apps/web/app/_components/sections/BannerCarousel.tsx` | promotionToSlide CTA 폴백 제거 (line 67), 메인 컨테이너 `h-[280px]` → `aspect-[16/7]` (line 151) |
| Modify | `frontend/apps/web/app/_components/sections/banner/SystemComposedSlide.tsx` | MainSlideBody CTA 조건부 렌더, PreviewSlideBody sub flex/ArrowRight 제거 |
| Modify | `frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx` | tag/subtitle/ctaLabel/emoji 입력 섹션 FULL_BLEED 시 조건부 숨김, title 헬프 분기, Alt 헬프 통일 |
| Modify | `frontend/apps/web/test/sections/banner/system-composed-slide.test.tsx` | CTA 조건부 + preview sub 디자인 검증 (+3 케이스) |
| Modify | `frontend/apps/web/test/admin/promotions/admin-promotion-form-render-mode.test.tsx` | FULL_BLEED 입력란 숨김/보존 + title 노출 + Alt 헬프 통일 검증 (+4 케이스) |

**백엔드 변경 zero. 신규 RTL 테스트 +7 케이스.**

---

## Task 0: 브랜치 생성

**Files:** none

- [ ] **Step 1: develop 동기화 + 브랜치 생성**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop
git pull origin develop
git checkout -b fix/promotion-banner-ux-refinements
```

Expected: `Switched to a new branch 'fix/promotion-banner-ux-refinements'`

---

## Task 1: CTA 폴백 제거 + MainSlideBody 조건부 렌더

**Files:**
- Modify: `frontend/apps/web/app/_components/sections/BannerCarousel.tsx:67`
- Modify: `frontend/apps/web/app/_components/sections/banner/SystemComposedSlide.tsx` (MainSlideBody CTA `<span>` 영역)
- Modify: `frontend/apps/web/test/sections/banner/system-composed-slide.test.tsx`

### Step 1: 실패하는 테스트 2건 추가

`frontend/apps/web/test/sections/banner/system-composed-slide.test.tsx` 의 `describe('SystemComposedSlide — main variant', ...)` 블록 끝(`'내부 경로는 next/link 로 감싼다'` it 다음)에 추가:

```tsx
it('CTA 라벨이 빈 문자열이면 메인 슬라이드에 버튼이 렌더되지 않는다', () => {
  render(<SystemComposedSlide variant="main" slide={makeSlide({ cta: '' })} />);
  // 제목은 그대로 노출
  expect(screen.getByText('테스트 배너 제목')).toBeInTheDocument();
  // CTA 버튼은 미렌더
  expect(screen.queryByText('자세히 보기')).not.toBeInTheDocument();
});

it('CTA 라벨이 있으면 메인 슬라이드에 버튼이 렌더된다', () => {
  render(<SystemComposedSlide variant="main" slide={makeSlide({ cta: '박람회 자세히 보기' })} />);
  expect(screen.getByText('박람회 자세히 보기')).toBeInTheDocument();
});
```

### Step 2: 테스트 실행 — 실패 확인

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- system-composed-slide
```

Expected: `CTA 라벨이 빈 문자열이면 ...` FAIL — 현재 CTA `<span>` 이 조건부 렌더가 아니라 `slide.cta` 가 비어 있어도 `<span>` 자체는 렌더되고 빈 텍스트 노드만 자리 차지. 두 번째 테스트는 placeholder makeSlide 의 cta 가 `'자세히 보기'` 라 PASS 가능 (실패 시 makeSlide 의 cta 기본값과 충돌하므로 cta 명시 전달로 안전).

### Step 3: SystemComposedSlide MainSlideBody CTA 조건부 렌더

`frontend/apps/web/app/_components/sections/banner/SystemComposedSlide.tsx` 의 line 133-142 (MainSlideBody 안의 CTA `<span>`) 를 다음으로 교체:

```tsx
{slide.cta && (
  <span
    className="btn rounded-md px-[22px] py-3 font-bold"
    style={{
      background: isDarkText ? '#9DB6A0' : slide.accent,
      color: isDarkText ? '#143025' : '#fff',
    }}
  >
    {slide.cta}
    <ArrowRight />
  </span>
)}
```

기존 `<span ...>...{slide.cta}<ArrowRight /></span>` 전체를 `{slide.cta && (...)}` 로 감싸기만.

### Step 4: BannerCarousel mapper CTA 폴백 제거

`frontend/apps/web/app/_components/sections/BannerCarousel.tsx` 의 line 67 (`promotionToSlide` 안의 cta 줄) 을 다음으로 교체:

기존:
```tsx
cta: promotion.ctaLabel ?? '자세히 보기',
```
변경 후:
```tsx
cta: promotion.ctaLabel ?? '',
```

(`mockToSlide` 의 `cta: banner.cta` 는 그대로 — mock 의 cta 는 이미 채워진 값.)

### Step 5: 테스트 실행 — PASS 확인

```bash
pnpm --filter web test -- system-composed-slide
```

Expected: 신규 2건 포함 SystemComposedSlide 전체 PASS.

### Step 6: 커밋

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/_components/sections/BannerCarousel.tsx \
        frontend/apps/web/app/_components/sections/banner/SystemComposedSlide.tsx \
        frontend/apps/web/test/sections/banner/system-composed-slide.test.tsx
git commit -m "fix(promotion): CTA 라벨이 비어있을 때 자세히 보기 자동 노출 제거"
```

---

## Task 2: PreviewSlideBody 부제 디자인 정리

**Files:**
- Modify: `frontend/apps/web/app/_components/sections/banner/SystemComposedSlide.tsx` (PreviewSlideBody sub 영역)
- Modify: `frontend/apps/web/test/sections/banner/system-composed-slide.test.tsx`

### Step 1: 실패하는 테스트 추가

`describe('SystemComposedSlide — preview variant', ...)` 블록 끝(`'button 으로 렌더되고 제목 일부가 표시된다'` it 다음) 에 추가:

```tsx
it('preview 의 부제 영역은 단순 텍스트만 포함하고 아이콘이 없다', () => {
  render(
    <SystemComposedSlide
      variant="preview"
      slide={makeSlide({ sub: '67개 동아리 · 80개 부스' })}
      direction="left"
      onSelect={() => undefined}
    />,
  );
  const subContainer = screen.getByText('67개 동아리');
  // ArrowRight 같은 SVG 아이콘이 부제 div 안에 포함되어 있지 않다
  expect(subContainer.querySelector('svg')).toBeNull();
});
```

### Step 2: 테스트 실행 — 실패 확인

```bash
pnpm --filter web test -- system-composed-slide
```

Expected: `preview 의 부제 영역은 단순 텍스트만 ...` FAIL — 현재 sub div 안에 `<ArrowRight size={12} />` SVG 가 있어 `querySelector('svg')` 가 element 를 반환.

### Step 3: PreviewSlideBody sub 영역 단순화

`frontend/apps/web/app/_components/sections/banner/SystemComposedSlide.tsx` 의 line 234-242 (PreviewSlideBody 안의 sub `<div>`) 를 다음으로 교체:

기존:
```tsx
{slide.sub && (
  <div
    className="relative mt-2 flex items-center gap-1.5 text-xs"
    style={{ color: textColor, opacity: 0.85 }}
  >
    {slide.sub.split(' · ')[0]}
    <ArrowRight size={12} />
  </div>
)}
```

변경 후:
```tsx
{slide.sub && (
  <div
    className="relative mt-2 text-xs"
    style={{ color: textColor, opacity: 0.85 }}
  >
    {slide.sub.split(' · ')[0]}
  </div>
)}
```

변경 사항:
- `flex items-center gap-1.5` 제거 (단순 블록 div)
- `<ArrowRight size={12} />` 제거

### Step 4: 테스트 실행 — PASS 확인

```bash
pnpm --filter web test -- system-composed-slide
```

Expected: 신규 1건 포함 전체 PASS.

### Step 5: 커밋

```bash
git add frontend/apps/web/app/_components/sections/banner/SystemComposedSlide.tsx \
        frontend/apps/web/test/sections/banner/system-composed-slide.test.tsx
git commit -m "fix(promotion): 보조 배너 부제에서 화살표 아이콘 제거 (CTA 오인 방지)"
```

---

## Task 3: FULL_BLEED 폼에서 tag/subtitle/ctaLabel/emoji 입력란 조건부 숨김

**Files:**
- Modify: `frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx:303-346`
- Modify: `frontend/apps/web/test/admin/promotions/admin-promotion-form-render-mode.test.tsx`

### Step 1: 실패하는 테스트 3건 추가

`describe('AdminPromotionForm — renderMode UI', ...)` 블록 끝에 추가:

```tsx
it('FULL_BLEED 모드에서 태그/부제/CTA 라벨/이모지 입력란이 모두 숨겨진다', () => {
  renderCreateForm();
  fireEvent.click(screen.getByRole('radio', { name: /완성 이미지형/ }));
  expect(screen.queryByPlaceholderText('EVENT · 9.25 — 9.27')).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText('67개 동아리 · 80개 부스 · 중앙광장')).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText('박람회 자세히 보기')).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText('🍂')).not.toBeInTheDocument();
});

it('SYSTEM_COMPOSED 모드에서는 태그/부제/CTA 라벨/이모지 입력란이 모두 노출된다', () => {
  renderCreateForm();
  expect(screen.getByPlaceholderText('EVENT · 9.25 — 9.27')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('67개 동아리 · 80개 부스 · 중앙광장')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('박람회 자세히 보기')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('🍂')).toBeInTheDocument();
});

it('SYSTEM → FULL_BLEED → SYSTEM 왕복 시 태그 입력값이 보존된다', () => {
  renderCreateForm();
  const tagInput = screen.getByPlaceholderText('EVENT · 9.25 — 9.27');
  fireEvent.change(tagInput, { target: { value: '내가 입력한 태그' } });
  fireEvent.click(screen.getByRole('radio', { name: /완성 이미지형/ }));
  expect(screen.queryByPlaceholderText('EVENT · 9.25 — 9.27')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: /시스템 조합형/ }));
  expect(screen.getByDisplayValue('내가 입력한 태그')).toBeInTheDocument();
});
```

### Step 2: 테스트 실행 — 실패 확인

```bash
pnpm --filter web test -- admin-promotion-form-render-mode
```

Expected: `FULL_BLEED 모드에서 태그/부제 ...` FAIL — 현재 입력란이 모드 무관 노출.

### Step 3: AdminPromotionForm 에서 4개 입력 섹션 조건부 숨김

`frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx` 의 line 303-346 (tag Field + subtitle Field + ctaLabel/emoji grid 까지 3개 섹션) 을 fragment 로 묶어 조건부 렌더로 감싸기:

기존 (line 303 부터):
```tsx
      <Field label="태그 (선택, ≤60자) — 예: EVENT · 9.25 — 9.27">
        <input
          type="text"
          maxLength={60}
          value={state.tag}
          onChange={(event) => update('tag', event.target.value)}
          placeholder="EVENT · 9.25 — 9.27"
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <Field label="부제 (선택, ≤200자)">
        <input
          type="text"
          maxLength={200}
          value={state.subtitle}
          onChange={(event) => update('subtitle', event.target.value)}
          placeholder="67개 동아리 · 80개 부스 · 중앙광장"
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="CTA 라벨 (선택, ≤40자)">
          <input
            type="text"
            maxLength={40}
            value={state.ctaLabel}
            onChange={(event) => update('ctaLabel', event.target.value)}
            placeholder="박람회 자세히 보기"
            className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
          />
        </Field>
        <Field label="이모지 (선택, 1자 권장)">
          <input
            type="text"
            maxLength={8}
            value={state.emoji}
            onChange={(event) => update('emoji', event.target.value)}
            placeholder="🍂"
            className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
          />
        </Field>
      </div>
```

변경 후 — 위 3개 섹션 전체를 `state.renderMode !== 'FULL_BLEED_IMAGE' && (...)` fragment 로 감싸기:

```tsx
      {state.renderMode !== 'FULL_BLEED_IMAGE' && (
        <>
          <Field label="태그 (선택, ≤60자) — 예: EVENT · 9.25 — 9.27">
            <input
              type="text"
              maxLength={60}
              value={state.tag}
              onChange={(event) => update('tag', event.target.value)}
              placeholder="EVENT · 9.25 — 9.27"
              className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
            />
          </Field>

          <Field label="부제 (선택, ≤200자)">
            <input
              type="text"
              maxLength={200}
              value={state.subtitle}
              onChange={(event) => update('subtitle', event.target.value)}
              placeholder="67개 동아리 · 80개 부스 · 중앙광장"
              className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="CTA 라벨 (선택, ≤40자)">
              <input
                type="text"
                maxLength={40}
                value={state.ctaLabel}
                onChange={(event) => update('ctaLabel', event.target.value)}
                placeholder="박람회 자세히 보기"
                className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
              />
            </Field>
            <Field label="이모지 (선택, 1자 권장)">
              <input
                type="text"
                maxLength={8}
                value={state.emoji}
                onChange={(event) => update('emoji', event.target.value)}
                placeholder="🍂"
                className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
              />
            </Field>
          </div>
        </>
      )}
```

state 값은 fragment 안에서 모두 `state.tag` / `state.subtitle` / `state.ctaLabel` / `state.emoji` 를 그대로 참조. 모드 토글 시 fragment 가 사라져도 `state` 객체는 그대로 보존됨 (보존 정책 자동 충족).

### Step 4: 테스트 실행 — PASS 확인

```bash
pnpm --filter web test -- admin-promotion-form-render-mode
```

Expected: 신규 3건 포함 전체 PASS.

### Step 5: 커밋

```bash
git add frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx \
        frontend/apps/web/test/admin/promotions/admin-promotion-form-render-mode.test.tsx
git commit -m "feat(promotion): FULL_BLEED 모드에서 태그/부제/CTA 라벨/이모지 입력란 숨김 (state 는 보존)"
```

---

## Task 4: title 헬프 텍스트 분기 + Alt 헬프 통일

**Files:**
- Modify: `frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx` (제목 Field 헬프, Alt Field 헬프)
- Modify: `frontend/apps/web/test/admin/promotions/admin-promotion-form-render-mode.test.tsx`

### Step 1: 실패하는 테스트 2건 추가

`describe` 블록 끝에 추가:

```tsx
it('FULL_BLEED 모드에서 제목 입력란에 관리자 식별용 헬프 텍스트가 노출된다', () => {
  renderCreateForm();
  fireEvent.click(screen.getByRole('radio', { name: /완성 이미지형/ }));
  expect(
    screen.getByText('관리자 화면에서 배너를 구분하기 위한 이름입니다. 사용자에게는 노출되지 않습니다.'),
  ).toBeInTheDocument();
});

it('Alt Text 헬프 문구가 SYSTEM/FULL_BLEED 모두 동일 표현이다', () => {
  renderCreateForm();
  // SYSTEM 모드 (초기)
  expect(
    screen.getByText('이미지가 보이지 않을 때 대신 보여주거나 읽어주는 설명입니다.'),
  ).toBeInTheDocument();
  // 기존 모드별 분기 문구가 더 이상 노출되지 않는다
  expect(screen.queryByText(/포스터에 표시된 핵심 텍스트/)).not.toBeInTheDocument();
  expect(screen.queryByText(/완성 이미지형 배너로 전환할 때 접근성/)).not.toBeInTheDocument();

  // FULL_BLEED 토글 후에도 같은 문구
  fireEvent.click(screen.getByRole('radio', { name: /완성 이미지형/ }));
  expect(
    screen.getByText('이미지가 보이지 않을 때 대신 보여주거나 읽어주는 설명입니다.'),
  ).toBeInTheDocument();
});
```

### Step 2: 테스트 실행 — 실패 확인

```bash
pnpm --filter web test -- admin-promotion-form-render-mode
```

Expected: 두 테스트 모두 FAIL — title 헬프 텍스트 없음 + Alt 텍스트가 기존 분기 문구 그대로.

### Step 3: 제목 Field 에 모드별 헬프 텍스트 추가

`frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx` 의 제목 Field (현재 line 293-301 부근, `<Field label="제목 (≤120자)">` 시작 영역) 를 다음으로 교체:

기존:
```tsx
      <Field label="제목 (≤120자)">
        <input
          type="text"
          maxLength={120}
          value={state.title}
          onChange={(event) => update('title', event.target.value)}
          required
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
      </Field>
```

변경 후:
```tsx
      <Field label="제목 (≤120자)">
        <input
          type="text"
          maxLength={120}
          value={state.title}
          onChange={(event) => update('title', event.target.value)}
          required
          className="w-full px-3.5 py-2 rounded-md border border-line bg-paper text-[14px]"
        />
        {state.renderMode === 'FULL_BLEED_IMAGE' && (
          <p className="mt-1 text-[12px] text-charcoal-3">
            관리자 화면에서 배너를 구분하기 위한 이름입니다. 사용자에게는 노출되지 않습니다.
          </p>
        )}
      </Field>
```

(`Field` 컴포넌트는 이미 여러 children 을 받을 수 있는 형태 — Alt Text Field 가 input + p 패턴을 그대로 쓰고 있으므로 동일.)

### Step 4: Alt Text Field 헬프 문구를 단일 문구로 통일

`AdminPromotionForm.tsx` 의 Alt Text Field 안의 헬프 `<p>` (현재 line 379-383) 를 다음으로 교체:

기존:
```tsx
        <p className="mt-1 text-[12px] text-charcoal-3">
          {state.renderMode === 'FULL_BLEED_IMAGE'
            ? '포스터에 표시된 핵심 텍스트(제목, 일정 등) 를 그대로 적어주세요. 스크린리더와 SEO 가 이 텍스트를 읽습니다.'
            : '완성 이미지형 배너로 전환할 때 접근성·SEO 용도로 사용됩니다. 지금 입력해두면 모드 전환 시 자동 적용됩니다.'}
        </p>
```

변경 후:
```tsx
        <p className="mt-1 text-[12px] text-charcoal-3">
          이미지가 보이지 않을 때 대신 보여주거나 읽어주는 설명입니다.
        </p>
```

(모드 분기 제거, 단일 문구.)

### Step 5: 테스트 실행 — PASS 확인

```bash
pnpm --filter web test -- admin-promotion-form-render-mode
```

Expected: 신규 2건 포함 전체 PASS.

### Step 6: 커밋

```bash
git add frontend/apps/web/app/admin/promotions/_components/AdminPromotionForm.tsx \
        frontend/apps/web/test/admin/promotions/admin-promotion-form-render-mode.test.tsx
git commit -m "fix(promotion): 제목 헬프 모드별 분기 + Alt Text 헬프 두 모드 통일"
```

---

## Task 5: 메인 캐러셀 컨테이너 aspect-[16/7]

**Files:**
- Modify: `frontend/apps/web/app/_components/sections/BannerCarousel.tsx:151`

이 변경은 CSS aspect-ratio 기반이라 jsdom 환경에서 RTL 로 검증이 의미 적음(viewport 가 없음). 직접 클래스 변경 + 다음 task 의 sanity 캡처로 확인.

### Step 1: 컨테이너 클래스 변경

`frontend/apps/web/app/_components/sections/BannerCarousel.tsx` 의 line 151 (메인 슬라이드 wrapper `<div>`) 을 다음으로 교체:

기존:
```tsx
          <div className="relative h-[280px] overflow-hidden rounded-xl">
```

변경 후:
```tsx
          <div className="relative aspect-[16/7] overflow-hidden rounded-xl">
```

`h-[280px]` → `aspect-[16/7]`. Tailwind 의 `aspect-[16/7]` 는 `aspect-ratio: 16 / 7` CSS 를 생성하므로 가로(grid `1fr` 컬럼) 에 따라 세로가 자동 계산됨. 데스크탑 (`md:grid-cols-[1fr_340px]`, `max-w-layout=1280px`, `gap-4=16px`) 기준 가로 ≈ 924px → 세로 ≈ 404px. 사이드 미리보기 컬럼은 `flex flex-col gap-3` 의 `flex-1` 분배로 자동 정렬.

### Step 2: typecheck + lint

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck
```
Expected: 종료 코드 0.

```bash
pnpm --filter web lint 2>&1 | grep -E "Warning|Error" | head -5
```
Expected: 기존 경고만, 신규 경고 없음.

### Step 3: 커밋

```bash
git add frontend/apps/web/app/_components/sections/BannerCarousel.tsx
git commit -m "fix(promotion): 메인 캐러셀 컨테이너 aspect-[16/7] 로 권장 규격 잘림 없게"
```

---

## Task 6: 회귀 + 반응형 sanity 캡처 + PR + 머지

**Files:** none

### Step 1: 전체 typecheck + lint + test 회귀

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck
```
Expected: 종료 코드 0.

```bash
pnpm --filter web lint
```
Expected: 기존 경고만 (이번 변경으로 신규 경고/에러 없음).

```bash
pnpm --filter web test
```
Expected: 모든 테스트 PASS (PR3 직후 185 + 본 PR 신규 7 = ~192 전후).

### Step 2: 반응형 sanity 캡처 (필수)

spec §6.3 요구사항. 다음 3종 viewport 에서 메인 페이지 `http://localhost:3000` 의 캐러셀 영역을 캡처해 PR 본문에 첨부.

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm dev
```

별도 터미널에서 브라우저 또는 DevTools 디바이스 에뮬레이션:

| 환경 | viewport | 확인 항목 |
|------|----------|----------|
| Desktop | ≥ 1280px | 메인 924×404, 사이드 미리보기 2장 정상 정렬 |
| Tablet | 768~1024px | md 브레이크포인트 경계, 그리드 깨짐 없음 |
| Mobile | ≤ 640px | 단일 컬럼, 메인이 화면 폭 × 7/16 비율로 정상 |

추가 시각 확인 항목:
- DB 에 ctaLabel 비어 있는 SYSTEM 모드 배너에 "자세히 보기" 가 안 보이는지
- 보조(사이드) 배너의 부제가 화살표 없이 단순 텍스트로 표시되는지
- FULL_BLEED 모드로 어드민에서 배너 만들 때 태그/부제/CTA/이모지 입력란이 사라지는지, title 입력란만 노출 + 헬프 텍스트로 "관리자 화면에서 배너를 구분..." 노출
- Alt Text 헬프 문구가 두 모드 모두 "이미지가 보이지 않을 때 대신 보여주거나 읽어주는 설명입니다." 표시

브라우저 sanity 가 불가능한 환경(예: headless / CI) 이면 \"브라우저 검증은 PR 리뷰어가 수행\" 으로 PR 본문에 명시.

### Step 3: 브랜치 push

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git push -u origin fix/promotion-banner-ux-refinements
```

### Step 4: PR 생성

```bash
gh pr create --base develop --title "fix(promotion): 배너 UX refinements — CTA/preview sub/폼 단순화/Alt 헬프/컨테이너 비율" --body "$(cat <<'EOF'
## 🚀 작업 내용
spec \`docs/superpowers/specs/2026-06-07-promotion-banner-ux-refinements-design.md\` 의 6가지 UX refinement 를 적용했습니다. 모두 프론트엔드 단독 변경이고 백엔드 데이터 모델·API·검증은 그대로입니다.

**공개 캐러셀** 의 \"CTA 라벨을 비워둬도 자동으로 자세히 보기 가 표시\" 되는 mapper 폴백(\`promotionToSlide\`) 을 제거하고, MainSlide 도 \`slide.cta\` 가 비어 있으면 버튼 자체를 렌더하지 않도록 조건부로 바꿨습니다. 보조(사이드) 슬라이드의 부제가 \`<ArrowRight />\` 와 함께 표시되어 마치 \"자세히 보기 →\" 같은 CTA 처럼 보이던 디자인을 단순 텍스트로 정리했습니다. 메인 슬라이드 컨테이너의 \`h-[280px]\` 을 \`aspect-[16/7]\` 로 바꿔 권장 규격(1920×840) 의 16:7 이미지가 \`object-cover\` 로 들어와도 권장 규격 기준 잘림이 없게 했습니다. 비권장 비율의 이미지는 \`object-cover\` 특성상 여전히 일부 크롭될 수 있으며 어드민 폼의 권장 비율 경고가 사전에 안내합니다.

**어드민 폼** 에서는 FULL_BLEED 모드를 선택하면 태그/부제/CTA 라벨/이모지 입력란이 함께 숨겨집니다. 입력값(state) 은 그대로 보존되므로 SYSTEM 으로 되돌리면 입력란이 다시 보이고 이전 값도 자동 복구됩니다. 제목 입력란은 두 모드 모두 노출되어 \"관리자 식별용 메타데이터\" 역할을 유지하고, FULL_BLEED 모드일 때만 \"관리자 화면에서 배너를 구분하기 위한 이름입니다. 사용자에게는 노출되지 않습니다.\" 헬프 텍스트가 노출되어 의도를 안내합니다. Alt Text 헬프 문구는 두 모드 모두 \"이미지가 보이지 않을 때 대신 보여주거나 읽어주는 설명입니다.\" 단일 표현으로 통일해 일반 사용자도 즉시 이해되도록 정리했습니다 (이전의 \"스크린리더\", \"SEO\" 같은 기술 용어 제거).

신규 RTL 테스트 7 케이스 — SystemComposedSlide 3 (CTA 빈/있음/preview sub 단순 텍스트), AdminPromotionForm 4 (FULL_BLEED 입력란 숨김/SYSTEM 노출/왕복 시 보존/제목 헬프 노출/Alt 헬프 통일) — 로 핵심 변경을 못박았습니다.

## 🤔 고민했던 내용
spec §6.2 의 \"입력 UI 항상 유지, 의미만 분기\" (PR2 결정) 를 부분적으로 뒤집는 작업이라 새 사양 문서를 별도로 정리해 (\`2026-06-07-promotion-banner-ux-refinements-design.md\`) 결정의 변경 의도와 데이터 보존 정책을 명시했습니다. 제목은 노출 유지로 한 절충안을 선택해 어드민 목록 식별 가능성을 잃지 않도록 했고, 입력값 보존 정책은 spec §5 그대로 이어받아 모드 토글이 데이터에 영향 zero 라는 원칙을 유지합니다.

컨테이너 비율 변경은 메인 페이지 상단 차지 비중이 ~44% 늘어나는 시각 변화라 단위 테스트로는 의미 검증이 어려워 Desktop / Tablet / Mobile 3종 캡처를 PR 본문에 첨부합니다.

## 📸 반응형 캡처
- Desktop (≥ 1280px): [캡처 첨부 위치]
- Tablet (768~1024px): [캡처 첨부 위치]
- Mobile (≤ 640px): [캡처 첨부 위치]

## 💬 리뷰 중점사항
- 어드민이 ctaLabel 비워둔 DB 배너에서 \"자세히 보기\" 가 사라지는지
- 보조 배너의 부제가 더 이상 화살표와 함께 표시되지 않는지 (CTA 오인 방지)
- FULL_BLEED 라디오 토글 시 4개 입력란이 부드럽게 숨김/복구되고 제목은 항상 보이는지
- Alt Text 헬프 문구가 두 모드 동일 표현으로 노출되는지
- 권장 16:7 이미지가 메인 슬라이드에서 권장 규격 기준 잘림 없이 표시되는지, 모바일에서도 비율 정상인지
- spec §5 의 보존 정책: SYSTEM → FULL_BLEED → SYSTEM 왕복 후 태그/부제/CTA/이모지 값이 복구되는지
EOF
)"
```

### Step 5: PR 머지

```bash
PR_NUMBER=$(gh pr view --json number --jq .number)
gh pr merge $PR_NUMBER --squash --delete-branch
gh pr view $PR_NUMBER --json state,mergedAt
```

Expected: `"state":"MERGED"`.

### Step 6: develop 동기화

```bash
git checkout develop
git pull origin develop
```

Expected: 로컬 develop 가 squash merge 결과까지 fast-forward.

---

## Self-Review (작성자 체크리스트)

**Spec coverage:**

| Spec § | 요구 | Task |
|--------|------|------|
| §3.1 CTA 폴백 제거 + 조건부 렌더 | promotionToSlide + MainSlideBody | Task 1 |
| §3.2 보조 배너 부제 디자인 | PreviewSlideBody | Task 2 |
| §3.3 FULL_BLEED 폼 입력란 단순화 (4개 숨김 + title 유지) | AdminPromotionForm | Task 3 + Task 4 |
| §3.4 FULL_BLEED 렌더 분리 (해결 완료) | 조치 없음 | (PR3 머지 상태 그대로) |
| §3.5 Alt 헬프 통일 | AdminPromotionForm | Task 4 |
| §3.6 컨테이너 aspect-[16/7] | BannerCarousel:151 | Task 5 |
| §5 데이터 보존 정책 | state 보존 검증 | Task 3 (왕복 보존 케이스) |
| §6.1 RTL 테스트 항목 | 7 케이스 | Task 1/2/3/4 |
| §6.2 브라우저 sanity | 시각 확인 | Task 6 Step 2 |
| §6.3 반응형 캡처 (필수) | Desktop/Tablet/Mobile | Task 6 Step 2 + PR 본문 |

**Placeholder scan:** \"TBD\", \"TODO\", \"적절히 처리\" 등 zero.

**Type consistency:**
- `state.renderMode === 'FULL_BLEED_IMAGE'` / `!==` 일관 (Task 3/4 동일 패턴)
- 헬프 문구 텍스트가 spec 문구와 글자 단위 일치 (Task 4 의 \"관리자 화면에서 배너를 구분하기 위한 이름입니다. 사용자에게는 노출되지 않습니다.\" / \"이미지가 보이지 않을 때 대신 보여주거나 읽어주는 설명입니다.\")
- `aspect-[16/7]` Tailwind 표기 일관 (Task 5)
- `<Field>` 헬퍼 사용 패턴이 Alt Text Field 와 일치 (Task 4 의 제목 Field 가 input + p 패턴 사용)

---

## 참고

- spec: `docs/superpowers/specs/2026-06-07-promotion-banner-ux-refinements-design.md`
- 선행 사양: `docs/superpowers/specs/2026-06-07-promotion-full-bleed-image-design.md` (§6.2, §6.4, §7, §8)
- 선행 PR: PR1 `#278`, PR2 `#279`, PR3 `#280`
- 메모리 가이드 준수: Conventional Commits, `[#이슈번호]` 형식 금지, Co-Authored-By 라인 금지, `gh pr checks --watch` 금지.
