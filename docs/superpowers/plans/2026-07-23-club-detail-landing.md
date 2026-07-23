# 동아리 상세 랜딩 리디자인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 동아리 상세(학생) 상단에 랜딩 콘텐츠 2섹션 — 대표 활동(PC 벤토·모바일 스와이프)과 "이런 활동을 해요"(활동 소개 카드) — 를 추가하고, 소개 탭의 주요 프로젝트를 랜딩으로 이관·콘솔 ⑥섹션을 리네임한다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-23-club-detail-landing-redesign-design.md` 준수. FE 단독, BE·모델·API 무변경. `HeroActivityCard`를 순수 표현 코어로 `app/_components/`에 승격(배지·스케일 전부 props)하고 화면별 래퍼(학생: 벤토 셀·스와이프 슬라이드 / 콘솔: 에디터·Preview)로만 소비한다. `PhotoLightbox`는 슬라이드 일반형(`LightboxSlide`)으로 리팩터해 활동 사진·대표 활동이 공유한다. 대표 활동 섹션은 페이지 게이트에 넣지 않고 독립 로딩(Skeleton delayed-show), 0개/에러 시 조용히 미렌더.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query(기존 `useClubHeroActivitiesQuery`), Radix Dialog + framer-motion(기존 Lightbox), Tailwind, Vitest + Testing Library + MSW.

## Global Constraints

- 타입 `type`만(interface 금지), `any`/`as` 금지, 변수명 축약 금지, 서버 상태는 TanStack Query만, TanStack 내부 모킹 금지(커스텀 훅 부분 mock + MSW).
- TDD RED→GREEN 필수(순수 CSS 클래스만 바꾸는 스텝 제외). pnpm 명령은 `frontend/` 에서 실행.
- 커밋: Conventional Commits 한국어, attribution 라인 금지. push·PR 생성 금지(오케스트레이터 몫).
- 학생 화면 대표 활동 카드에 **번호 배지 없음**(콘솔 슬롯 에디터만 유지, Preview 는 학생과 일치=배지 없음).
- 대표 활동 섹션 헤더 고정 문구: 제목 "대표 활동" / 서브 "동아리의 다양한 활동과 분위기를 만나보세요."
- 콘솔 ⑥섹션 문구: 제목 "이런 활동을 해요" / 설명 "학생들이 동아리의 활동을 한눈에 이해할 수 있게 대표적인 활동을 등록해 주세요. 최대 6개."
- 레포 함정 가드: 스와이프 이미지 `draggable={false}` + 컨테이너 `onDragStart` preventDefault, `scrollTo` 는 reduced-motion 시 `behavior: 'auto'`.
- Sticky Footer CTA(ClubDetailApplyBar)·우측 카드·기존 활동 사진 그리드 무접촉.

---

### Task 1: HeroActivityCard 코어 승격 (배지 optional + size)

**Files:**
- Create: `frontend/apps/web/app/_components/HeroActivityCard.tsx` (기존 파일 이동+확장)
- Delete: `frontend/apps/web/app/manage/clubs/[clubId]/photos/_components/HeroActivityCard.tsx`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/photos/_components/HeroActivityEditor.tsx:11,155,158` (import 경로만)
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/photos/_components/ActivityPreview.tsx:3,45` (import 경로 + **slotNumber 제거**)
- Test: `frontend/apps/web/test/manage/photos/HeroActivityCard.test.tsx` (import 경로 수정 + 신규 케이스), `test/manage/photos/ActivityPreview.test.tsx` (배지 부재 단언)

**Interfaces:**
- Produces: `HeroActivityCard({ imageUrl: string | null, title: string, description: string, slotNumber?: number, size?: 'default' | 'big' })` — `@/app/_components/HeroActivityCard` 에서 export. slotNumber 미전달 → 배지 미렌더 + 제목이 top-3 으로 올라감. size 'big' → 컨테이너 `h-full`(부모 그리드 셀이 높이 소유) + 제목 22px·설명 14px 스케일.

- [ ] **Step 1: 실패하는 테스트 작성** — `test/manage/photos/HeroActivityCard.test.tsx` 의 import 를 `@/app/_components/HeroActivityCard` 로 바꾸고 케이스 추가:

