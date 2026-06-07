# 배너 조건부 클릭 Implementation Plan (Spec #7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec `docs/superpowers/specs/2026-06-07-promotion-banner-clickability-design.md` 의 5가지 비인터랙티브 요건을 충족하는 조건부 클릭 동작을 구현한다 — `CarouselSlide.href` 를 `string | null` 로 풀고, mapper 의 `/clubs` 폴백을 제거하며, 두 slide 컴포넌트가 null 시 `<div cursor-default>` 로 렌더하도록 한다.

**Architecture:** 프론트엔드 단독 변경. 백엔드 변경 zero. 작업 순서는 \"하위 컴포넌트가 null 을 안전히 받을 수 있도록\" 먼저 만든 뒤(string|null 은 string 의 supertype 이라 mapper 가 여전히 string 을 흘려보내도 호환), 마지막에 mapper 가 실제 null 을 흘리도록 전환한다. `resolvePromotionHref` 헬퍼는 BannerCarousel.tsx 에서 export 해 단위 테스트 가능.

**Tech Stack:** Next.js 15 / React 19 / TypeScript / Tailwind / Vitest + React Testing Library / pnpm workspaces.

**Branch:** `fix/promotion-banner-conditional-click` (cut from latest develop)

---

## File Structure

| Action | Path | 변경 내용 |
|--------|------|----------|
| Modify | `frontend/apps/web/app/_components/sections/banner/SystemComposedSlide.tsx` | `SystemComposedSlideData.href: string \| null`, MainSlideBody 의 null 분기 (`<div className="block h-full cursor-default">`) |
| Modify | `frontend/apps/web/app/_components/sections/banner/FullBleedSlide.tsx` | `FullBleedSlideData.href: string \| null`, FullBleedMainBody 의 null 분기 |
| Modify | `frontend/apps/web/app/_components/sections/BannerCarousel.tsx` | `resolvePromotionHref` 헬퍼 export, mapper 가 헬퍼 호출 (`/clubs` 폴백 제거), `CarouselSlide.href: string \| null` |
| Modify | `frontend/apps/web/test/sections/banner/system-composed-slide.test.tsx` | href=null 시 비인터랙티브 검증 (+2 케이스) |
| Modify | `frontend/apps/web/test/sections/banner/full-bleed-slide.test.tsx` | href=null 시 비인터랙티브 검증 (+1 케이스) |
| Create | `frontend/apps/web/test/sections/banner/resolve-promotion-href.test.ts` | helper 순수 함수 단위 테스트 (4 케이스) |

**백엔드 변경 zero. 신규 RTL/단위 테스트 +7 케이스.**

---

## Task 0: 브랜치 생성

**Files:** none

- [ ] **Step 1: develop 동기화 + 브랜치 생성**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop
git pull origin develop
git checkout -b fix/promotion-banner-conditional-click
```

Expected: `Switched to a new branch 'fix/promotion-banner-conditional-click'`

---

## Task 1: SystemComposedSlide 가 href=null 을 비인터랙티브 div 로 렌더

**Files:**
- Modify: `frontend/apps/web/app/_components/sections/banner/SystemComposedSlide.tsx`
- Modify: `frontend/apps/web/test/sections/banner/system-composed-slide.test.tsx`

### Step 1: 실패하는 테스트 2건 추가

`frontend/apps/web/test/sections/banner/system-composed-slide.test.tsx` 의 `describe('SystemComposedSlide — main variant', ...)` 블록 끝(`'내부 경로는 next/link 로 감싼다'` it 다음) 에 추가:

```tsx
it('main 의 href 가 null 이면 role=link 가 없고 cursor-default 가 적용된 div 로 렌더된다', () => {
  const { container } = render(<SystemComposedSlide variant="main" slide={makeSlide({ href: null })} />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByText('테스트 배너 제목')).toBeInTheDocument();
  const wrappingDiv = container.firstChild as HTMLElement;
  expect(wrappingDiv.tagName.toLowerCase()).toBe('div');
  expect(wrappingDiv.className).toContain('cursor-default');
});

