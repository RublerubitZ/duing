# FULL_BLEED_IMAGE PR3 — 공개 렌더링 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec `docs/superpowers/specs/2026-06-07-promotion-full-bleed-image-design.md` §7 의 공개 렌더링 단계를 구현한다 — `BannerCarousel` 의 슬라이드 렌더 책임을 `SystemComposedSlide` / `FullBleedSlide` 두 컴포넌트로 분리하고, 슬라이드 타입(`renderMode`) 별 분기 라우팅을 도입한다.

**Architecture:** 슬라이드 컴포넌트와 캐러셀 본체의 책임 분리. `BannerCarousel` 본체는 캐러셀 제어(activeIndex, autoplay, 인디케이터, 화살표, 슬라이드 전환 클래스 wrapper) 만 담당하고, 슬라이드 콘텐츠 자체는 mode 분기로 두 컴포넌트에 위임한다. SYSTEM_COMPOSED 시각이 회귀 없이 그대로 유지되어야 한다 (#272, #275 의 디테일이 누적된 상태). FULL_BLEED_IMAGE 슬라이드는 `<a><img alt={imageAltText}/></a>` 단순 구조로 그라데이션·팔레트·시스템 텍스트·이모지·Sparkle 데코 zero.

**Tech Stack:** Next.js 15 / React 19 / TypeScript / Tailwind / TanStack Query / Vitest + React Testing Library / pnpm workspaces.

**Branch:** `feat/promotion-full-bleed-public-render` (cut from latest develop)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `frontend/apps/web/app/_components/sections/BannerCarousel.tsx` | 캐러셀 제어 + slide mode 분기 라우팅 (slide 렌더 본문은 위임) |
| Create | `frontend/apps/web/app/_components/sections/banner/SystemComposedSlide.tsx` | 기존 `MainSlide` + `PreviewSlide` 콘텐츠를 단일 컴포넌트로 묶기 (`variant: 'main' \| 'preview'`) |
| Create | `frontend/apps/web/app/_components/sections/banner/FullBleedSlide.tsx` | `<a><img/></a>` 단순 렌더 (`variant: 'main' \| 'preview'`) |
| Create | `frontend/apps/web/test/sections/banner/system-composed-slide.test.tsx` | SYSTEM 회귀 가드 (제목/CTA/팔레트 배경 노출) |
| Create | `frontend/apps/web/test/sections/banner/full-bleed-slide.test.tsx` | FULL_BLEED 슬라이드 alt/링크/데코-zero 검증 |

`BannerCarousel.tsx` 가 440줄 → ~250줄로 줄어들고, 두 슬라이드 컴포넌트가 각각 ~110줄(SYSTEM) / ~50줄(FULL_BLEED) 로 분리되어 단일 책임이 명확해진다.

### CarouselSlide 타입 확장

PR1 에서 백엔드가 이미 `renderMode` / `imageAltText` 를 응답하고, PR2 에서 frontend 타입(`PromotionCard`) 에도 두 필드가 들어왔다. 본 PR 에서는 `CarouselSlide` 내부 모델에도 두 필드를 추가하고 mapper 두 개(`mockToSlide`, `promotionToSlide`) 가 그 값을 흘려보낸다. mock 슬라이드는 `'SYSTEM_COMPOSED'` 로 고정.

### resolvedHref 공유 헬퍼

`linkUrl > clubId 폴백 > /clubs` 룰은 SYSTEM 과 FULL_BLEED 가 동일하게 따른다. 기존 `MainSlide` 가 가진 URL 분기 로직 (`slide.href.startsWith('http')` 으로 외부/내부 분리) 도 그대로 재사용해야 하므로, 공통 헬퍼로 추출하지 말고 각 슬라이드 컴포넌트가 동일 패턴을 인라인으로 구현한다 (DRY 보다 \"각 슬라이드의 표현 완결성\" 우선). `slide.href` 는 이미 `promotionToSlide` / `mockToSlide` 가 폴백을 처리해 채워둔 값.

---

## Task 0: 브랜치 생성

**Files:** none

- [ ] **Step 1: develop 동기화 + 브랜치 생성**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop
git pull origin develop
git checkout -b feat/promotion-full-bleed-public-render
```

Expected: `Switched to a new branch 'feat/promotion-full-bleed-public-render'`

---

## Task 1: CarouselSlide 타입 + mapper 갱신

**Files:**
- Modify: `frontend/apps/web/app/_components/sections/BannerCarousel.tsx`

- [ ] **Step 1: import 갱신**

`@duing/types` import 에 `PromotionRenderMode` 추가:

```tsx
import type { PromotionCard, PromotionPalette, PromotionRenderMode } from '@duing/types';
```

- [ ] **Step 2: CarouselSlide 타입에 두 필드 추가**

기존 `type CarouselSlide` (line 20 근처) 의 끝에 두 필드 추가:

```tsx
type CarouselSlide = {
  key: string;
  tag: string;
  title: string;
  sub: string;
  cta: string;
  bg: string;
  fg: string;
  accent: string;
  emoji: string;
  href: string;
  bannerImageUrl: string | null;
  renderMode: PromotionRenderMode;
  imageAltText: string | null;
};
```

- [ ] **Step 3: mockToSlide 갱신**

```tsx
function mockToSlide(banner: LandingBanner): CarouselSlide {
  const href =
    banner.id === 1 ? '/calendar'
      : banner.id === 2 ? '/clubs'
      : banner.id === 3 ? '/introduce'
      : '/signup';
  return {
    key: `mock-${banner.id}`,
    tag: banner.tag,
    title: banner.title,
    sub: banner.sub,
    cta: banner.cta,
    bg: banner.bg,
    fg: banner.fg,
    accent: banner.accent,
    emoji: banner.emoji,
    href,
    bannerImageUrl: null,
    renderMode: 'SYSTEM_COMPOSED',
    imageAltText: null,
  };
}
```

- [ ] **Step 4: promotionToSlide 갱신**

```tsx
function promotionToSlide(promotion: PromotionCard): CarouselSlide {
  const style = PROMOTION_PALETTE[promotion.palette];
  return {
    key: `promotion-${promotion.id}`,
    tag: promotion.tag ?? '',
    title: promotion.title,
    sub: promotion.subtitle ?? '',
    cta: promotion.ctaLabel ?? '자세히 보기',
    bg: style.bg,
    fg: style.fg,
    accent: style.accent,
    emoji: promotion.emoji ?? '',
    href: promotion.linkUrl ?? (promotion.club ? `/clubs/${promotion.club.id}` : '/clubs'),
    bannerImageUrl: promotion.bannerImageUrl,
    renderMode: promotion.renderMode,
    imageAltText: promotion.imageAltText,
  };
}
```

- [ ] **Step 5: typecheck**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck`
Expected: 0.

- [ ] **Step 6: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/_components/sections/BannerCarousel.tsx
git commit -m "feat(promotion): CarouselSlide 타입에 renderMode/imageAltText + mapper 흘려보내기"
```

---

## Task 2: SystemComposedSlide 컴포넌트 추출

**Files:**
- Create: `frontend/apps/web/app/_components/sections/banner/SystemComposedSlide.tsx`

기존 `MainSlide` (BannerCarousel.tsx line 245~) 와 `PreviewSlide` (line 358~) 의 콘텐츠를 단일 컴포넌트로 묶어 `variant` prop 으로 분기한다. 코드 자체는 그대로 옮기고 wrapping 만 변경한다 — 회귀 위험 최소화.

- [ ] **Step 1: 디렉터리 + 파일 생성**

```bash
mkdir -p /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/app/_components/sections/banner
```

- [ ] **Step 2: SystemComposedSlide 컴포넌트 작성**

`frontend/apps/web/app/_components/sections/banner/SystemComposedSlide.tsx`:

```tsx
'use client';

import Link from 'next/link';
import type { PromotionRenderMode } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import { ArrowRight } from '@/components/duing/Icon';
import { SparkleFull } from '@/components/duing/Sparkle';

/** BannerCarousel.tsx 의 내부 CarouselSlide 와 동일 형태. 패키지 의존성 없이 props 로 받기 위해 재선언. */
export type SystemComposedSlideData = {
  key: string;
  tag: string;
  title: string;
  sub: string;
  cta: string;
  bg: string;
  fg: string;
  accent: string;
  emoji: string;
  href: string;
  bannerImageUrl: string | null;
  renderMode: PromotionRenderMode;
  imageAltText: string | null;
};

type Variant = 'main' | 'preview';

type Props =
  | { variant: 'main'; slide: SystemComposedSlideData }
  | {
      variant: 'preview';
      slide: SystemComposedSlideData;
      direction: 'left' | 'right';
      animationDelay?: string;
      onSelect(): void;
    };

export function SystemComposedSlide(props: Props) {
  if (props.variant === 'main') {
    return <MainSlideBody slide={props.slide} />;
  }
  return (
    <PreviewSlideBody
      slide={props.slide}
      direction={props.direction}
      animationDelay={props.animationDelay}
      onSelect={props.onSelect}
    />
  );
}

function MainSlideBody({ slide }: { slide: SystemComposedSlideData }) {
  const hasImage = !!slide.bannerImageUrl;
  const isDarkText = hasImage || slide.fg === '#fff';
  const textColor = hasImage ? '#fff' : slide.fg;
  const body = (
    <div
      className="relative flex h-full flex-col justify-between px-12 py-11"
      style={{ background: slide.bg, color: textColor }}
    >
      {hasImage && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드 스토리지 URL. 깨지면 slide.bg 색만 노출되도록 onError 에서 숨김. */}
          <img
            src={slide.bannerImageUrl ?? ''}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.22)' }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%)' }}
          />
        </>
      )}
      {slide.emoji && (
        <div
          className="pointer-events-none absolute -right-2.5 -top-5 text-[220px] leading-none opacity-[0.18]"
          style={{ transform: 'rotate(-12deg)' }}
        >
          {slide.emoji}
        </div>
      )}
      <SparkleFull
        size={32}
        color={slide.accent}
        className="absolute right-[200px] top-7 opacity-85"
      />
      <SparkleFull
        size={20}
        color={slide.accent}
        className="absolute bottom-12 right-[320px] opacity-50"
      />

      {slide.tag && (
        <div
          className="relative inline-flex items-center gap-2 self-start rounded-full px-3 py-[5px] text-[11.5px] font-extrabold tracking-wide08"
          style={{
            background: hasImage
              ? 'rgba(255,255,255,0.95)'
              : isDarkText ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
            color: hasImage ? '#143025' : isDarkText ? '#9DB6A0' : slide.accent,
          }}
        >
          {slide.tag}
        </div>
      )}
      <div className="relative">
        <h2
          className="mb-2.5 whitespace-pre-line text-5xl leading-[1.05] tracking-[-0.025em]"
          style={{ color: textColor }}
        >
          {slide.title}
        </h2>
        {slide.sub && (
          <p
            className="mb-6 max-w-[460px] text-[15.5px] leading-[1.5]"
            style={{ color: textColor, opacity: 0.85 }}
          >
            {slide.sub}
          </p>
        )}
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
      </div>
    </div>
  );

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