```tsx
it('slotNumber 미전달 시 번호 배지를 렌더하지 않는다(학생 화면)', () => {
  render(<HeroActivityCard imageUrl="a.jpg" title="데모데이" description="설명" />);
  expect(screen.queryByText('1')).not.toBeInTheDocument();
});

it('size big 이면 제목이 확대 스케일로 렌더된다', () => {
  render(<HeroActivityCard imageUrl="a.jpg" title="데모데이" description="설명" size="big" />);
  expect(screen.getByText('데모데이').className).toContain('text-[22px]');
});
```

`ActivityPreview.test.tsx` 에 추가: Preview 히어로 카드에 배지 숫자가 없음(`queryByText(String(첫 hero displayOrder))` 부재 — 제목/설명은 유지 단언).

- [ ] **Step 2: RED 확인** — Run: `pnpm --filter @duing/web test -- --run test/manage/photos/HeroActivityCard.test.tsx` → FAIL(모듈 없음)
- [ ] **Step 3: 구현** — 기존 파일을 `app/_components/HeroActivityCard.tsx` 로 이동 후 수정:

```tsx
import { cn } from '@/app/_lib/cn';

type Props = {
  imageUrl: string | null;
  title: string;
  description: string;
  /** 콘솔 슬롯 화면 전용 — 미전달 시 번호 배지를 렌더하지 않는다(학생 화면·Preview). */
  slotNumber?: number;
  /** 벤토 첫 카드(2×2) 스케일 업 — 부모 셀이 col/row-span 과 높이를 소유한다. */
  size?: 'default' | 'big';
};

/**
 * 대표 활동 카드 — 순수 표현 코어. 콘솔(슬롯 에디터·Preview)과 학생 화면(벤토·스와이프)이
 * 래퍼를 통해 공유하는 단일 양식. 4:5 비율(big 은 부모가 높이 소유) + 그라데이션 + 제목/설명 오버레이.
 */
export function HeroActivityCard({ imageUrl, title, description, slotNumber, size = 'default' }: Props) {
  const big = size === 'big';
  const hasBadge = slotNumber !== undefined;
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[14px] border border-line bg-sage-mist',
        big ? 'h-full' : 'aspect-[4/5]',
      )}
    >
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- 외부 Storage URL. 대표 활동 카드 이미지.
        <img src={imageUrl} alt={title || '대표 활동'} draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/70" />
      {!imageUrl && (
        <span className="absolute inset-0 grid place-items-center text-[13px] font-medium text-charcoal-2">사진을 선택하세요</span>
      )}
      {hasBadge && (
        <span className="absolute left-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-white text-[13px] font-bold text-ink shadow-sm">{slotNumber}</span>
      )}
      <p
        className={cn(
          'absolute inset-x-3 line-clamp-2 font-bold leading-snug',
          hasBadge ? 'top-12' : big ? 'top-4' : 'top-3',
          big ? 'text-[22px]' : 'text-[15px]',
          title ? 'text-white' : 'text-white/50',
        )}
      >
        {title || '제목'}
      </p>
      {description && (
        <p className={cn('absolute inset-x-3 bottom-3 leading-relaxed text-white/90', big ? 'line-clamp-3 text-[14px]' : 'line-clamp-3 text-[12.5px]')}>
          {description}
        </p>
      )}
    </div>
  );
}
```

콘솔 재배선: `HeroActivityEditor` 는 import 만 `@/app/_components/HeroActivityCard` 로(slotNumber 전달 유지). `ActivityPreview` 는 import 변경 + `slotNumber` prop 삭제.

- [ ] **Step 4: GREEN + 회귀** — Run: `pnpm --filter @duing/web test -- --run test/manage/photos/` → 전체 PASS. `pnpm --filter @duing/web typecheck` 클린.
- [ ] **Step 5: Commit** — `refactor(frontend): 대표 활동 카드 코어를 공용으로 승격 — 배지 옵션·big 스케일`

---

### Task 2: PhotoLightbox 슬라이드 일반화

**Files:**
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/PhotoLightbox.tsx`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailPhotos.tsx:56-61` (어댑터)
- Test: `frontend/apps/web/test/clubs/photo-lightbox.test.tsx`