it('main 의 href 가 null 이면 wrapping 요소가 Tab focus 불가능하다', () => {
  const { container } = render(<SystemComposedSlide variant="main" slide={makeSlide({ href: null })} />);
  const wrappingDiv = container.firstChild as HTMLElement;
  expect(wrappingDiv.tagName.toLowerCase()).toBe('div');
  expect(wrappingDiv.tabIndex).toBe(-1);
});
```

### Step 2: 테스트 실행 — 실패 확인

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- system-composed-slide
```

Expected: 두 신규 테스트가 컴파일 시점에 실패 — `SystemComposedSlideData.href: string` 이라 `href: null` 을 받지 못함 (`Type 'null' is not assignable to type 'string'`).

### Step 3: SystemComposedSlideData 타입 풀기

`frontend/apps/web/app/_components/sections/banner/SystemComposedSlide.tsx` 의 type 정의:

기존:
```tsx
export type SystemComposedSlideData = {
  // ...
  href: string;
  // ...
};
```

변경:
```tsx
export type SystemComposedSlideData = {
  // ...
  href: string | null;
  // ...
};
```

### Step 4: MainSlideBody 의 wrapping 분기 추가

`SystemComposedSlide.tsx` 의 MainSlideBody 함수 끝부분 (외부/내부 분기 직전) 에 null 분기를 가장 먼저 추가:

기존:
```tsx
  // typedRoutes 검증을 위해 외부 URL / 내부 라우트를 구분한다.
  if (slide.href.startsWith('http')) {
    return (
      <a href={slide.href} target="_blank" rel="noopener noreferrer" className="block h-full">
        {body}
      </a>
    );
  }
  // 내부 경로는 string 으로 캐스팅 — DB 가 임의의 path 를 줄 수 있어 typedRoutes 검증 우회가 필요하다.
  return (
    <Link href={slide.href as never} className="block h-full">
      {body}
    </Link>
  );
}
```

변경:
```tsx
  // href === null → Spec #7 의 비인터랙티브 컨테이너 (role/tab/cursor 모두 비활성).
  if (slide.href === null) {
    return <div className="block h-full cursor-default">{body}</div>;
  }
  // typedRoutes 검증을 위해 외부 URL / 내부 라우트를 구분한다.
  if (slide.href.startsWith('http')) {
    return (
      <a href={slide.href} target="_blank" rel="noopener noreferrer" className="block h-full">
        {body}
      </a>
    );
  }
  // 내부 경로는 string 으로 캐스팅 — DB 가 임의의 path 를 줄 수 있어 typedRoutes 검증 우회가 필요하다.
  return (
    <Link href={slide.href as never} className="block h-full">
      {body}
    </Link>
  );
}
```

### Step 5: 테스트 실행 — PASS 확인

```bash
pnpm --filter web test -- system-composed-slide
```

Expected: 신규 2건 + 기존 케이스 전체 PASS.

### Step 6: 커밋

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/_components/sections/banner/SystemComposedSlide.tsx \
        frontend/apps/web/test/sections/banner/system-composed-slide.test.tsx
