'use client';

// 활동 사진 풀스크린 라이트박스. Radix Dialog 로 포커스 트랩·ESC·스크롤 잠금·a11y 를 확보하고,
// framer-motion drag 로 모바일 좌우 스와이프(사진 전환)·아래로 끌어 닫기를 처리한다.
// 데스크탑은 좌우 화살표 버튼 + 키보드(←/→), 공통으로 카운터와 캡션을 노출한다.

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion, useReducedMotion, type PanInfo } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';

import type { ClubPhoto } from '@duing/types';

import { ArrowLeft, ArrowRight, X } from '@/components/duing/Icon';

type Props = {
  photos: ClubPhoto[];
  /** 처음 열릴 때 보여줄 사진의 인덱스. */
  initialIndex: number;
  open: boolean;
  onClose: () => void;
};

// 좌우 전환 임계값(px) — 이만큼 끌면 이전/다음 사진으로.
const SWIPE_NAV_THRESHOLD = 60;
// 아래로 끌어 닫기 임계값(px).
const SWIPE_CLOSE_THRESHOLD = 120;

export function PhotoLightbox({ photos, initialIndex, open, onClose }: Props) {
  const count = photos.length;
  const [current, setCurrent] = useState(initialIndex);
  // 전역 MotionConfig 가 transform 모션은 줄여주지만, 여기서 추가한 페이드/탄성도 함께 끈다.
  const reduceMotion = useReducedMotion();

  // 열릴 때마다 클릭한 사진으로 맞춘다.
  useEffect(() => {
    if (open) setCurrent(initialIndex);
  }, [open, initialIndex]);

  const goTo = useCallback(
    (next: number) => {
      if (count === 0) return;
      // 끝에서 순환한다.
      setCurrent(((next % count) + count) % count);
    },
    [count],
  );
  const goPrev = useCallback(() => goTo(current - 1), [goTo, current]);
  const goNext = useCallback(() => goTo(current + 1), [goTo, current]);

  // 키보드 좌우 내비게이션 (ESC 닫기는 Radix 가 처리).
  useEffect(() => {
    if (!open) return undefined;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft') goPrev();
      else if (event.key === 'ArrowRight') goNext();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, goPrev, goNext]);

  const photo = photos[current];

  function handleDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const { offset } = info;
    if (Math.abs(offset.x) > Math.abs(offset.y)) {
      if (offset.x <= -SWIPE_NAV_THRESHOLD) goNext();
      else if (offset.x >= SWIPE_NAV_THRESHOLD) goPrev();
    } else if (offset.y >= SWIPE_CLOSE_THRESHOLD) {
      onClose();
    }
  }

  if (count === 0 || !photo) return null;

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
          {/* Radix 가 이 Title 을 aria-labelledby 로 연결한다. 따로 aria-label 을 주면 카운터 정보가 가려진다. */}
          <DialogPrimitive.Title className="sr-only">
            활동 사진 크게 보기
          </DialogPrimitive.Title>

          {/* 상단 바 — 카운터 · 닫기 */}
          <div className="flex items-center justify-between px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white">
            <span
              data-testid="lightbox-counter"
              role="status"
              aria-live="polite"
              aria-label={`전체 ${count}장 중 ${current + 1}번째`}
              className="text-sm font-semibold tabular-nums"
            >
              {current + 1} / {count}
            </span>
            <DialogPrimitive.Close
              aria-label="닫기"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <X size={20} />
            </DialogPrimitive.Close>
          </div>

          {/* 사진 영역 */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden px-2 pb-2">
            {count > 1 && (
              <button
                type="button"
                onClick={goPrev}
                aria-label="이전 사진"
                className="absolute left-3 z-10 hidden h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:grid"
              >
                <ArrowLeft size={22} />
              </button>
            )}

            <motion.img
              key={photo.id}
              src={photo.storageKey}
              alt={photo.caption ?? ''}
              draggable={false}
              drag
              dragSnapToOrigin
              dragElastic={reduceMotion ? 0 : 0.25}
              dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
              onDragEnd={handleDragEnd}
              initial={reduceMotion ? false : { opacity: 0.4 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.15 }}
              className="max-h-full max-w-full cursor-grab touch-none select-none object-contain active:cursor-grabbing"
            />

            {count > 1 && (
              <button
                type="button"
                onClick={goNext}
                aria-label="다음 사진"
                className="absolute right-3 z-10 hidden h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:grid"
              >
                <ArrowRight size={22} />
              </button>
            )}
          </div>

          {/* 캡션 */}
          {photo.caption && (
            <div className="px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-1 text-center text-sm text-white/85">
              {photo.caption}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