**Interfaces:**
- Produces: `export type LightboxSlide = { id: number | string; imageUrl: string; title: string | null; caption: string | null }`; `PhotoLightbox({ slides: LightboxSlide[], initialIndex, open, onClose })`. title 있으면 하단 캡션 영역에 굵은 제목 줄 + 캡션(설명) 줄. 이미지 alt = `title ?? caption ?? ''`. sr 타이틀 "활동 크게 보기".
- Consumes: 없음(독립).

- [ ] **Step 1: 실패하는 테스트** — 기존 케이스의 `photos` prop 을 slides 로 옮기는 헬퍼 추가(단언 의도 보존: 카운터·좌우 내비·캡션·닫기) + 신규:

```tsx
it('title 이 있는 슬라이드는 굵은 제목과 설명을 함께 보여준다(대표 활동)', () => {
  render(<PhotoLightbox slides={[{ id: 'h1', imageUrl: 'k.jpg', title: '데모데이', caption: '학기 하이라이트' }]} initialIndex={0} open onClose={() => {}} />);
  expect(screen.getByText('데모데이')).toBeInTheDocument();
  expect(screen.getByText('학기 하이라이트')).toBeInTheDocument();
});

it('title 없는 슬라이드(활동 사진)는 기존처럼 캡션만 보여준다', () => { /* 기존 캡션 단언 이관 */ });
```

- [ ] **Step 2: RED 확인** — Run: `pnpm --filter @duing/web test -- --run test/clubs/photo-lightbox.test.tsx` → FAIL
- [ ] **Step 3: 구현** — Props 를 `slides: LightboxSlide[]` 로, 내부 `photo` → `slide`(`imageUrl` 사용), sr Title "활동 크게 보기", 캡션 블록 교체:

```tsx
{(slide.title || slide.caption) && (
  <div className="px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-1 text-center">
    {slide.title && <div className="text-[15px] font-bold text-white">{slide.title}</div>}
    {slide.caption && <div className="mt-1 text-sm text-white/85">{slide.caption}</div>}
  </div>
)}
```

`ClubDetailPhotos` 는 호출부에서 어댑터: `slides={photos.map((photo) => ({ id: photo.id, imageUrl: photo.storageKey, title: null, caption: photo.caption }))}`. 스와이프·키보드·reduced-motion 로직 무변경.

- [ ] **Step 4: GREEN + 회귀** — Run: `pnpm --filter @duing/web test -- --run test/clubs/` → 전체 PASS.
- [ ] **Step 5: Commit** — `refactor(frontend): 라이트박스를 슬라이드 일반형으로 — 제목 지원·활동 사진 어댑터`

---

### Task 3: ClubHeroBento (PC 개수별 벤토, 학생 래퍼)

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/_components/ClubHeroBento.tsx`
- Test: `frontend/apps/web/test/clubs/club-hero-bento.test.tsx`

**Interfaces:**
- Consumes: Task 1 코어 `HeroActivityCard`(`@/app/_components/HeroActivityCard`), `ClubHeroActivity`(`@duing/types`).
- Produces: `ClubHeroBento({ heroActivities: ClubHeroActivity[], onOpen: (index: number) => void })` — displayOrder 오름차순 입력 가정(정렬 책임은 섹션), 컴팩트 렌더, 배지 없음.

- [ ] **Step 1: 실패하는 테스트** — 개수별 배치·클릭 인덱스·배지 부재:

```tsx
const make = (id: number, order: number): ClubHeroActivity => ({
  id, clubPhotoId: id, storageKey: `k${id}.jpg`, caption: null, width: null, height: null,
  title: `활동${id}`, description: `설명${id}`, displayOrder: order,
});

it('6개면 3열 그리드에 첫 카드가 2×2 큰 대표로 렌더된다', () => {
  render(<ClubHeroBento heroActivities={[1,2,3,4,5,6].map((n) => make(n, n))} onOpen={vi.fn()} />);
  const cells = screen.getAllByRole('button');
  expect(cells).toHaveLength(6);
  expect(cells[0]?.className).toContain('col-span-2');
  expect(cells[0]?.className).toContain('row-span-2');
});

