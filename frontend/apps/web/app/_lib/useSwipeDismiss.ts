'use client';

import { useEffect, useRef, type RefObject } from 'react';

// 바텀시트를 아래로 스와이프해 닫는 제스처. 공용 Sheet(side="bottom") 한 곳에서만 쓴다.
// 설계: docs/superpowers/specs/2026-09-13-bottom-sheet-swipe-dismiss-design.md
//
// 임계값은 Vaul(바텀시트 사실상 표준 구현)의 기본값을 그대로 채택했다 — 손맛이 이미 검증된 수치라
// 직접 튜닝하지 않는다. 거리 25% / 속도 0.4px·ms / 드래그 중 전이 없음 / 경계 저항.
const CLOSE_RATIO = 0.25; // 시트 높이의 25% 이상 내려가면 닫힘
const VELOCITY_PX_PER_MS = 0.4; // 거리가 모자라도 이 속도를 넘으면 플릭으로 닫힘
const VELOCITY_WINDOW_MS = 100; // 속도를 재는 마지막 구간
const HANDLE_ZONE_PX = 56; // 핸들·헤더로 취급하는 시트 상단 영역
const LOCK_PX = 8; // 방향 판정을 보류하는 초기 이동량
const UPWARD_RESISTANCE = 4; // 위로 당길 때의 저항(이동량을 이 값으로 나눈다)
const SNAP_MS = 200;
const SNAP_EASING = 'cubic-bezier(.2,.7,.2,1)';

type SwipeDismissOptions = {
  /** side="bottom" + 닫기 콜백이 있을 때만 true. false 면 리스너를 아예 걸지 않는다. */
  enabled: boolean;
  onDismiss: () => void;
};

type Sample = { time: number; y: number };

type Drag = {
  pointerId: number;
  startX: number;
  startY: number;
  /** 핸들 영역에서 시작했는가 — 아니면 "스크롤 맨 위에서 아래로" 조건을 추가로 요구한다. */
  fromHandle: boolean;
  height: number;
  locked: boolean;
  samples: Sample[];
};

/** event.target 에서 시트 콘텐츠까지 올라가며 이미 스크롤된 스크롤러가 있는지 본다.
 *  탐색 필터 시트는 콘텐츠가 overflow-hidden 이고 안쪽 div 가 스크롤러라, 콘텐츠의 scrollTop 만
 *  보면 목록을 내려 본 뒤의 위쪽 스크롤 제스처를 닫기로 가로챈다. */
function hasScrolledAncestor(target: Node, content: HTMLElement): boolean {
  let node: Node | null = target;
  while (node !== null) {
    if (node instanceof HTMLElement && node.scrollTop > 0) return true;
    if (node === content) return false;
    node = node.parentNode;
  }
  return false;
}