git commit -m "fix(promotion): SystemComposedSlide MainSlideBody 가 href=null 시 비인터랙티브 div 로 렌더"
```

---

## Task 2: FullBleedSlide 가 href=null 을 비인터랙티브 div 로 렌더

**Files:**
- Modify: `frontend/apps/web/app/_components/sections/banner/FullBleedSlide.tsx`
- Modify: `frontend/apps/web/test/sections/banner/full-bleed-slide.test.tsx`

### Step 1: 실패하는 테스트 1건 추가

`describe('FullBleedSlide — main variant', ...)` 블록 끝(`'SYSTEM_COMPOSED 데코 (제목/CTA/이모지) 가 절대 렌더링되지 않는다'` it 다음) 에 추가:

```tsx
it('main 의 href 가 null 이면 role=link 가 없는 div 로 이미지만 렌더된다', () => {
  const { container } = render(<FullBleedSlide variant="main" slide={makeSlide({ href: null })} />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  // 이미지는 그대로 보임
  expect(screen.getByAltText('2026 해커톤 포스터')).toBeInTheDocument();
  // wrapping 요소가 div + cursor-default + tabIndex 없음
  const wrappingDiv = container.firstChild as HTMLElement;
  expect(wrappingDiv.tagName.toLowerCase()).toBe('div');
  expect(wrappingDiv.className).toContain('cursor-default');
  expect(wrappingDiv.tabIndex).toBe(-1);
});
```

### Step 2: 실패 확인

```bash
pnpm --filter web test -- full-bleed-slide
```

Expected: 컴파일 실패 — `FullBleedSlideData.href: string` 이 `null` 을 거부.

### Step 3: FullBleedSlideData 타입 풀기

`frontend/apps/web/app/_components/sections/banner/FullBleedSlide.tsx`:

기존:
```tsx
export type FullBleedSlideData = {
  key: string;
  href: string;
  bannerImageUrl: string | null;
  imageAltText: string | null;
};
```

변경:
```tsx
export type FullBleedSlideData = {
  key: string;
  href: string | null;
  bannerImageUrl: string | null;
  imageAltText: string | null;
};
```

### Step 4: FullBleedMainBody 의 wrapping 분기 추가

`FullBleedSlide.tsx` 의 `FullBleedMainBody` 함수 끝부분 (외부/내부 분기 직전) 에 null 분기를 가장 먼저 추가:

기존:
```tsx
  if (slide.href.startsWith('http')) {
    return (
      <a href={slide.href} target="_blank" rel="noopener noreferrer" className="block h-full">
        {body}
      </a>
    );
  }
  return (
    <Link href={slide.href as never} className="block h-full">
      {body}
    </Link>
  );
}
```

변경:
```tsx
  if (slide.href === null) {
    return <div className="block h-full cursor-default">{body}</div>;
  }
  if (slide.href.startsWith('http')) {
    return (
      <a href={slide.href} target="_blank" rel="noopener noreferrer" className="block h-full">
        {body}
      </a>
    );
  }
  return (
    <Link href={slide.href as never} className="block h-full">
      {body}
    </Link>
  );
}
```

### Step 5: PASS 확인

```bash
pnpm --filter web test -- full-bleed-slide
```

Expected: 신규 1건 + 기존 전체 PASS.

### Step 6: 커밋

```bash
git add frontend/apps/web/app/_components/sections/banner/FullBleedSlide.tsx \
        frontend/apps/web/test/sections/banner/full-bleed-slide.test.tsx
git commit -m "fix(promotion): FullBleedSlide FullBleedMainBody 가 href=null 시 비인터랙티브 div 로 렌더"
```

---

## Task 3: resolvePromotionHref 헬퍼 추출 + mapper 의 /clubs 폴백 제거

**Files:**
- Modify: `frontend/apps/web/app/_components/sections/BannerCarousel.tsx`
- Create: `frontend/apps/web/test/sections/banner/resolve-promotion-href.test.ts`

### Step 1: 헬퍼 단위 테스트 신규 작성 (실패 상태)

`frontend/apps/web/test/sections/banner/resolve-promotion-href.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PromotionCard } from '@duing/types';

import { resolvePromotionHref } from '../../../app/_components/sections/BannerCarousel';

function makePromotion(overrides: Partial<PromotionCard> = {}): PromotionCard {
  return {
    id: 1,
    title: 'T',
    subtitle: null,
    ctaLabel: null,
    linkUrl: null,
    palette: 'INK',
    bannerImageUrl: null,
    club: null,
    tag: null,
    emoji: null,
    renderMode: 'SYSTEM_COMPOSED',
    imageAltText: null,
    ...overrides,
  };
}