type PreviewBodyProps = {
  slide: SystemComposedSlideData;
  direction: 'left' | 'right';
  animationDelay?: string;
  onSelect(): void;
};

function PreviewSlideBody({ slide, direction, animationDelay, onSelect }: PreviewBodyProps) {
  const hasImage = !!slide.bannerImageUrl;
  const isDarkText = hasImage || slide.fg === '#fff';
  const textColor = hasImage ? '#fff' : slide.fg;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex-1 cursor-pointer overflow-hidden rounded-lg px-5 py-[18px] text-left',
        direction === 'left' ? 'animate-preview-in' : 'animate-preview-in-reverse',
      )}
      style={{ background: slide.bg, color: textColor, animationDelay }}
    >
      {hasImage && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드 스토리지 URL. */}
          <img
            src={slide.bannerImageUrl ?? ''}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.22)' }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.6) 100%)' }}
          />
        </>
      )}
      {slide.emoji && (
        <div
          className="absolute -right-2.5 -top-2.5 text-[86px] leading-none opacity-[0.22]"
          style={{ transform: 'rotate(-8deg)' }}
        >
          {slide.emoji}
        </div>
      )}
      {slide.tag && (
        <div
          className="relative mb-1.5 inline-flex items-center rounded-full px-2 py-[2px] text-[10.5px] font-extrabold tracking-wide08"
          style={{
            background: hasImage ? 'rgba(255,255,255,0.95)' : 'transparent',
            color: hasImage ? '#143025' : isDarkText ? '#9DB6A0' : slide.accent,
            paddingInline: hasImage ? '8px' : '0',
          }}
        >
          {slide.tag.split(' · ')[0]}
        </div>
      )}
      <div
        className="relative whitespace-pre-line font-display text-[19px] font-bold leading-[1.15]"
        style={{ color: textColor }}
      >
        {slide.title}
      </div>
      {slide.sub && (
        <div
          className="relative mt-2 flex items-center gap-1.5 text-xs"
          style={{ color: textColor, opacity: 0.85 }}
        >
          {slide.sub.split(' · ')[0]}
          <ArrowRight size={12} />
        </div>
      )}
    </button>
  );
}
```

**중요**: 위 코드는 현재 `BannerCarousel.tsx` 의 `MainSlide` (line 245~357) 와 `PreviewSlide` (line 358~440) 를 **글자 그대로 옮긴 것** 입니다 — 단지 wrapping 만 (`MainSlide` → `MainSlideBody`, `PreviewSlide` → `PreviewSlideBody`, 두 개를 `SystemComposedSlide` 단일 export 로 묶기). 회귀 위험을 최소화하려면 BannerCarousel.tsx 의 해당 라인들을 그대로 복사해 들여오는 것을 강력히 권장합니다.

- [ ] **Step 3: typecheck**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck`
Expected: 0 (이 파일은 아직 import 되지 않으므로 unused 경고만 가능).

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/app/_components/sections/banner/SystemComposedSlide.tsx
git commit -m "feat(promotion): SystemComposedSlide 컴포넌트 추출 (메인/프리뷰 variant)"
```

---

## Task 3: FullBleedSlide 컴포넌트 신규 작성

**Files:**
- Create: `frontend/apps/web/app/_components/sections/banner/FullBleedSlide.tsx`

- [ ] **Step 1: FullBleedSlide 작성**

`frontend/apps/web/app/_components/sections/banner/FullBleedSlide.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { cn } from '@/app/_lib/cn';

