# 공지 상세 이미지 확대(라이트박스) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공지 상세(`/notices/[noticeId]`)에서 커버 이미지와 본문 이미지를 클릭(탭)하면 전체화면 라이트박스로 확대해 볼 수 있게 한다.

**Architecture:** 단일 이미지 전용 라이트박스 컴포넌트(`NoticeImageLightbox`, Radix Dialog + framer-motion)를 새로 만든다. 커버는 `NoticePosterHero` 에서 `<button>` 으로 감싸 클릭을 받고, 본문 이미지는 `NoticeContent` 에서 Pointer 이벤트 위임(이동량 slop 검사)으로 탭을 받는다. 두 소비처가 각자 라이트박스 인스턴스를 하나씩 보유한다(상태 격리). 백엔드·`page.tsx`·`NoticeMarkdown`·`sanitizeHtml` 은 무변경.

**Tech Stack:** Next.js 15 / React 19, `@radix-ui/react-dialog`, `framer-motion`, Tailwind, vitest + @testing-library/react (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-28-notices-image-lightbox-design.md`

**브랜치:** `feat/notices-image-lightbox` (이미 생성·체크아웃됨). **push·PR 생성은 이 계획 범위 밖** — 사용자 지시 후에만.

**명령 cwd:** 모든 pnpm 명령은 `frontend/` 에서 실행한다.

---

## File Structure

- **Create** `frontend/apps/web/app/notices/_components/NoticeImageLightbox.tsx` — 단일 이미지 라이트박스 + `NoticeImage` 타입 export. 책임: 전체화면 표시·닫기(버튼/ESC/배경/스와이프)·a11y.
- **Modify** `frontend/apps/web/app/notices/_components/NoticePosterHero.tsx` — 커버를 `<button>` 화하고 라이트박스 연결. `'use client'` 전환.
- **Modify** `frontend/apps/web/app/notices/_components/NoticeContent.tsx` — 본문 Pointer 위임 + 라이트박스 연결 + 확대 커서. `'use client'` 전환.
- **Create** `frontend/apps/web/test/notices/notice-image-lightbox.test.tsx` — 라이트박스 단위 테스트.
- **Create** `frontend/apps/web/test/notices/notice-poster-hero.test.tsx` — 커버 클릭 테스트.
- **Modify** `frontend/apps/web/test/notices/notice-content.test.tsx` — 본문 탭 테스트 보강.

---

## Task 1: NoticeImageLightbox 컴포넌트

**Files:**
- Create: `frontend/apps/web/app/notices/_components/NoticeImageLightbox.tsx`
- Test: `frontend/apps/web/test/notices/notice-image-lightbox.test.tsx`

> **참고(실행 중 검증됨):** jsdom(이 프로젝트 버전)은 `PointerEvent` 를 네이티브로 지원하고 `fireEvent.pointerDown` 의 `clientX/clientY` 가 핸들러까지 전달된다. 별도 폴리필이 필요 없으므로 `test/setup.ts` 는 건드리지 않는다. (Task 3 의 slop 테스트도 폴리필 없이 동작한다.)

- [ ] **Step 2: 실패하는 테스트 작성**

`frontend/apps/web/test/notices/notice-image-lightbox.test.tsx` 생성:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { NoticeImageLightbox } from '@/app/notices/_components/NoticeImageLightbox';

describe('NoticeImageLightbox', () => {
  it('image 가 있으면 해당 src 이미지와 닫기 버튼을 렌더한다', () => {
    render(
      <NoticeImageLightbox image={{ src: 'https://cdn.test/a.jpg', alt: 'A' }} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('notice-lightbox-image')).toHaveAttribute('src', 'https://cdn.test/a.jpg');
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
  });

  it('image=null 이면 이미지·닫기 버튼을 렌더하지 않는다', () => {
    render(<NoticeImageLightbox image={null} onClose={vi.fn()} />);
    expect(screen.queryByTestId('notice-lightbox-image')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
  });

  it('닫기 버튼을 누르면 onClose 가 호출된다', () => {
    const onClose = vi.fn();
    render(<NoticeImageLightbox image={{ src: 'https://cdn.test/a.jpg' }} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('이미지에서 시작한 클릭은 onClose 를 부르지 않는다', () => {
    const onClose = vi.fn();
    render(<NoticeImageLightbox image={{ src: 'https://cdn.test/a.jpg', alt: 'A' }} onClose={onClose} />);
    const image = screen.getByTestId('notice-lightbox-image');
    fireEvent.pointerDown(image);
    fireEvent.click(image);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('배경(이미지 영역 여백)에서 시작한 클릭은 onClose 를 부른다', () => {
    const onClose = vi.fn();
    render(<NoticeImageLightbox image={{ src: 'https://cdn.test/a.jpg', alt: 'A' }} onClose={onClose} />);
    const backdrop = screen.getByTestId('notice-lightbox-backdrop');
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm --filter @duing/web test -- --run test/notices/notice-image-lightbox.test.tsx`
Expected: FAIL — `Failed to resolve import "@/app/notices/_components/NoticeImageLightbox"` (모듈 없음).

- [ ] **Step 4: 컴포넌트 구현**

`frontend/apps/web/app/notices/_components/NoticeImageLightbox.tsx` 생성:

```tsx
'use client';

// 공지 상세 단일 이미지 라이트박스. Radix Dialog 로 포커스 트랩·ESC·스크롤 잠금·a11y 를 확보하고,
// framer-motion drag(이미지 래퍼)로 모바일 아래로 끌어 닫기를 처리한다.
// 갤러리(좌우 전환·카운터)는 없다 — 클릭한 이미지 하나만 보여준다.

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion, useReducedMotion, type PanInfo } from 'framer-motion';
import { useRef } from 'react';

import { X } from '@/components/duing/Icon';

export type NoticeImage = { src: string; alt?: string };

type Props = {
  image: NoticeImage | null;
  onClose: () => void;
};

// 아래로 끌어 닫기 임계값 — 이동 거리(px) 또는 플릭 속도(px/s).
const SWIPE_CLOSE_THRESHOLD = 120;
const SWIPE_CLOSE_VELOCITY = 500;

export function NoticeImageLightbox({ image, onClose }: Props) {
  // 전역 MotionConfig 가 transform 모션을 줄여주지만, 여기서 더한 페이드/탄성도 함께 끈다.
  const reduceMotion = useReducedMotion();

  // 닫는 동안(image=null) 직전 이미지를 유지해 닫힘 페이드 프레임이 끊기지 않게 한다.
  // useEffect 대신 렌더 중 파생 — 새 이미지 진입 시 깜빡임 없음.
  const lastImageRef = useRef<NoticeImage | null>(null);
  if (image) lastImageRef.current = image;
  const shown = image ?? lastImageRef.current;

  // backdrop(이미지 영역 컨테이너)에서 시작된 클릭만 닫기로 인정한다 —
  // 이미지 드래그/클릭 중 손을 배경에서 떼는 경우를 닫기로 오인하지 않게 한다.
  const backdropPointerDown = useRef(false);

  const open = image !== null;

  function handleDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (info.offset.y >= SWIPE_CLOSE_THRESHOLD || info.velocity.y >= SWIPE_CLOSE_VELOCITY) {
      onClose();
    }
  }

  if (!shown) return null;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-ink-deep/95 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[70] flex flex-col outline-none"
        >
          {/* Radix 가 이 Title 을 aria-labelledby 로 연결한다. */}
          <DialogPrimitive.Title className="sr-only">이미지 크게 보기</DialogPrimitive.Title>

          {/* 상단 바 — 닫기 */}
          <div className="flex items-center justify-end px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
            <DialogPrimitive.Close
              aria-label="닫기"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <X size={20} />
            </DialogPrimitive.Close>
          </div>

          {/* 이미지 영역 — 빈 여백(backdrop)에서 시작한 클릭만 닫기 */}
          <div
            data-testid="notice-lightbox-backdrop"
            className="relative flex flex-1 items-center justify-center overflow-hidden px-2 pb-2"
            onPointerDown={(event) => {
              backdropPointerDown.current = event.target === event.currentTarget;
            }}
            onClick={(event) => {
              if (backdropPointerDown.current && event.target === event.currentTarget) {
                onClose();
              }
            }}
          >
            <motion.div
              drag
              dragSnapToOrigin
              dragElastic={reduceMotion ? 0 : 0.25}
              dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
              onDragEnd={handleDragEnd}
              initial={reduceMotion ? false : { opacity: 0.4 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.15 }}
              className="max-h-full max-w-full cursor-grab touch-none select-none active:cursor-grabbing"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Supabase/R2 Storage URL. */}
              <img
                src={shown.src}
                alt={shown.alt ?? ''}
                draggable={false}
                data-testid="notice-lightbox-image"
                className="block max-h-full max-w-full object-contain"
              />
            </motion.div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter @duing/web test -- --run test/notices/notice-image-lightbox.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/notices/_components/NoticeImageLightbox.tsx frontend/apps/web/test/notices/notice-image-lightbox.test.tsx
git commit -m "feat(web): 공지 상세 단일 이미지 라이트박스 컴포넌트 추가"
```

---

## Task 2: 커버 이미지 클릭 → 라이트박스 (NoticePosterHero)

**Files:**
- Modify: `frontend/apps/web/app/notices/_components/NoticePosterHero.tsx`
- Test: `frontend/apps/web/test/notices/notice-poster-hero.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/notices/notice-poster-hero.test.tsx` 생성:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { NoticePosterHero } from '@/app/notices/_components/NoticePosterHero';

describe('NoticePosterHero', () => {
  it('커버가 있으면 확대 버튼을 눌렀을 때 라이트박스가 커버 이미지로 열린다', () => {
    render(
      <NoticePosterHero coverImageUrl="https://cdn.test/cover.jpg" title="공지 제목" summary="요약" />,
    );
    fireEvent.click(screen.getByRole('button', { name: '공지 제목 대표 이미지 크게 보기' }));
    expect(screen.getByTestId('notice-lightbox-image')).toHaveAttribute(
      'src',
      'https://cdn.test/cover.jpg',
    );
  });

  it('커버가 없으면 확대 버튼이 없다', () => {
    render(<NoticePosterHero coverImageUrl="" title="공지 제목" summary="요약" />);
    expect(screen.queryByRole('button', { name: /크게 보기/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('notice-lightbox-image')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @duing/web test -- --run test/notices/notice-poster-hero.test.tsx`
Expected: FAIL — 버튼(`공지 제목 대표 이미지 크게 보기`)을 찾지 못함(현재는 버튼이 없음).

- [ ] **Step 3: NoticePosterHero 수정**

`frontend/apps/web/app/notices/_components/NoticePosterHero.tsx` **전체**를 아래로 교체:

```tsx
'use client';

import { useState } from 'react';

import { ImageWithFallback } from '../../_components/ImageWithFallback';
import { NoticeImageLightbox, type NoticeImage } from './NoticeImageLightbox';

type Props = {
  coverImageUrl: string;
  title: string;
  summary: string;
};

export function NoticePosterHero({ coverImageUrl, title, summary }: Props) {
  const [zoomed, setZoomed] = useState<NoticeImage | null>(null);
  const hasCover = Boolean(coverImageUrl);

  return (
    <>
      <div className="grid md:grid-cols-[280px_1fr] gap-7 items-start mb-8">
        {hasCover ? (
          <button
            type="button"
            onClick={() => setZoomed({ src: coverImageUrl, alt: title })}
            aria-label={`${title} 대표 이미지 크게 보기`}
            className="aspect-[3/4] w-full overflow-hidden rounded-lg border border-line shadow-2 cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          >
            <ImageWithFallback
              src={coverImageUrl}
              alt={title}
              className="w-full h-full"
              emptyMessage="이미지 없음"
            />
          </button>
        ) : (
          <ImageWithFallback
            src={coverImageUrl}
            alt={title}
            className="aspect-[3/4] w-full rounded-lg overflow-hidden border border-line shadow-2"
            emptyMessage="이미지 없음"
          />
        )}
        {summary ? (
          <p className="text-[17.5px] leading-[1.8] font-medium text-charcoal">{summary}</p>
        ) : (
          <span />
        )}
      </div>
      <NoticeImageLightbox image={zoomed} onClose={() => setZoomed(null)} />
    </>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @duing/web test -- --run test/notices/notice-poster-hero.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/notices/_components/NoticePosterHero.tsx frontend/apps/web/test/notices/notice-poster-hero.test.tsx
git commit -m "feat(web): 공지 상세 커버 이미지 클릭 시 라이트박스 확대"
```

---

## Task 3: 본문 이미지 탭 → 라이트박스 (NoticeContent)

**Files:**
- Modify: `frontend/apps/web/app/notices/_components/NoticeContent.tsx`
- Test: `frontend/apps/web/test/notices/notice-content.test.tsx`

- [ ] **Step 1: 실패하는 테스트 보강**

`frontend/apps/web/test/notices/notice-content.test.tsx` 의 첫 줄 import 를 아래로 교체(`fireEvent`, `createEvent` 추가):

```tsx
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
```

그리고 기존 `describe('NoticeContent', () => { ... })` 블록 **안 맨 끝**(마지막 `it` 다음, 닫는 `});` 앞)에 아래 4개 테스트를 추가한다:

```tsx
  it('본문 이미지를 탭하면 그 이미지로 라이트박스가 열리고, 닫은 뒤 다른 이미지를 탭하면 전환된다', () => {
    const { container } = render(
      <NoticeContent
        format="HTML"
        content={'<p><img src="https://cdn.test/a.jpg" alt="A" /><img src="https://cdn.test/b.jpg" alt="B" /></p>'}
      />,
    );
    const [first, second] = container.querySelectorAll('img');

    fireEvent.pointerDown(first, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(first, { clientX: 0, clientY: 0 });
    expect(screen.getByTestId('notice-lightbox-image')).toHaveAttribute('src', 'https://cdn.test/a.jpg');

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    fireEvent.pointerDown(second, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(second, { clientX: 0, clientY: 0 });
    expect(screen.getByTestId('notice-lightbox-image')).toHaveAttribute('src', 'https://cdn.test/b.jpg');
  });

  it('이미지에서 시작해도 이동량이 크면(스크롤 제스처) 라이트박스가 열리지 않는다', () => {
    const { container } = render(
      <NoticeContent format="HTML" content={'<p><img src="https://cdn.test/a.jpg" alt="A" /></p>'} />,
    );
    const [image] = container.querySelectorAll('img');

    fireEvent.pointerDown(image, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(image, { clientX: 200, clientY: 200 });
    expect(screen.queryByTestId('notice-lightbox-image')).not.toBeInTheDocument();
  });

  it('본문 텍스트(이미지 아님)를 탭하면 라이트박스가 열리지 않는다', () => {
    const { container } = render(
      <NoticeContent format="HTML" content={'<p>본문 텍스트</p>'} />,
    );
    const [paragraph] = container.querySelectorAll('p');

    fireEvent.pointerDown(paragraph, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(paragraph, { clientX: 0, clientY: 0 });
    expect(screen.queryByTestId('notice-lightbox-image')).not.toBeInTheDocument();
  });

  it('<a> 로 감싼 본문 이미지는 탭 시 링크 이동 대신 라이트박스가 열린다', () => {
    const { container } = render(
      <NoticeContent
        format="HTML"
        content={'<p><a href="https://ext.example.com"><img src="https://cdn.test/c.jpg" alt="C" /></a></p>'}
      />,
    );
    const [image] = container.querySelectorAll('img');

    // 앵커 기본 이동이 onClickCapture 에서 막히는지 검증
    const clickEvent = createEvent.click(image);
    fireEvent(image, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);

    // 탭하면 라이트박스가 열린다
    fireEvent.pointerDown(image, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(image, { clientX: 0, clientY: 0 });
    expect(screen.getByTestId('notice-lightbox-image')).toHaveAttribute('src', 'https://cdn.test/c.jpg');
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @duing/web test -- --run test/notices/notice-content.test.tsx`
Expected: FAIL — 새 4개 테스트에서 `notice-lightbox-image` 를 찾지 못하거나 `defaultPrevented` 가 `false`(현재 위임 없음). 기존 3개는 PASS.

- [ ] **Step 3: NoticeContent 수정**

`frontend/apps/web/app/notices/_components/NoticeContent.tsx` **전체**를 아래로 교체. `PROSE_CLASS` 문자열은 기존 그대로 유지하고(절대 변경 금지), 위임 컨테이너에 `[&_img]:cursor-zoom-in` 을 둔다:

```tsx
'use client';

import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import type { NoticeContentFormat } from '@duing/types';
import { NoticeMarkdown } from './NoticeMarkdown';
import { NoticeImageLightbox, type NoticeImage } from './NoticeImageLightbox';
import { sanitizeNoticeHtml } from '../_lib/sanitizeHtml';

const PROSE_CLASS = 'text-[16px] leading-[1.85] text-charcoal [&_p]:mb-4 [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_h2]:text-[21px] [&_h2]:font-bold [&_h2]:text-ink-deep [&_h2]:mt-9 [&_h2]:mb-3 [&_h2]:pl-3 [&_h2]:border-l-[3px] [&_h2]:border-sage [&_h3]:text-[17px] [&_h3]:font-bold [&_h3]:text-ink-deep [&_h3]:mt-6 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_li]:mb-1.5 [&_img]:w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-4 [&_blockquote]:text-charcoal-2';

// 탭(클릭) vs 스크롤 제스처 구분 — 시작점 대비 이동량이 이 값 미만이면 탭으로 본다.
const TAP_SLOP = 10;

type Props = {
  content: string;
  // 백엔드가 content_format 을 아직 안 내려주는 환경에서는 undefined 일 수 있다.
  format?: NoticeContentFormat;
};

export function NoticeContent({ content, format }: Props) {
  const [zoomed, setZoomed] = useState<NoticeImage | null>(null);
  // 포인터다운 시점의 좌표·대상 이미지를 기억해 포인터업에서 탭 여부를 판정한다.
  const tapStart = useRef<{ x: number; y: number; image: HTMLImageElement } | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    tapStart.current =
      event.target instanceof HTMLImageElement
        ? { x: event.clientX, y: event.clientY, image: event.target }
        : null;
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = tapStart.current;
    tapStart.current = null;
    if (!start || event.target !== start.image) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP) return;
    setZoomed({ src: start.image.currentSrc || start.image.src, alt: start.image.alt });
  }

  // 본문 이미지가 <a> 로 감싸여 있어도 탭=확대 우선 — 앵커 기본 이동을 막는다.
  function handleClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLImageElement) event.preventDefault();
  }

  // 본문 에디터 출력은 항상 HTML 이므로 HTML 을 기본으로 렌더한다.
  // 명시적으로 MARKDOWN 인 공지(레거시·동아리 평문)만 react-markdown 으로 위임한다.
  const body =
    format === 'MARKDOWN' ? (
      <NoticeMarkdown content={content} />
    ) : (
      <div
        className={PROSE_CLASS}
        // eslint-disable-next-line react/no-danger -- sanitizeNoticeHtml 로 allowlist sanitize 후 렌더
        dangerouslySetInnerHTML={{ __html: sanitizeNoticeHtml(content) }}
      />
    );

  return (
    <>
      <div
        className="[&_img]:cursor-zoom-in"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onClickCapture={handleClickCapture}
      >
        {body}
      </div>
      <NoticeImageLightbox image={zoomed} onClose={() => setZoomed(null)} />
    </>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @duing/web test -- --run test/notices/notice-content.test.tsx`
Expected: PASS (기존 3 + 신규 4 = 7 tests).

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/notices/_components/NoticeContent.tsx frontend/apps/web/test/notices/notice-content.test.tsx
git commit -m "feat(web): 공지 상세 본문 이미지 탭 시 라이트박스 확대"
```

---

## Task 4: 전체 검증 (typecheck / lint / test)

**Files:** 없음(검증만).

- [ ] **Step 1: 타입체크**

Run: `pnpm --filter @duing/web typecheck`
Expected: 에러 없이 종료(출력 끝에 에러 0). `any`/`as` 미사용, `ReactPointerEvent`/`ReactMouseEvent`/`NoticeImage` 타입이 모두 해소되어야 한다.

- [ ] **Step 2: 린트**

Run: `pnpm --filter @duing/web lint`
Expected: 신규/수정 파일에 에러 없음. (img 직접 사용 경고는 `eslint-disable-next-line @next/next/no-img-element` 주석으로 억제됨.)

- [ ] **Step 3: 공지 전체 테스트 스위트**

Run: `pnpm --filter @duing/web test -- --run test/notices`
Expected: 공지 디렉터리 전 테스트 PASS(기존 `notice-detail-page`·`sanitize-html`·`notices-page` 포함 회귀 없음).

- [ ] **Step 4: 전체 테스트(회귀 확인)**

Run: `pnpm --filter @duing/web test -- --run`
Expected: 전 스위트 PASS. (`setup.ts` 의 PointerEvent 폴리필이 기존 테스트에 영향 없음을 확인.)

- [ ] **Step 5: 시각 QA(수동, 선택)**

`pnpm --filter @duing/web dev`(:3000) 실행 후 임의 공지 상세에서: 커버 클릭→확대, 본문 이미지 탭→확대, ESC·닫기버튼·배경클릭·모바일(반응형) 아래로 스와이프 닫기, reduced-motion(OS 설정) 시 페이드 최소화 확인. 확인 후 dev 서버 종료.

---

## Self-Review

**1. Spec coverage**
- 단일 이미지 확대 → `NoticeImageLightbox`(Task 1). ✅
- `image: { src; alt? } | null` 상태 + `open` 파생 → Task 1 컴포넌트, Task 2·3 소비처. ✅
- 닫기 4종(버튼/ESC/배경/스와이프) → Task 1(버튼·ESC=Radix, 배경=backdrop 게이팅, 스와이프=`handleDragEnd` 거리·속도). ✅
- 드래그를 `motion.div` 래퍼에 → Task 1. ✅
- 배경 클릭은 backdrop 시작 클릭만 → Task 1 `backdropPointerDown` 게이팅 + 테스트. ✅
- 본문 Pointer 위임(slop) + `<a>` preventDefault 분리 → Task 3 + 테스트 4종. ✅
- 커버 `<button>` 화 + 키보드 접근 → Task 2. ✅
- 확대 커서(`[&_img]:cursor-zoom-in`) HTML·마크다운 공통 → Task 3 위임 컨테이너. ✅
- 테스트: 라이트박스 단위/커버/본문 다중 전환/slop/텍스트/anchor → Task 1·2·3. ✅
- Out of scope(목록·관리자·핀치줌·갤러리·키보드 트리거·sanitize 변경) → 미포함 확인. ✅

**2. Placeholder scan:** TBD/TODO/"적절히 처리" 류 없음. 모든 코드·명령·기대출력 구체화됨. ✅

**3. Type consistency:** `NoticeImage = { src: string; alt?: string }` 를 Task 1 에서 export, Task 2·3 에서 동일 import. `image`/`onClose` prop 시그니처 일관. `setZoomed`(상태 setter) 이름 3 파일 공통 의도. `data-testid="notice-lightbox-image"`/`"notice-lightbox-backdrop"` 가 컴포넌트와 테스트에서 동일. ✅
