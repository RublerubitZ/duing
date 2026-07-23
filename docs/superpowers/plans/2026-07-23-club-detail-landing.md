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

---

# v3 확장 태스크 (스펙 v3 — 소개 카드·소식 탭·리치 에디터)

### Task 9: 소개(About) Paper Card 리디자인 + 리치/레거시 렌더

**Files:**
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailAbout.tsx` (전면 재작성)
- Create: `frontend/apps/web/app/clubs/[clubId]/_lib/splitDescription.ts` (순수 함수 — 분할 로직)
- Test: `frontend/apps/web/test/clubs/club-detail-about.test.tsx` (재작성), `test/clubs/split-description.test.ts` (신규)

**Interfaces:**
- Produces: `ClubDetailAbout({ description, highlights })` 시그니처 불변(Tabs 무수정). `splitDescription(description: string): { isHtml: boolean; lead: string; rest: string | null }` — isHtml 은 `/^\s*</` 휴리스틱. HTML 이면 sanitizeHtml(공지 `app/notices/_lib/sanitizeHtml`) 후 최상위 블록 파싱: lead=첫 블록 outerHTML, rest=나머지 블록 join(없으면 null). plain 이면 빈 줄(`\n\s*\n`) 분할: lead=첫 문단, rest=나머지(없으면 null).
- 렌더: Paper Card(`rounded-[20px] border border-line bg-white p-7 shadow-1`). HTML 은 dangerouslySetInnerHTML — **React19 함정: 주입 서브트리는 memo 컴포넌트로 분리**(레포 공지 렌더 전례 참조), prose 스타일은 공지 본문 렌더 클래스 재사용(grep 해 확인). plain 은 `whitespace-pre-wrap`.
- 더보기: rest 있으면 펼침 영역(`grid-rows-[0fr]→[1fr]` 트랜지션 + 펼침부 `border-t pt-5 mt-5`) + "더보기/접기" 버튼(chevron 회전). rest 없고 lead 가 장문(텍스트 220자 초과)이면 `line-clamp-4` + 더보기(펼치면 클램프 해제). 그 외 버튼 숨김.
- highlights: 카드 하단 ✓ 칩 행(`flex flex-wrap gap-2.5`, 각 칩 ✓ 아이콘+키워드 semibold ink) — **소제목 없음**, 빈 배열이면 영역 미렌더. 본문과 칩 모두 없으면 기존처럼 null 반환.

- [ ] Step 1: 실패 테스트 — splitDescription(HTML 다중 블록/단일 블록/plain 다중 문단/단일/`<script>` 제거), About(HTML 렌더+lead 만 초기 노출·더보기 후 rest·클램프 케이스·칩 유/무·null)
- [ ] Step 2: RED 확인 → Step 3: 구현 → Step 4: `pnpm --filter @duing/web test -- --run test/clubs/` GREEN + typecheck
- [ ] Step 5: Commit — `feat(frontend): 소개 카드 리디자인 — Paper Card·더보기·리치/레거시 렌더`

### Task 10: 소식 탭 통합 (공지+일정)

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailNews.tsx`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailTabs.tsx` (notices·events 탭 → news 1개)
- Delete: `ClubDetailNotices.tsx`, `ClubDetailEvents.tsx` (ClubDetailNews 가 흡수 — 삭제 전 기능 인벤토리 이관 확인)
- Test: `frontend/apps/web/test/clubs/club-detail-news.test.tsx` (신규), `club-detail-tabs.test.tsx` (갱신)

**Interfaces:**
- Produces: `ClubDetailNews({ clubId: number })`. TabKey 'notices'|'events' → 'news', 라벨 "소식", isMember 게이트 유지.
- 레이아웃: `grid grid-cols-1 gap-8 md:grid-cols-2` — 좌 "최근 공지"(h3) 카드 리스트(rounded-[14px] border bg-white shadow-1 p-4: pill 카테고리 배지+제목 semibold+작성일 charcoal-3), 우 "다가오는 일정"(h3) 카드 리스트(날짜 칸: 일 숫자 font-display bold + 요일 11px | 세로 divider | 일정명+시간·장소).
- 기존 ClubDetailNotices/Events 의 데이터 훅·로딩·빈 상태·상세 링크·표기 유틸(formatDateKst·kstDateTimeFormatter 등)을 그대로 이관(기능 삭제 금지) — 구현 전 두 파일 정독.
- [ ] Step 1: 실패 테스트(탭: 공지·일정 탭 부재+소식 탭 존재+비멤버 미노출 / news: 두 섹션 h3·공지 행·일정 행·빈 상태) → RED → 구현 → `test/clubs/` GREEN → Commit — `feat(frontend): 공지·일정을 소식 탭으로 통합 — 목업 카드 디자인`

### Task 11: 콘솔 소개글 Tiptap 전환 (1,500자 정책)

**Files:**
- Modify: `frontend/apps/web/app/_components/NoticeRichEditor.tsx` (+기능 구성 prop), `NoticeRichEditorLazy.tsx` (prop 통과)
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx` (소개 textarea → 에디터+카운터+차단)
- Modify: `frontend/packages/schemas/src/index.ts` (클럽 description 백스톱 2000→10000, 관련 4곳 중 클럽 스키마만)
- Test: `frontend/apps/web/test/manage/info/` 기존 스위트 갱신 + 신규 케이스, `test/notices/` 회귀