describe('resolvePromotionHref', () => {
  it('linkUrl 이 있으면 그 값을 반환한다', () => {
    expect(
      resolvePromotionHref(makePromotion({ linkUrl: 'https://example.com' })),
    ).toBe('https://example.com');
  });

  it('linkUrl 이 없고 club 만 있으면 /clubs/{id} 를 반환한다', () => {
    expect(
      resolvePromotionHref(makePromotion({ club: { id: 7, name: '두잉' } })),
    ).toBe('/clubs/7');
  });

  it('linkUrl 과 club 둘 다 없으면 null 을 반환한다', () => {
    expect(resolvePromotionHref(makePromotion())).toBeNull();
  });

  it('linkUrl 이 club 보다 우선한다 (둘 다 있을 때 linkUrl 선택)', () => {
    expect(
      resolvePromotionHref(
        makePromotion({
          linkUrl: 'https://override.example.com',
          club: { id: 7, name: '두잉' },
        }),
      ),
    ).toBe('https://override.example.com');
  });
});
```

### Step 2: 실패 확인

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- resolve-promotion-href
```

Expected: `resolvePromotionHref` 가 BannerCarousel.tsx 에서 export 되어 있지 않아 import 실패.

### Step 3: BannerCarousel.tsx 변경

`frontend/apps/web/app/_components/sections/BannerCarousel.tsx`:

**3-a) `CarouselSlide` 타입 풀기 (line 20 부근)**

기존:
```tsx
type CarouselSlide = {
  // ...
  href: string;
  // ...
};
```

변경:
```tsx
type CarouselSlide = {
  // ...
  href: string | null;
  // ...
};
```

**3-b) `resolvePromotionHref` 헬퍼 추가 (모듈 스코프, `mockToSlide` 와 `promotionToSlide` 사이 또는 앞)**

```tsx
/**
 * Promotion 의 연결 대상 우선순위:
 * 1. linkUrl (외부/내부 URL — 직접 입력 우선)
 * 2. club (`/clubs/{id}`)
 * 3. null (연결 없음 — 슬라이드를 비인터랙티브로 렌더)
 *
 * Spec #8 (공지 연결) 가 합류할 때 notice 분기를 2 와 3 사이에 한 줄 추가한다.
 */
export function resolvePromotionHref(promotion: PromotionCard): string | null {
  if (promotion.linkUrl) return promotion.linkUrl;
  if (promotion.club) return `/clubs/${promotion.club.id}`;
  return null;
}
```

**3-c) `promotionToSlide` 의 href 라인 (line 67) 을 헬퍼 호출로 교체**

기존:
```tsx
href: promotion.linkUrl ?? (promotion.club ? `/clubs/${promotion.club.id}` : '/clubs'),
```

변경:
```tsx
href: resolvePromotionHref(promotion),
```

### Step 4: 단위 테스트 PASS 확인

```bash
pnpm --filter web test -- resolve-promotion-href
```

Expected: 4건 모두 PASS.

### Step 5: 전체 web 테스트 회귀 확인

```bash
pnpm --filter web test
```

Expected: 모든 테스트 PASS. 특히:
- `system-composed-slide.test.tsx` 의 \"내부 경로는 next/link 로 감싼다\" 케이스가 `href: '/clubs'` 를 명시 전달 → 영향 없음
- `full-bleed-slide.test.tsx` 의 모든 케이스가 makeSlide 에서 명시 href 전달 → 영향 없음

### Step 6: typecheck + lint

```bash
pnpm --filter web typecheck
```
Expected: 0.

```bash
pnpm --filter web lint 2>&1 | grep -E "Warning|Error" | head -5
```
Expected: 기존 경고만, 신규 zero.

### Step 7: 커밋

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/_components/sections/BannerCarousel.tsx \
        frontend/apps/web/test/sections/banner/resolve-promotion-href.test.ts
git commit -m "fix(promotion): resolvePromotionHref 헬퍼 추출 + /clubs 폴백 제거 (CarouselSlide.href = string | null)"
```

---

## Task 4: 최종 회귀 + 브라우저 sanity + PR + 머지

**Files:** none

### Step 1: 전체 typecheck + lint + test 회귀

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck
```
Expected: 0.