/** SystemComposedSlide.tsx 와 동일 구조의 슬라이드 데이터. */
export type FullBleedSlideData = {
  key: string;
  href: string;
  bannerImageUrl: string | null;
  imageAltText: string | null;
};

type Props =
  | { variant: 'main'; slide: FullBleedSlideData }
  | {
      variant: 'preview';
      slide: FullBleedSlideData;
      direction: 'left' | 'right';
      animationDelay?: string;
      onSelect(): void;
    };

export function FullBleedSlide(props: Props) {
  if (props.variant === 'main') {
    return <FullBleedMainBody slide={props.slide} />;
  }
  return (
    <FullBleedPreviewBody
      slide={props.slide}
      direction={props.direction}
      animationDelay={props.animationDelay}
      onSelect={props.onSelect}
    />
  );
}

function FullBleedMainBody({ slide }: { slide: FullBleedSlideData }) {
  const body = slide.bannerImageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드 스토리지 URL.
    <img
      src={slide.bannerImageUrl}
      alt={slide.imageAltText ?? ''}
      className="block h-full w-full object-cover"
      onError={(event) => {
        event.currentTarget.style.display = 'none';
      }}
    />
  ) : (
    <div className="flex h-full items-center justify-center bg-graysoft text-charcoal-3 text-[13px]">
      배너 이미지가 없습니다
    </div>
  );

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