**Interfaces:**
- `NoticeRichEditor` 에 `features?: { headings?: boolean; image?: boolean }`(기본 둘 다 true — 공지 무변경). false 시 StarterKit heading 비활성·Image 확장 제외·툴바 버튼 미렌더. 허용 서식(굵게·기울임·취소선·링크·목록 2종·인용·구분선)은 StarterKit 기본 유지.
- ClubInfoForm 소개: `NoticeRichEditorLazy`(features 둘 다 false) + 실시간 카운터 "N/1,500 · 권장 300~800자"(에디터 getText().length 콜백) + **1,500 초과 시 제출 차단 인라인 에러**("소개글은 1,500자 이하로 줄여주세요."). 저장 payload 는 HTML(기존 description 필드 그대로).
- **레거시 시드**: 편집 진입 시 `^\s*<` 미충족 plain text 는 빈 줄 분할로 `<p>…</p>` 변환해 에디터 시드(개행 소실 방지 — 수정 모달 상세 시드 함정 계열). 시드 변환은 순수 함수로 분리+테스트.
- zod: 클럽 create/update/admin 스키마의 description `.max(2000…)` → `.max(10000, …)` (HTML 백스톱 — 메시지 문구도 갱신). 다른 도메인 description(모집 등)은 무접촉.
- 폴백: NoticeRichEditorLazy 폴백 마크업 원본과 동기화 확인(레포 메모리 규칙).
- [ ] Step 1: 실패 테스트(카운터 표시·1500 초과 차단·레거시 시드 변환·features 구성 시 헤딩/이미지 툴바 부재·공지 기본값 회귀) → RED → 구현 → `test/manage/info/`+`test/notices/`+typecheck GREEN → Commit — `feat(frontend): 소개글 Tiptap 전환 — 서식 제한·1500자 정책·레거시 시드`

### Task 12: v3 전체 검증 + 실브라우저 QA

- [ ] 정적 4종(typecheck/lint/test 전체/CI-env build) — frontend/
- [ ] 실브라우저 QA(qa4/ 이어서): ①소개 카드(레거시 plain 렌더·펼침/접기·클램프·칩 유/무) ②콘솔 소개 에디터(서식 툴바 제한·굵게/목록/인용 저장→학생 화면 왕복 렌더·1500 초과 차단·레거시 시드 개행 보존) ③소식 탭(멤버 게이트·PC 2열/모바일 세로·공지 배지·일정 날짜 카드) ④기존 회귀(대표 활동·이런 활동을 해요·라이트박스·Sticky Footer). QA 생성 데이터 원복.
- [ ] Commit 없음(문제 시 해당 Task 복귀).

---

### Task 13 (v4): 소개 섹션 헤더 + 추천 영역 재구성