```bash
pnpm --filter web lint
```
Expected: 기존 경고만 (이번 변경으로 신규 zero).

```bash
pnpm --filter web test
```
Expected: 모든 테스트 PASS (이전 193 + 본 PR 신규 7 = 200 전후).

### Step 2: 브라우저 sanity

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm dev
```

별도 터미널에서 `http://localhost:3000` 접속, 어드민에서 `linkUrl` 과 `clubId` 둘 다 비운 DB 배너를 만든 후 메인 페이지에서:
- 마우스 hover 시 커서가 클릭 모양(`pointer`) 으로 변하지 않음 (`default` 커서)
- 클릭해도 페이지 이동 zero
- Tab 키 이동 시 해당 배너 wrapping 에 focus 가 잡히지 않고 다음 인터랙티브 요소(슬라이드 인디케이터/화살표 등) 로 skip
- 같은 배너에서 `linkUrl` 또는 `clubId` 를 채워 다시 확인 → 정상적으로 링크 동작 + Tab focus 가능

자동화 환경(headless / CI) 이면 \"브라우저 검증은 PR 리뷰어가 수행\" 으로 PR 본문에 명시.

### Step 3: 브랜치 push

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git push -u origin fix/promotion-banner-conditional-click
```

### Step 4: PR 생성

```bash
gh pr create --base develop --title "fix(promotion): Spec #7 — 배너 조건부 클릭 (linkUrl/clubId 없으면 비인터랙티브)" --body "$(cat <<'EOF'
## 🚀 작업 내용
spec \`docs/superpowers/specs/2026-06-07-promotion-banner-clickability-design.md\` 구현. \`linkUrl\` 과 \`clubId\` 가 모두 비어 있는 DB 배너가 메인 페이지에서 \`/clubs\` 로 자동 이동하던 폴백을 제거하고, 그 상태에서는 슬라이드를 \"완전히 비인터랙티브한 컨테이너\" 로 렌더하도록 변경했습니다.

### 변경 점
- BannerCarousel 의 \`promotionToSlide\` mapper 가 \`/clubs\` 폴백 대신 \`resolvePromotionHref\` 헬퍼를 호출. 헬퍼는 \`linkUrl > club > null\` 우선순위를 단일 함수로 표현하며 Spec #8 (공지 연결) 가 합류할 때 한 줄 삽입만으로 NOTICE 분기를 끼울 수 있도록 설계.
- \`CarouselSlide.href\` 와 두 슬라이드 컴포넌트의 \`href\` 타입을 \`string\` → \`string | null\` 로 완화.
- SystemComposedSlide MainSlideBody 와 FullBleedSlide FullBleedMainBody 가 \`href === null\` 일 때 \`<div className=\"block h-full cursor-default\">\` 로 렌더 — \`<a>\` / \`<Link>\` 가 아닌 일반 div 라 \`role=link\` 없음, \`tabIndex\` 없음(기본 -1), \`cursor-default\` 명시.

### 비인터랙티브의 5요건 (Spec §3)
| 요소 | href 있음 | href === null |
|---|---|---|
| DOM 요소 | \`<a>\` / \`<Link>\` | \`<div>\` |
| ARIA role | \`link\` | 없음 |
| Tab focus | 가능 | 불가능 |
| 커서 | \`pointer\` | \`default\` |
| hover 효과 | 컨테이너 자체에는 없음 | 추가 없음 |

### 테스트
- 신규 RTL: SystemComposedSlide 2건, FullBleedSlide 1건 (\`queryByRole('link')\` 없음 + \`cursor-default\` 확인 + \`tabIndex === -1\` 검증)
- 신규 단위: resolvePromotionHref 4건 (URL/CLUB/null/우선순위)
- 전체 web 테스트 ~200 PASS

### 사이드 미리보기는 그대로
PreviewSlide 들은 \"캐러셀 활성 슬라이드 전환\" 액션이지 배너 navigation 이 아니므로 \`<button>\` 유지 — 본 spec Out of Scope.

## 🤔 고민했던 내용
mapper 의 \`?? '/clubs'\` 폴백 한 줄 제거가 \"폴백 navigation 이 사라지는 의도된 변경\" 이라는 확정이 spec 단계에서 이미 있어 별도 마이그레이션 가드는 두지 않았습니다. \`resolvePromotionHref\` 를 별도 export 함수로 둔 것은 Spec #8 의 NOTICE 분기 추가가 한 줄 변경으로 끝나도록 한 것 + 단위 테스트로 우선순위를 명시한 것 + mapper 가 더 읽기 쉬워진 것 세 가지 이득.

## 📸 sanity
> 본 PR 의 리뷰 단계에서 다음을 시각 확인 권장합니다.
> - 메인 페이지에서 linkUrl/clubId 둘 다 비운 DB 배너에 hover 시 커서가 default
> - 같은 배너 클릭 시 페이지 이동 zero
> - Tab 키 이동 시 해당 배너에 focus 가 잡히지 않음
> - linkUrl 또는 clubId 채워진 배너는 기존 그대로 동작

## 💬 리뷰 중점사항
- mock landingBanners 는 cta/href 가 이미 채워져 있어 영향 zero — 이게 맞는지 (mock 동작 회귀 없는지)
- resolvePromotionHref 의 우선순위 (linkUrl > club > null) 가 의도된 것인지, Spec #8 의 NOTICE 분기를 그 사이에 끼우는 게 자연스러운지
- 사이드 미리보기는 그대로 \`<button>\` 유지 — \"보조 배너 클릭 동작\" 도 비인터랙티브화 해야 하는지 다시 고려가 필요한지
EOF
)"
```