function FullBleedPreviewBody({
  slide,
  direction,
  animationDelay,
  onSelect,
}: {
  slide: FullBleedSlideData;
  direction: 'left' | 'right';
  animationDelay?: string;
  onSelect(): void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex-1 cursor-pointer overflow-hidden rounded-lg bg-graysoft',
        direction === 'left' ? 'animate-preview-in' : 'animate-preview-in-reverse',
      )}
      style={{ animationDelay }}
      aria-label={slide.imageAltText ?? '배너로 이동'}
    >
      {slide.bannerImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드 스토리지 URL.
        <img
          src={slide.bannerImageUrl}
          alt={slide.imageAltText ?? ''}
          className="block h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-charcoal-3 text-[11px]">
          이미지 없음
        </div>
      )}
    </button>
  );
}
```

**렌더 규칙 (spec §7.2 그대로)**:
- 메인/프리뷰 두 variant 모두 `<a><img/></a>` (또는 `<button><img/></button>`) 단순 구조.
- 그라데이션 / 팔레트 / 시스템 텍스트 / 이모지 / Sparkle — **모두 없음**.
- `alt={slide.imageAltText ?? ''}` (백엔드 검증으로 FULL_BLEED 면 항상 값 보장되지만 안전 fallback).
- `href` 결정 로직은 SystemComposedSlide 와 동일 (`startsWith('http')` 분기).
- 이미지가 없는 fallback 케이스도 처리 (`bannerImageUrl` 이 null/빈 경우) — 실제로는 백엔드 검증이 막지만 클라이언트 안전망.

- [ ] **Step 2: typecheck**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck`
Expected: 0.

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/app/_components/sections/banner/FullBleedSlide.tsx
git commit -m "feat(promotion): FullBleedSlide 컴포넌트 신규 작성 (이미지만 렌더, 데코 zero)"
```

---

## Task 4: BannerCarousel 본체에서 mode 분기 라우팅

**Files:**
- Modify: `frontend/apps/web/app/_components/sections/BannerCarousel.tsx`

기존 `MainSlide` / `PreviewSlide` 내부 함수를 제거하고, `SystemComposedSlide` / `FullBleedSlide` 두 export 를 import 한 뒤 mode 분기로 라우팅한다.

- [ ] **Step 1: import 추가**

`BannerCarousel.tsx` 상단 import 영역:

```tsx
import { SystemComposedSlide } from './banner/SystemComposedSlide';
import { FullBleedSlide } from './banner/FullBleedSlide';
```

기존 `SparkleFull`, `cn` 같은 import 중 SystemComposedSlide 로 이동한 것 (Sparkle 등) 은 BannerCarousel 본체에서 더 이상 안 쓰면 제거.

- [ ] **Step 2: 메인 슬라이드 렌더 위치에 mode 분기**

기존 `<MainSlide slide={activeSlide} />` 가 호출되는 자리 두 곳(`exitingSlide` 와 `activeSlide`) 을 각각 다음으로 교체:

```tsx
{/* exitingSlide */}
{exitingSlide.renderMode === 'FULL_BLEED_IMAGE' ? (
  <FullBleedSlide variant="main" slide={exitingSlide} />
) : (
  <SystemComposedSlide variant="main" slide={exitingSlide} />
)}