it('4개면 2열 균등 그리드(큰 대표 없음)', () => { /* grid-cols-2 + col-span-2 부재 단언 */ });
it('2개면 2열 + 최대폭 제한, 1개면 단독 + 최대폭 제한', () => { /* max-w-[640px] / max-w-[320px] 단언 */ });
it('번호 배지를 렌더하지 않고, 카드 클릭 시 해당 인덱스로 onOpen 을 부른다', () => {
  const onOpen = vi.fn();
  render(<ClubHeroBento heroActivities={[1,2,3].map((n) => make(n, n))} onOpen={onOpen} />);
  expect(screen.queryByText('1')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '활동3 자세히 보기' }));
  expect(onOpen).toHaveBeenCalledWith(2);
});
```

- [ ] **Step 2: RED 확인** — Run: `pnpm --filter @duing/web test -- --run test/clubs/club-hero-bento.test.tsx` → FAIL
- [ ] **Step 3: 구현**:

```tsx
import type { ClubHeroActivity } from '@duing/types';
import { HeroActivityCard } from '@/app/_components/HeroActivityCard';
import { cn } from '@/app/_lib/cn';

type Props = { heroActivities: ClubHeroActivity[]; onOpen: (index: number) => void };

// 개수별 배치 — 5·6개는 첫 카드 2×2 큰 대표(스펙·목업 Concept A 규칙).
const GRID_BY_COUNT: Record<number, string> = {
  1: 'grid-cols-1 max-w-[320px]',
  2: 'grid-cols-2 max-w-[640px]',
  3: 'grid-cols-3',
  4: 'grid-cols-2',
};