### Step 5: PR 번호 캡처 후 머지

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
| §3 비인터랙티브 5요건 (DOM/role/tab/cursor/hover) | MainSlideBody/FullBleedMainBody null 분기 | Task 1 + Task 2 |
| §4 resolvePromotionHref helper 추출 | BannerCarousel 모듈 export 함수 | Task 3 |
| §5.1 CarouselSlide.href: string \| null | BannerCarousel 타입 변경 | Task 3 |
| §5.2 SystemComposedSlideData.href: string \| null | Task 1 |
| §5.3 FullBleedSlideData.href: string \| null | Task 2 |
| §5.4 mock 매핑 영향 zero | mockToSlide 미수정 + 기존 테스트 그대로 PASS | Task 3 (회귀로 확인) |
| §7 RTL 테스트 명세 (3 케이스) | Task 1 (2 건) + Task 2 (1건) |
| §8.1 자동화 회귀 | Task 4 (전체 풀-스위트) |
| §8.2 브라우저 sanity | Task 4 Step 2 |

**Placeholder scan:** \"TBD\", \"TODO\", \"적절히 처리\" 등 zero.

**Type consistency:**
- `string | null` 표기 일관 (Task 1/2/3 모두 동일)
- `resolvePromotionHref` 식별자 일관 (선언 / 호출 / 테스트 import 모두 동일)
- `cursor-default` 클래스명 일관
- `tabIndex === -1` (브라우저가 `<div>` 에 부여하는 기본값) RTL 검증 패턴 Task 1+2 동일

---

## 참고

- spec: `docs/superpowers/specs/2026-06-07-promotion-banner-clickability-design.md`
- 선행 사양: `2026-06-07-promotion-banner-ux-refinements-design.md`
- 후속 사양 / plan: Spec #8 (`2026-06-07-promotion-notice-link-design.md`) — 본 PR 머지 후 별도 plan 작성, `resolvePromotionHref` 에 NOTICE 분기 한 줄 추가.
- 메모리 가이드 준수: Conventional Commits, `[#이슈번호]` 형식 금지, Co-Authored-By 라인 금지, `gh pr checks --watch` 금지.