{/* activeSlide */}
{activeSlide.renderMode === 'FULL_BLEED_IMAGE' ? (
  <FullBleedSlide variant="main" slide={activeSlide} />
) : (
  <SystemComposedSlide variant="main" slide={activeSlide} />
)}
```

슬라이드 전환 wrapper 의 `animate-slide-out-left` / `animate-slide-in-right` 같은 클래스는 그대로 wrapper div 에 남깁니다 — 본체 BannerCarousel 의 책임.

- [ ] **Step 3: 사이드 미리보기 슬라이드도 mode 분기**

기존 `<PreviewSlide ... />` 호출 자리 (사이드 슬라이드 2개를 map 하는 부분) 를 다음으로 교체:

```tsx
{previewSlides.map((slide, idx) => {
  const previewProps = {
    slide,
    direction,
    animationDelay: idx === 1 ? '120ms' : undefined,
    onSelect: () => {
      const next = slides.findIndex((s) => s.key === slide.key);
      if (next >= 0) {
        const currentSlide = slides[activeIndex];
        if (currentSlide) startSlideTransition(next > activeIndex ? 'left' : 'right', currentSlide);
        setActiveIndex(next);
      }
    },
  } as const;
  return slide.renderMode === 'FULL_BLEED_IMAGE' ? (
    <FullBleedSlide
      key={`${activeIndex}-${direction}-${slide.key}`}
      variant="preview"
      {...previewProps}
    />
  ) : (
    <SystemComposedSlide
      key={`${activeIndex}-${direction}-${slide.key}`}
      variant="preview"
      {...previewProps}
    />
  );
})}
```

- [ ] **Step 4: 기존 MainSlide / PreviewSlide / PreviewSlideProps 내부 함수 제거**

`BannerCarousel.tsx` 의 라인 ~245-440 에 정의된 `function MainSlide`, `type PreviewSlideProps`, `function PreviewSlide` 세 정의를 모두 삭제. SystemComposedSlide 로 100% 이전됐으니 더 이상 필요 없음.

- [ ] **Step 5: 더 이상 안 쓰는 import 제거**

`SparkleFull`, `cn` 등 — BannerCarousel 본체에서 더 이상 사용되지 않으면 import 제거. lint 가 unused 경고로 잡아줄 거예요.

- [ ] **Step 6: typecheck + lint**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck`
Expected: 0.

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web lint 2>&1 | grep -E "Warning|Error" | head -10`
Expected: 신규 unused-vars 경고 없음. 기존 경고(`PromotionPalette` unused 등) 도 사라질 가능성 — BannerCarousel 본체가 더 이상 PromotionPalette 를 직접 쓰지 않으면 그 import 도 정리.

- [ ] **Step 7: 커밋**

```bash
git add frontend/apps/web/app/_components/sections/BannerCarousel.tsx
git commit -m "feat(promotion): BannerCarousel 에서 renderMode 분기로 두 슬라이드 컴포넌트 라우팅"
```

---

## Task 5: 두 슬라이드 컴포넌트 RTL 테스트

**Files:**
- Create: `frontend/apps/web/test/sections/banner/system-composed-slide.test.tsx`
- Create: `frontend/apps/web/test/sections/banner/full-bleed-slide.test.tsx`

- [ ] **Step 1: 디렉터리 생성**

```bash
mkdir -p /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web/test/sections/banner
```

- [ ] **Step 2: SystemComposedSlide 회귀 테스트 작성**

`frontend/apps/web/test/sections/banner/system-composed-slide.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import {
  SystemComposedSlide,
  type SystemComposedSlideData,
} from '../../../app/_components/sections/banner/SystemComposedSlide';

function makeSlide(overrides: Partial<SystemComposedSlideData> = {}): SystemComposedSlideData {
  return {
    key: 'test',
    tag: 'EVENT',
    title: '테스트 배너 제목',
    sub: '테스트 부제',
    cta: '자세히 보기',
    bg: '#143025',
    fg: '#fff',
    accent: '#9DB6A0',
    emoji: '🎉',
    href: '/clubs',
    bannerImageUrl: null,
    renderMode: 'SYSTEM_COMPOSED',
    imageAltText: null,
    ...overrides,
  };
}