export function useSwipeDismiss(
  contentRef: RefObject<HTMLElement | null>,
  { enabled, onDismiss }: SwipeDismissOptions,
): void {
  // 드래그 중 리렌더 0 — 상태는 전부 ref 이고 DOM 을 직접 만진다.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // 리스너는 document 에 건다. 시트 DOM 은 Radix Presence 가 열릴 때 마운트·닫힐 때 언마운트해서
    // 콘텐츠 노드에 직접 걸면 훅이 처음 실행될 때(닫힌 상태) 노드가 없고, 이후 열려도 이펙트가
    // 다시 돌지 않아 리스너가 영영 안 붙는다. document 리스너는 포인터가 시트 밖으로 나가도 이어져
    // setPointerCapture 도 필요 없다.
    let snapTimer: ReturnType<typeof setTimeout> | null = null;

    const clearInlineTransition = (content: HTMLElement) => {
      content.style.transition = '';
    };

    /** 원위치로 되돌린다. reduced-motion 이면 전이 없이 즉시. */
    const snapBack = (content: HTMLElement) => {
      const duration = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
        ? 0
        : SNAP_MS;
      content.style.transition = `transform ${duration}ms ${SNAP_EASING}`;
      content.style.transform = '';
      snapTimer = setTimeout(() => {
        snapTimer = null;
        clearInlineTransition(content);
      }, duration);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const content = contentRef.current;
      const target = event.target;
      if (content === null || dragRef.current !== null) return;
      if (!(target instanceof Node) || !content.contains(target)) return;

      const rect = content.getBoundingClientRect();
      const fromHandle = event.clientY - rect.top <= HANDLE_ZONE_PX;
      if (!fromHandle && hasScrolledAncestor(target, content)) return;

      if (snapTimer !== null) {
        clearTimeout(snapTimer);
        snapTimer = null;
      }
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        fromHandle,
        height: rect.height,
        locked: false,
        samples: [{ time: performance.now(), y: event.clientY }],
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const content = contentRef.current;
      if (drag === null || content === null || event.pointerId !== drag.pointerId) return;

      const deltaY = event.clientY - drag.startY;
      const deltaX = event.clientX - drag.startX;
      if (!drag.locked) {
        // 8px 전에는 판정 보류 — 탭과 스크롤을 빼앗지 않는다.
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) <= LOCK_PX) return;
        // 수평 우세면 포기(방어용 — 현재 시트 안에 가로 레일은 없다).
        // 스크롤 맨 위에서 시작했는데 위로 올라가면 스크롤에 맡긴다.
        if (Math.abs(deltaX) > Math.abs(deltaY) || (!drag.fromHandle && deltaY < 0)) {
          dragRef.current = null;
          return;
        }
        drag.locked = true;
        content.style.transition = 'none';
      }

      drag.samples.push({ time: performance.now(), y: event.clientY });
      const offset = deltaY >= 0 ? deltaY : deltaY / UPWARD_RESISTANCE;
      content.style.transform = `translateY(${offset}px)`;
    };

    /** 마지막 VELOCITY_WINDOW_MS 구간의 아래 방향 속도(px/ms). */
    const downwardVelocity = (samples: Sample[]): number => {
      const last = samples[samples.length - 1];
      if (last === undefined) return 0;
      let oldest = last;
      for (let index = samples.length - 2; index >= 0; index -= 1) {
        const sample = samples[index];
        if (sample === undefined || last.time - sample.time > VELOCITY_WINDOW_MS) break;
        oldest = sample;
      }
      const elapsed = last.time - oldest.time;
      return elapsed > 0 ? (last.y - oldest.y) / elapsed : 0;
    };

    const handlePointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      const content = contentRef.current;
      if (drag === null || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      if (!drag.locked || content === null) return;

      const deltaY = event.clientY - drag.startY;
      const shouldDismiss =
        deltaY > drag.height * CLOSE_RATIO || downwardVelocity(drag.samples) > VELOCITY_PX_PER_MS;
      if (shouldDismiss) {
        // 인라인 transform 은 그대로 둔다. tailwindcss-animate 의 slide-out-to-bottom 은 to 만
        // 정의돼 있어 지금 내려간 위치에서 100% 로 이어지고, Radix Presence 가 끝난 뒤 언마운트한다.
        onDismissRef.current();
        return;
      }
      snapBack(content);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      const drag = dragRef.current;
      const content = contentRef.current;
      if (drag === null || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      // 브라우저가 제스처를 가져간 경우 — 스냅백하지 않으면 시트가 중간에 멈춘 채 남는다.
      if (drag.locked && content !== null) snapBack(content);
    };

    // iOS Safari 는 touchmove 기본 스크롤이 pointer 이벤트와 별개라, 드래그가 잠긴 동안에만
    // preventDefault 로 막는다(잠기기 전에는 그대로 스크롤되어야 한다 → passive:false 필요).
    const handleTouchMove = (event: TouchEvent) => {
      if (dragRef.current?.locked === true) event.preventDefault();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      if (snapTimer !== null) clearTimeout(snapTimer);
      dragRef.current = null;
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
      document.removeEventListener('touchmove', handleTouchMove);
    };
  }, [enabled, contentRef]);
}