/** 학생 화면 PC 벤토 래퍼 — 배지 없음, 컴팩트 정렬. */
export function ClubHeroBento({ heroActivities, onOpen }: Props) {
  const count = heroActivities.length;
  if (count === 0) return null;
  const featured = count >= 5;
  return (
    <div className={cn('grid gap-3.5', featured ? 'grid-cols-3' : GRID_BY_COUNT[count])}>
      {heroActivities.map((activity, index) => {
        const big = featured && index === 0;
        return (
          <button
            key={activity.id}
            type="button"
            onClick={() => onOpen(index)}
            aria-label={`${activity.title} 자세히 보기`}
            className={cn(
              'text-left transition hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink',
              big && 'col-span-2 row-span-2',
            )}
          >
            <HeroActivityCard
              imageUrl={activity.storageKey}
              title={activity.title}
              description={activity.description}
              size={big ? 'big' : 'default'}
            />
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: GREEN** — Run: `pnpm --filter @duing/web test -- --run test/clubs/club-hero-bento.test.tsx` → PASS
- [ ] **Step 5: Commit** — `feat(frontend): 동아리 상세 대표 활동 벤토(개수별 배치) 추가`

---

### Task 4: ClubHeroSwipe (모바일 스와이프, 학생 래퍼)

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/_components/ClubHeroSwipe.tsx`
- Test: `frontend/apps/web/test/clubs/club-hero-swipe.test.tsx`

**Interfaces:**
- Consumes: Task 1 코어. Produces: `ClubHeroSwipe({ heroActivities: ClubHeroActivity[], onOpen: (index: number) => void })`.

- [ ] **Step 1: 실패하는 테스트** — 파일 상단에 픽스처 헬퍼 정의:

```tsx
const make = (id: number, order: number): ClubHeroActivity => ({
  id, clubPhotoId: id, storageKey: `k${id}.jpg`, caption: null, width: null, height: null,
  title: `활동${id}`, description: `설명${id}`, displayOrder: order,
});

it('전 카드 + 도트를 렌더하고 첫 도트가 활성이다', () => {
  render(<ClubHeroSwipe heroActivities={[1,2,3].map((n) => make(n, n))} onOpen={vi.fn()} />);
  expect(screen.getAllByRole('button', { name: /자세히 보기/ })).toHaveLength(3);
  const dots = screen.getAllByRole('button', { name: /번째 대표 활동/ });
  expect(dots).toHaveLength(3);
  expect(dots[0]?.className).toContain('w-5'); // 활성 도트 확대
});

it('스크롤 위치에 따라 활성 도트가 바뀐다', () => {
  render(<ClubHeroSwipe heroActivities={[1,2,3].map((n) => make(n, n))} onOpen={vi.fn()} />);
  const track = screen.getByTestId('hero-swipe-track');
  Object.defineProperty(track, 'clientWidth', { value: 300, configurable: true });
  Object.defineProperty(track, 'scrollLeft', { value: 600, configurable: true });
  fireEvent.scroll(track);
  expect(screen.getAllByRole('button', { name: /번째 대표 활동/ })[2]?.className).toContain('w-5');
});

it('컨테이너가 네이티브 dragstart 를 차단한다(캐러셀 스와이프 가드)', () => {
  render(<ClubHeroSwipe heroActivities={[make(1, 1)]} onOpen={vi.fn()} />);
  const track = screen.getByTestId('hero-swipe-track');
  const dragEvent = createEvent.dragStart(track);
  fireEvent(track, dragEvent);
  expect(dragEvent.defaultPrevented).toBe(true);
});
```

- [ ] **Step 2: RED 확인** — Run: `pnpm --filter @duing/web test -- --run test/clubs/club-hero-swipe.test.tsx` → FAIL
- [ ] **Step 3: 구현**:

```tsx
'use client';

import { useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { ClubHeroActivity } from '@duing/types';
import { HeroActivityCard } from '@/app/_components/HeroActivityCard';
import { cn } from '@/app/_lib/cn';

type Props = { heroActivities: ClubHeroActivity[]; onOpen: (index: number) => void };

/** 학생 화면 모바일 스와이프 래퍼 — scroll-snap 한 장씩, 도트 인디케이터. 배지 없음. */
export function ClubHeroSwipe({ heroActivities, onOpen }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  function handleScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setCurrentIndex(Math.round(track.scrollLeft / track.clientWidth));
  }

  function goTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    setCurrentIndex(index);
    track.scrollTo({ left: index * track.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  return (
    <div>
      <div
        ref={trackRef}
        data-testid="hero-swipe-track"
        onScroll={handleScroll}
        // 앵커·이미지 네이티브 드래그가 스와이프를 끊는 레포 전례 가드 — 컨테이너에서 일괄 차단.
        onDragStart={(event) => event.preventDefault()}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none]"
      >
        {heroActivities.map((activity, index) => (
          <button
            key={activity.id}
            type="button"
            onClick={() => onOpen(index)}
            aria-label={`${activity.title} 자세히 보기`}
            className="w-full flex-none snap-center text-left"
          >
            <HeroActivityCard imageUrl={activity.storageKey} title={activity.title} description={activity.description} />
          </button>
        ))}
      </div>
      <div className="mt-3 flex justify-center gap-1.5">
        {heroActivities.map((activity, index) => (
          <button
            key={activity.id}
            type="button"
            onClick={() => goTo(index)}
            aria-label={`${index + 1}번째 대표 활동`}
            className={cn(
              'h-1.5 rounded-full transition-all',
              index === currentIndex ? 'w-5 bg-ink' : 'w-1.5 bg-line',
            )}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: GREEN** — Run: `pnpm --filter @duing/web test -- --run test/clubs/club-hero-swipe.test.tsx` → PASS
- [ ] **Step 5: Commit** — `feat(frontend): 동아리 상세 대표 활동 모바일 스와이프 추가`

---

### Task 5: ClubDetailHeroActivities 섹션 (독립 로딩·빈/에러 강등·Lightbox 배선)

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailHeroActivities.tsx`
- Test: `frontend/apps/web/test/clubs/club-detail-hero-activities.test.tsx`

**Interfaces:**
- Consumes: `useClubHeroActivitiesQuery`(@duing/hooks), Task 2 `PhotoLightbox`/`LightboxSlide`, Task 3 `ClubHeroBento`, Task 4 `ClubHeroSwipe`, `Skeleton`(@/components/loading/Skeleton).
- Produces: `ClubDetailHeroActivities({ clubId: number })` — 페이지가 그대로 배치. 훅은 부분 mock(레포 관례) — TanStack 내부 모킹 금지.

- [ ] **Step 1: 실패하는 테스트** (`vi.mock('@duing/hooks', …)` 로 `useClubHeroActivitiesQuery` 만 부분 mock) — 파일 상단에 픽스처 헬퍼 정의:

```tsx
const make = (id: number, order: number): ClubHeroActivity => ({
  id, clubPhotoId: id, storageKey: `k${id}.jpg`, caption: null, width: null, height: null,
  title: `활동${id}`, description: `설명${id}`, displayOrder: order,
});

it('로딩 중에는 섹션 자리에 스켈레톤만 보인다(delayed-show)', () => {
  mockHeroQuery({ data: undefined, isLoading: true, isError: false });
  render(<ClubDetailHeroActivities clubId={1} />);
  expect(screen.getByRole('status', { name: '대표 활동 불러오는 중' })).toBeInTheDocument();
  expect(screen.queryByText('대표 활동')).not.toBeInTheDocument();
});

it('0개면 섹션을 렌더하지 않는다', () => {
  mockHeroQuery({ data: [], isLoading: false, isError: false });
  const { container } = render(<ClubDetailHeroActivities clubId={1} />);
  expect(container).toBeEmptyDOMElement();
});

it('에러면 조용히 미렌더(랜딩 강등)', () => {
  mockHeroQuery({ data: undefined, isLoading: false, isError: true });
  const { container } = render(<ClubDetailHeroActivities clubId={1} />);
  expect(container).toBeEmptyDOMElement();
});

it('데이터가 있으면 헤더 고정 문구 + 벤토·스와이프 래퍼를 렌더하고, 카드 클릭 시 라이트박스에 제목·설명이 뜬다', () => {
  mockHeroQuery({ data: [make(1, 1), make(2, 2)], isLoading: false, isError: false });
  render(<ClubDetailHeroActivities clubId={1} />);
  expect(screen.getByText('대표 활동')).toBeInTheDocument();
  expect(screen.getByText('동아리의 다양한 활동과 분위기를 만나보세요.')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: '활동1 자세히 보기' })[0]!);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(within(screen.getByRole('dialog')).getByText('활동1')).toBeInTheDocument();
});
```

- [ ] **Step 2: RED 확인** — Run: `pnpm --filter @duing/web test -- --run test/clubs/club-detail-hero-activities.test.tsx` → FAIL
- [ ] **Step 3: 구현**:

```tsx
'use client';

import { useState } from 'react';
import { useClubHeroActivitiesQuery } from '@duing/hooks';
import { Skeleton } from '@/components/loading/Skeleton';
import { ClubHeroBento } from './ClubHeroBento';
import { ClubHeroSwipe } from './ClubHeroSwipe';
import { PhotoLightbox, type LightboxSlide } from './PhotoLightbox';

type Props = { clubId: number };

/**
 * 대표 활동 랜딩 섹션 — 페이지 게이트에 넣지 않는 독립 로딩.
 * 로딩=스켈레톤, 0개/에러=조용히 미렌더(상세 본문은 정상 유지).
 */
export function ClubDetailHeroActivities({ clubId }: Props) {
  const heroQuery = useClubHeroActivitiesQuery(clubId);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (heroQuery.isLoading) {
    return (
      <div role="status" aria-label="대표 활동 불러오는 중" className="delayed-show mb-10">
        <Skeleton className="mb-4 h-6 w-40" />
        <div className="hidden gap-3.5 md:grid md:grid-cols-3">
          <Skeleton className="aspect-[4/5]" />
          <Skeleton className="aspect-[4/5]" />
          <Skeleton className="aspect-[4/5]" />
        </div>
        <Skeleton className="aspect-[4/5] md:hidden" />
      </div>
    );
  }

  const heroActivities = heroQuery.data ?? [];
  if (heroActivities.length === 0) return null; // 0개·에러 공통 — 랜딩은 조용히 강등.

  const slides: LightboxSlide[] = heroActivities.map((activity) => ({
    id: activity.id,
    imageUrl: activity.storageKey,
    title: activity.title,
    caption: activity.description,
  }));

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-baseline gap-2.5">
        <h2 className="text-[20px] font-bold text-ink-deep">대표 활동</h2>
        <span className="text-[13px] text-charcoal-3">동아리의 다양한 활동과 분위기를 만나보세요.</span>
      </div>
      <div className="hidden md:block">
        <ClubHeroBento heroActivities={heroActivities} onOpen={setLightboxIndex} />
      </div>
      <div className="md:hidden">
        <ClubHeroSwipe heroActivities={heroActivities} onOpen={setLightboxIndex} />
      </div>
      <PhotoLightbox
        slides={slides}
        initialIndex={lightboxIndex ?? 0}
        open={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
      />
    </section>
  );
}
```

- [ ] **Step 4: GREEN + 회귀** — Run: `pnpm --filter @duing/web test -- --run test/clubs/` → 전체 PASS
- [ ] **Step 5: Commit** — `feat(frontend): 대표 활동 랜딩 섹션 — 독립 로딩·빈/에러 강등·라이트박스`

---

### Task 6: "이런 활동을 해요" 섹션 + 소개 탭 이관 + 콘솔 리네임

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailActivityIntro.tsx`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailAbout.tsx` (projects prop·블록 제거)
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailTabs.tsx:27-29,71-77` (`hasIntro` 에서 projects 제외, About 호출부)
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx:586` (⑥ 제목·설명 텍스트)
- Test: `frontend/apps/web/test/clubs/club-detail-activity-intro.test.tsx`(신규), `test/clubs/club-detail-about.test.tsx`(projects 단언 제거), `test/clubs/club-detail-tabs.test.tsx`(회귀 보강), 콘솔 문구는 `test/manage/info/` 기존 스위트에서 "주요 프로젝트" 참조 grep 후 갱신

**Interfaces:**
- Produces: `ClubDetailActivityIntro({ projects: ClubProject[] })`. `ClubDetailAbout({ description, highlights })` (projects 제거).

- [ ] **Step 1: 실패하는 테스트**:

```tsx
// club-detail-activity-intro.test.tsx
it('아이콘 배지 + 활동명 + 한 줄 설명 카드를 렌더한다', () => {
  render(<ClubDetailActivityIntro projects={[{ icon: 'CODE', title: '프로젝트 개발', subtitle: '팀을 이루어 실제 서비스를 개발합니다.' }]} />);
  expect(screen.getByText('이런 활동을 해요')).toBeInTheDocument();
  expect(screen.getByText('프로젝트 개발')).toBeInTheDocument();
  expect(screen.getByText('팀을 이루어 실제 서비스를 개발합니다.')).toBeInTheDocument();
});
it('subtitle null 이면 설명 줄을 생략한다', () => { /* queryByText 부재 */ });
it('0개면 섹션을 렌더하지 않는다', () => { /* container empty */ });

// club-detail-tabs.test.tsx 보강
it('projects 만 있는 동아리는 소개 탭이 사라지고 다음 탭이 기본 선택된다', () => {
  const club = makeClub({ description: null, highlights: [], projects: [projectFixture], faqs: [faqFixture] });
  render(<ClubDetailTabs club={club} photos={[]} membership={null} />);
  expect(screen.queryByRole('tab', { name: '소개' })).not.toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Q&A' })).toHaveAttribute('data-state', 'active');
});
it('소개 탭 콘텐츠에 주요 프로젝트가 더 이상 렌더되지 않는다', () => { /* description 있는 club + projects → 소개 탭에 project.title 부재 */ });
```

- [ ] **Step 2: RED 확인** — Run: `pnpm --filter @duing/web test -- --run test/clubs/club-detail-activity-intro.test.tsx test/clubs/club-detail-tabs.test.tsx` → FAIL
- [ ] **Step 3: 구현** — `ClubDetailActivityIntro`:

```tsx
import type { ClubProject } from '@duing/types';
import { PROJECT_ICON_COMPONENTS, projectCardTone } from '../../../_lib/projectIcons';

type Props = { projects: ClubProject[] };

/** "이런 활동을 해요" 랜딩 섹션 — KPI 가 아닌 활동 소개 카드. 0개면 미렌더. */
export function ClubDetailActivityIntro({ projects }: Props) {
  if (projects.length === 0) return null;
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-[20px] font-bold text-ink-deep">이런 활동을 해요</h2>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {projects.map((project, index) => {
          const IconComponent = PROJECT_ICON_COMPONENTS[project.icon];
          return (
            <li key={`${project.title}-${index}`} className="rounded-[18px] border border-line bg-white p-5 shadow-[var(--shadow-1,0_1px_2px_rgba(20,32,26,0.06))]">
              <span className={`mb-3 grid h-11 w-11 place-items-center rounded-[12px] ${projectCardTone(index)}`}>
                <IconComponent aria-hidden className="h-5 w-5 text-ink-deep" />
              </span>
              <p className="text-[15px] font-semibold text-ink-deep">{project.title}</p>
              {project.subtitle !== null && (
                <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-charcoal-2">{project.subtitle}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

(shadow 유틸은 레포 기존 카드 클래스 확인 후 동일 토큰 사용 — `.card` 유틸이 있으면 그것을 쓴다.)

`ClubDetailAbout`: `projects` prop·블록·`PROJECT_ICON_COMPONENTS` import 제거, `hasAny` 에서 projects 제외. `ClubDetailTabs`: `hasIntro = club.description !== null || club.highlights.length > 0;`, About 호출부에서 projects 삭제. `ClubInfoForm` ⑥: `title="이런 활동을 해요" description="학생들이 동아리의 활동을 한눈에 이해할 수 있게 대표적인 활동을 등록해 주세요. 최대 6개."`.

- [ ] **Step 4: GREEN + 회귀** — Run: `pnpm --filter @duing/web test -- --run test/clubs/ test/manage/info/` → 전체 PASS(콘솔 문구 참조 테스트 있으면 갱신).
- [ ] **Step 5: Commit** — `feat(frontend): "이런 활동을 해요" 랜딩 섹션 — 소개 탭 이관·콘솔 리네임`

---

### Task 7: 페이지 조립

**Files:**
- Modify: `frontend/apps/web/app/clubs/[clubId]/page.tsx:55-62` (두 섹션 삽입)
- Test: `frontend/apps/web/test/clubs/club-detail-page.test.tsx` (없으면 신규 — MSW 로 detail·photos·hero 시드)

**Interfaces:**
- Consumes: Task 5 `ClubDetailHeroActivities`, Task 6 `ClubDetailActivityIntro`.

- [ ] **Step 1: 실패하는 테스트** — MSW 시드(detail + hero 2개 + projects 1개) 후: 랜딩 두 섹션이 탭보다 앞(DOM 순서 단언 — `compareDocumentPosition`), 모바일 모집 요약 div 가 랜딩보다 앞, hero API 500 이어도 페이지 본문(탭·Stats) 정상 렌더.
- [ ] **Step 2: RED 확인** — Run: `pnpm --filter @duing/web test -- --run test/clubs/club-detail-page.test.tsx` → FAIL
- [ ] **Step 3: 구현** — `page.tsx` 모집 요약 div 와 `ClubDetailTabs` 사이에 삽입:

```tsx
<ClubDetailHeroActivities clubId={clubId} />
<ClubDetailActivityIntro projects={club.projects} />
<ClubDetailTabs club={club} photos={photos.data ?? []} membership={membership.data ?? null} />
```

- [ ] **Step 4: GREEN + 전체 회귀** — Run: `pnpm --filter @duing/web test -- --run` → 전체 PASS, `typecheck` 클린, `lint` 신규 경고 0.
- [ ] **Step 5: Commit** — `feat(frontend): 동아리 상세 랜딩 조립 — 대표 활동·이런 활동을 해요 섹션 배치`

---

### Task 8: 전체 검증 + 실브라우저 QA

- [ ] typecheck / lint / test 전체 / build(CI 동등 env: `NEXT_PUBLIC_API_BASE_URL=https://api.ci.invalid/api/v1 AUTH_HINT_SECRET=ci-only-auth-hint-secret-at-least-32-bytes`) — frontend/
- [ ] 실브라우저 QA(서버 기동·계정·정리 절차는 직전 프로젝트 T11 과 동일, 스크린샷 `.superpowers/sdd/qa4/`): ① PC 벤토 — 클럽 1249(hero 5개)로 5개 배치 시각 균형, 비우기/재등록으로 6개·4개·2개·1개 배치 확인(**5·6개 균형은 스펙 확인 포인트**) ② 배지 부재 ③ 카드 클릭 라이트박스(제목+설명, ←/→, 닫기) ④ 모바일 뷰포트(≤767px) 스와이프·도트·활동 사진과의 라이트박스 회귀 ⑤ md 경계(767↔768) 벤토↔스와이프 전환 ⑥ 스켈레톤→콘텐츠 전환(네트워크 스로틀) 및 0개 클럽에서 섹션 부재 ⑦ "이런 활동을 해요" 카드(아이콘 톤 순환·2줄 클램프) ⑧ 소개 탭에서 프로젝트 부재 + projects 만 있는 클럽의 첫 탭 폴백 ⑨ Sticky Footer CTA·우측 모집 카드 무영향 ⑩ 콘솔: ⑥섹션 문구, Preview 배지 부재(에디터 배지는 유지). QA 중 만든 데이터는 화면 기능으로 원복.
- [ ] Commit 없음(문제 발견 시 해당 Task 로 돌아가 수정).