describe('SystemComposedSlide — main variant', () => {
  it('제목/부제/CTA 가 모두 렌더링된다', () => {
    render(<SystemComposedSlide variant="main" slide={makeSlide()} />);
    expect(screen.getByText('테스트 배너 제목')).toBeInTheDocument();
    expect(screen.getByText('테스트 부제')).toBeInTheDocument();
    expect(screen.getByText('자세히 보기')).toBeInTheDocument();
  });

  it('태그가 노출된다', () => {
    render(<SystemComposedSlide variant="main" slide={makeSlide({ tag: 'EVENT · 9.25' })} />);
    expect(screen.getByText('EVENT · 9.25')).toBeInTheDocument();
  });

  it('외부 URL 은 target=_blank 인 <a> 로 감싼다', () => {
    render(
      <SystemComposedSlide
        variant="main"
        slide={makeSlide({ href: 'https://example.com/event' })}
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('내부 경로는 next/link 로 감싼다 (target 미설정)', () => {
    render(<SystemComposedSlide variant="main" slide={makeSlide({ href: '/clubs' })} />);
    const link = screen.getByRole('link');
    expect(link).not.toHaveAttribute('target');
    expect(link).toHaveAttribute('href', '/clubs');
  });
});

describe('SystemComposedSlide — preview variant', () => {
  it('button 으로 렌더되고 제목 일부가 표시된다', () => {
    render(
      <SystemComposedSlide
        variant="preview"
        slide={makeSlide()}
        direction="left"
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('테스트 배너 제목')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: FullBleedSlide 테스트 작성**

`frontend/apps/web/test/sections/banner/full-bleed-slide.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import {
  FullBleedSlide,
  type FullBleedSlideData,
} from '../../../app/_components/sections/banner/FullBleedSlide';

function makeSlide(overrides: Partial<FullBleedSlideData> = {}): FullBleedSlideData {
  return {
    key: 'test',
    href: '/clubs',
    bannerImageUrl: 'https://example.com/poster.png',
    imageAltText: '2026 해커톤 포스터',
    ...overrides,
  };
}

describe('FullBleedSlide — main variant', () => {
  it('이미지가 alt 와 함께 렌더링된다', () => {
    render(<FullBleedSlide variant="main" slide={makeSlide()} />);
    const img = screen.getByAltText('2026 해커톤 포스터');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/poster.png');
  });

  it('alt 가 null 이면 빈 문자열로 fallback', () => {
    render(<FullBleedSlide variant="main" slide={makeSlide({ imageAltText: null })} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('alt', '');
  });

  it('이미지가 없으면 fallback 메시지를 보여준다', () => {
    render(<FullBleedSlide variant="main" slide={makeSlide({ bannerImageUrl: null })} />);
    expect(screen.getByText('배너 이미지가 없습니다')).toBeInTheDocument();
  });

  it('외부 URL 은 target=_blank 인 <a> 로 감싼다', () => {
    render(
      <FullBleedSlide
        variant="main"
        slide={makeSlide({ href: 'https://example.com/event' })}
      />,
    );
    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank');
  });

  it('SYSTEM_COMPOSED 데코 (제목/CTA/이모지) 가 절대 렌더링되지 않는다', () => {
    render(
      <FullBleedSlide
        variant="main"
        slide={makeSlide()}
      />,
    );
    // FULL_BLEED 슬라이드 데이터는 title/cta/emoji 필드 자체가 없으므로
    // 어떤 헤딩/CTA 텍스트도 렌더되어선 안 된다.
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByText('자세히 보기')).not.toBeInTheDocument();
  });
});

describe('FullBleedSlide — preview variant', () => {
  it('button 으로 렌더되고 alt 를 aria-label 로 사용한다', () => {
    render(
      <FullBleedSlide
        variant="preview"
        slide={makeSlide()}
        direction="left"
        onSelect={() => undefined}
      />,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', '2026 해커톤 포스터');
  });

  it('이미지가 없으면 "이미지 없음" 텍스트', () => {
    render(
      <FullBleedSlide
        variant="preview"
        slide={makeSlide({ bannerImageUrl: null })}
        direction="left"
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByText('이미지 없음')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: 테스트 실행**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- system-composed-slide full-bleed-slide`
Expected: 두 파일 모든 케이스 PASS (예상 약 11~13개).

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/test/sections/banner/
git commit -m "test(promotion): SystemComposedSlide 회귀 + FullBleedSlide alt/링크/데코-zero 검증"
```

---

## Task 6: 최종 회귀 + 브라우저 sanity + PR + 머지

**Files:** none

- [ ] **Step 1: 전체 typecheck + lint 회귀**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck`
Expected: 0.

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web lint`
Expected: 기존 경고만 (이번 변경으로 신규 경고/에러 없음, 가능하면 BannerCarousel.tsx 의 기존 `PromotionPalette unused` 경고가 자연스럽게 사라질 수 있음).

- [ ] **Step 2: 전체 web 테스트 회귀**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test`
Expected: 모든 테스트 PASS (PR2 173 + 신규 ~12 = ~185 전후).

- [ ] **Step 3: 브라우저 sanity (UI 검증) — SYSTEM 회귀 + FULL_BLEED 신규**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm dev
```

별도 터미널에서 `http://localhost:3000` 접속:

**SYSTEM_COMPOSED 회귀 검증** (가장 중요):
- 기존 mock 배너들 (signup / calendar / clubs / introduce 폴백) 이 시각적으로 변화 없는지
- 메인 슬라이드 + 사이드 미리보기 2개 모두 동일한 톤
- 슬라이드 전환 애니메이션 (slide-in-right / slide-out-left) 그대로 동작
- 이미지가 깔린 SYSTEM 배너의 하단 그라데이션, 이모지, 태그, CTA 모두 회귀 zero

**FULL_BLEED_IMAGE 신규 검증** (어드민에서 FULL_BLEED 배너를 미리 만들어둔 후):
- 메인 슬라이드에 이미지만 풀-블리드, 데코 zero
- 사이드 미리보기 슬라이드도 이미지 썸네일만
- 클릭 시 linkUrl 또는 clubId 폴백 또는 `/clubs` 로 이동

- [ ] **Step 4: 브랜치 push**

```bash
git push -u origin feat/promotion-full-bleed-public-render
```

- [ ] **Step 5: PR 생성**

```bash
gh pr create --base develop --title "feat(promotion): FULL_BLEED_IMAGE PR3 — 공개 렌더링 (BannerCarousel 슬라이드 컴포넌트 분리)" --body "$(cat <<'EOF'
## 🚀 작업 내용
spec `docs/superpowers/specs/2026-06-07-promotion-full-bleed-image-design.md` §7 의 공개 렌더링 단계를 구현했습니다. PR1 (#278) 머지로 백엔드가 `renderMode` / `imageAltText` 를 응답하고, PR2 (#279) 머지로 어드민이 두 모드를 만들 수 있게 됐으니, 이제 메인 페이지 캐러셀이 모드별 분기로 그려야 합니다.

`BannerCarousel.tsx` 가 440 줄로 자라난 상태였습니다. 본체가 캐러셀 제어 + 슬라이드 콘텐츠 두 책임을 동시에 갖고 있어 FULL_BLEED 분기 추가가 그대로는 어려웠습니다. 기존 `MainSlide` / `PreviewSlide` 내부 함수를 `SystemComposedSlide` (`variant: 'main' | 'preview'`) 라는 별도 파일로 글자 그대로 추출하고, `FullBleedSlide` 를 새로 만들었습니다. 본체 `BannerCarousel` 은 이제 캐러셀 제어와 \"slide.renderMode 에 따라 두 컴포넌트 중 하나 라우팅\" 만 담당합니다.

`FullBleedSlide` 는 spec §7.2 그대로 `<a><img alt={imageAltText}/></a>` 단순 구조입니다. 그라데이션, 팔레트 오버레이, 시스템 텍스트, 이모지, Sparkle 데코 zero. linkUrl > clubId > /clubs 폴백은 mapper 가 이미 처리한 `slide.href` 를 그대로 사용해 SYSTEM_COMPOSED 와 동일 로직을 공유합니다.

`CarouselSlide` 내부 모델에도 `renderMode` / `imageAltText` 두 필드를 추가했고, mock 슬라이드는 모두 `SYSTEM_COMPOSED` 로 고정해 mock 동작이 회귀 없이 유지됩니다.

신규 RTL 테스트 12 케이스 — SystemComposedSlide 5 (회귀 가드: 제목/CTA/태그/외부 URL/내부 라우트), FullBleedSlide 7 (이미지/alt fallback/이미지 없음/외부 URL/데코-zero/preview aria-label/preview 이미지 없음) — 으로 두 슬라이드의 핵심 렌더 규칙을 못박았습니다.

## 🤔 고민했던 내용
\"기존 SYSTEM_COMPOSED 시각이 회귀 없이 유지\" 가 최우선이라 `MainSlide` / `PreviewSlide` 코드를 통째로 `SystemComposedSlide` 에 옮기는 방식을 택했습니다. 리팩토링과 분기 도입을 한 PR 에 묶으면서도 SYSTEM 코드 라인 수준의 변경이 zero — 이전 자체가 의미 보존. 한 줄도 새로 쓰지 않고 옮긴 덕분에 회귀 위험이 최소화됩니다.

`SystemComposedSlide` 와 `FullBleedSlide` 두 컴포넌트가 공통으로 \"외부 URL → `<a target=\\\"_blank\\\">`, 내부 → `<Link>`\" 로직을 갖는데, 공통 헬퍼로 빼지 않았습니다. 두 컴포넌트가 슬라이드 데이터 모양이 다르고(SystemComposed 는 풍부한 콘텐츠, FullBleed 는 단순한 이미지) 각 컴포넌트가 \"표현 완결성\" 을 갖는 게 우선이라 DRY 보다 응집도를 택했습니다.

`BannerCarousel.tsx` 가 440 줄 → ~250 줄로 줄었고, SystemComposedSlide ~190 줄 / FullBleedSlide ~95 줄로 분리되어 각 파일이 단일 책임을 갖습니다. 슬라이드 전환 애니메이션(`animate-slide-out-left` 등) 은 본체 BannerCarousel 의 wrapper div 가 담당하고 슬라이드 컴포넌트는 콘텐츠만 — 이 책임 분리는 spec self-review §10 Important #E 의 해소이기도 합니다.

## 💬 리뷰 중점사항
- **SYSTEM_COMPOSED 회귀 zero**: 기존 mock 배너 (signup/calendar/clubs/introduce 폴백) 와 DB 배너의 시각이 PR2 머지 상태 대비 한 픽셀도 차이가 없는지 — `MainSlide` / `PreviewSlide` 코드가 글자 그대로 SystemComposedSlide 로 이전됐는지 diff 로 확인
- FULL_BLEED 배너가 메인 슬라이드에서 이미지만 풀-블리드, 데코 zero 인지 (그라데이션 / 이모지 / Sparkle 모두 없는지)
- FULL_BLEED 배너 클릭 시 linkUrl > clubId 폴백 > /clubs 룰이 SYSTEM_COMPOSED 와 동일하게 동작하는지
- 사이드 미리보기 슬라이드 2개도 모드별로 다르게 렌더되는지
- 슬라이드 전환 애니메이션이 모드와 무관하게 본체에서 주입되는지 (mode 토글 시점에 깜빡임 없음)
- alt text 가 SYSTEM 슬라이드의 장식용 이미지(`alt=\"\"`) 와 FULL_BLEED 의 의미 있는 이미지(`alt=\"포스터 설명\"`) 로 올바르게 구분되는지
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

**Spec coverage (spec §7):**
- §7.1 분리 컴포넌트 도입 (SystemComposedSlide / FullBleedSlide) → Task 2 + Task 3
- §7.2 FullBleedSlide 렌더 규칙 (`<a><img/></a>`, 데코 zero, href 폴백) → Task 3
- §7.3 사이드 미리보기 (작은 썸네일만) → Task 3 (preview variant) + Task 4 (라우팅)

**Spec §10 PR3 회귀 항목:**
- 공개 메인 페이지에서 FULL_BLEED 배너가 데코 zero 로 노출 → Task 5 (FullBleedSlide 데코-zero 테스트) + Task 6 (브라우저 sanity)
- SYSTEM_COMPOSED 캐러셀 시각 회귀 없음 → Task 5 (SystemComposedSlide 회귀 가드) + Task 6 (브라우저 sanity)
- alt text 가 DOM 속성으로만 들어가는지 → Task 5 (FullBleedSlide alt 테스트)

**Important #E from spec self-review (트랜지션 책임 분담):**
- §7.1 plan 본문에 \"슬라이드 전환 클래스도 본체에서 주입\" 명시 + Task 4 Step 2 에서 transition wrapper 가 BannerCarousel 본체에 그대로 남아 있음을 가드 → 만족

**Placeholder scan:** \"TBD\", \"TODO\" 등 zero.

**Type consistency:**
- `SystemComposedSlideData` / `FullBleedSlideData` 타입명이 export 이름과 일관
- `renderMode` / `imageAltText` 필드명이 모든 Task 에서 동일
- `variant: 'main' | 'preview'` discriminated union 이 두 컴포넌트에서 동일 패턴

---

## 참고

- spec: `docs/superpowers/specs/2026-06-07-promotion-full-bleed-image-design.md`
- 선행 PR: PR1 `#278` (스키마 + enum + 응답), PR2 `#279` (어드민 UI) — 이미 develop 에 머지됨
- 본 PR 머지로 FULL_BLEED_IMAGE 3 단계 도입 완료. 이후 모바일 전용 이미지 / 어드민 목록 필터 / 권장 사이즈 자동 리사이즈 등은 별도 사양으로 분리.
- 메모리 가이드 준수: Conventional Commits, `[#이슈번호]` 형식 금지, Co-Authored-By 라인 금지, `gh pr checks --watch` 금지.
