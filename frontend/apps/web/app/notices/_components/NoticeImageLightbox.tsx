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
          className="fixed inset-0 z-[70] flex flex-col outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
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