**Files:**
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailAbout.tsx`
- Test: `frontend/apps/web/test/clubs/club-detail-about.test.tsx`

**Interfaces:** `ClubDetailAbout({ description, highlights })` 시그니처 불변(Tabs 무수정). 렌더 구조:
- 섹션 래퍼에 헤더(다른 랜딩 섹션과 동일: `h2 text-[20px] font-bold text-ink-deep` "소개" + `span text-[13px] text-charcoal-3` "동아리가 추구하는 문화와 활동 방식을 소개합니다.") — 카드가 렌더될 때만(null 조건 기존 유지).
- Paper Card 내부: 본문(lead+펼침+더보기 버튼, v3 로직 무변경) → 본문·highlights 둘 다 있으면 `border-t border-line pt-5 mt-5` Divider → `p 소제목 "이런 분께 추천해요"`(text-[15px] font-semibold text-ink-deep mb-3) → `ul` 체크 리스트(각 li: ✓ 아이콘(ink) + 텍스트, `space-y-2`, 기존 칩 행 flex-wrap 제거).
- highlights 없으면 Divider+추천 영역 미렌더 / 본문 없고 highlights 만 있으면 Divider 없이 추천 영역만.

- [ ] Step 1: 실패 테스트 — 헤더 문구 2종, 추천 소제목+체크 리스트 렌더, 칩 행 부재, highlights 없음 → 소제목·Divider 부재, 본문 없음+highlights 만 → 추천만, 기존 더보기 테스트 GREEN 유지
- [ ] Step 2: RED → Step 3: 구현 → Step 4: `test/clubs/` GREEN + typecheck
- [ ] Step 5: Commit — `feat(frontend): 소개 섹션 헤더 통일·"이런 분께 추천해요" 체크 리스트`

---

### Task 14 (v5): 우측 신청 패널 Sticky + 찜 버튼 우상단 이동

**Files:**
- Modify: `frontend/apps/web/app/clubs/[clubId]/page.tsx` (우측 컬럼 div 에 `lg:sticky lg:top-6 lg:self-start`)
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubRecruitmentCard.tsx` (찜 버튼 하단 행 제거 → 카드 우상단 absolute 플로팅)
- Test: `frontend/apps/web/test/clubs/club-recruitment-card.test.tsx` (찜 버튼 위치·기능 단언 갱신), `club-detail-page.test.tsx` (우측 컬럼 sticky 클래스 단언 1건)

**Interfaces:** 시그니처 전부 불변. ClubRecruitmentCard 루트(aside)는 `relative` 확보 후 `FavoriteToggleButton` 을 `absolute right-5 top-5`(카드 패딩과 정합한 값) 배치 — 모집중·모집예정·마감 상태 전부 동일. 하단 `flex gap-2` 행은 찜 제거 후 비면 행 자체 제거.

- [ ] Step 1: 실패 테스트 — 찜 버튼이 카드 상단 영역에 존재(+하단 행 부재), aria-pressed 토글 기능 유지, page 우측 컬럼에 sticky·self-start 클래스
- [ ] Step 2: RED → Step 3: 구현 → Step 4: `test/clubs/` GREEN + typecheck
- [ ] Step 5: Commit — `feat(frontend): 동아리 상세 우측 신청 패널 Sticky·찜 버튼 우상단 이동`

---

### Task 15 (v6): Stats 모바일 반응형 타이포·개행 안전성

**Files:**
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailStats.tsx`
- Test: `frontend/apps/web/test/clubs/club-detail-stats.test.tsx` (없으면 신규)

**Interfaces:** `ClubDetailStats({ club })` 불변. 변경은 클래스만:
- 컨테이너: `grid grid-cols-3 gap-x-3 border-y border-line py-5` (items 기본 stretch 유지 — 높이 균일).
- 값: `font-display font-bold text-ink-deep text-[15px] leading-snug break-keep [overflow-wrap:anywhere] md:text-[22px]`.
- 라벨 행 무변경. Desktop 렌더 결과가 기존과 동일해야 한다(md 이상 클래스 값 검증).

- [ ] Step 1: 실패 테스트 — 최악 케이스 값("주 7회 (월·화·수·목·금·토·일)") 렌더 + 값 요소에 반응형 크기·break-keep·overflow-wrap 클래스 단언, md 복원 클래스 단언, 셀 3종(활동·창설년도·회비) 렌더 회귀
- [ ] Step 2: RED → Step 3: 구현 → Step 4: `test/clubs/` GREEN + typecheck
- [ ] Step 5: Commit — `fix(frontend): 모집 정보 요약 모바일 타이포·개행 안전성 — 긴 활동 값 레이아웃 보호`
