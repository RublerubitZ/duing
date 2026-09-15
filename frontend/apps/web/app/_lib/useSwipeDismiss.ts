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
  /** 위 방향(저항) 드래그를 허용하는가 — 핸들 영역에서 시작했고 target~콘텐츠 사이에 스크롤 가능한
   *  요소가 없을 때만 true. 아니면 위로 움직이는 순간 드래그를 포기하고 스크롤에 맡긴다. */
  allowUpward: boolean;
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

/** event.target 에서 시트 콘텐츠까지 올라가며 스크롤 가능한 요소가 있는지 본다 — 위 방향 드래그 허용에만 쓴다.
 *  스크롤 가능 = 실제로 넘치면서(+1 은 소수점 높이 반올림 오차) overflowY 가 auto·scroll 이다. 넘쳐도
 *  overflow-hidden 인 요소(말줄임, 탐색 필터 시트의 콘텐츠)는 스크롤되지 않으니 제외한다. */
function hasScrollableAncestor(target: Node, content: HTMLElement): boolean {
  let node: Node | null = target;
  while (node !== null) {
    if (node instanceof HTMLElement && node.scrollHeight > node.clientHeight + 1) {
      const { overflowY } = window.getComputedStyle(node);
      if (overflowY === 'auto' || overflowY === 'scroll') return true;
    }
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
    // setPointerCapture 도 필요 없다. 대신 enabled 에 열림 상태가 들어가 있어야 한다 — 안 그러면
    // 시트가 닫힌 페이지에서도 non-passive touchmove 가 남아 모든 터치 스크롤이 핸들러를 기다린다.
    let snapTimer: ReturnType<typeof setTimeout> | null = null;
    let clickGuardTimer: ReturnType<typeof setTimeout> | null = null;

    const clearInlineTransition = (content: HTMLElement) => {
      content.style.transition = '';
    };

    // 드래그로 끝난 직후의 click 1회를 막는다 — 마우스 드래그를 필터 칩 위에서 놓으면 그 칩이
    // 눌린다(BannerCarouselClient 의 didDragRef 와 같은 취지). 터치처럼 click 이 아예 안 오는
    // 경로도 있어, 다음 매크로태스크에 무조건 해제해 엉뚱한 탭까지 삼키지 않게 한다.
    const suppressClick = (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
    };

    const disarmClickGuard = () => {
      if (clickGuardTimer !== null) {
        clearTimeout(clickGuardTimer);
        clickGuardTimer = null;
      }
      document.removeEventListener('click', suppressClick, true);
    };

    const armClickGuard = () => {
      document.addEventListener('click', suppressClick, { capture: true, once: true });
      clickGuardTimer = setTimeout(disarmClickGuard, 0);
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
      if (event.button !== 0) return; // 주 버튼만 — 우클릭·가운데 클릭은 드래그가 아니다.
      if (content === null || dragRef.current !== null) return;
      if (!(target instanceof Node) || !content.contains(target)) return;

      // 이미 스크롤된 조상이 있으면 어디서 시작했든(핸들·sticky CTA 포함) 드래그를 시작하지 않는다 —
      // 콘텐츠 자체가 스크롤러인 시트(시설 빠른 예약)에서 상단을 잡고 목록을 되올리려던 플릭이 시트를 닫아
      // 입력 중인 폼이 사라진다. 이 상태에서는 오버레이 탭·뒤로가기로 닫는다(Vaul 과 같은 선택).
      if (hasScrolledAncestor(target, content)) return;

      const rect = content.getBoundingClientRect();
      const fromHandle = event.clientY - rect.top <= HANDLE_ZONE_PX;
      // getComputedStyle 은 핸들 영역에서 시작했을 때만 돌린다 — 본문 탭마다 스타일을 읽지 않게.
      const allowUpward = fromHandle && !hasScrollableAncestor(target, content);

      // 스냅백 도중 다시 잡으면 전이를 끊는다. 인라인 transition 도 같이 비운다 — 여기서 잡기만
      // 하고 드래그가 안 잠기면(단순 탭) 200ms 전이가 인라인으로 영구히 남아 Tailwind 의 transition
      // 클래스를 덮어쓴다.
      if (snapTimer !== null) {
        clearTimeout(snapTimer);
        snapTimer = null;
        clearInlineTransition(content);
      }
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        allowUpward,
        height: rect.height,
        locked: false,
        samples: [{ time: performance.now(), y: event.clientY }],
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const content = contentRef.current;
      if (drag === null || content === null || event.pointerId !== drag.pointerId) return;
      // 버튼이 눌리지 않은 마우스 이동 = pointerup 을 놓쳤다(창 밖에서 떼기 등). pointercancel 과 같게 끝낸다 —
      // 드래그가 남으면 이후 pointerdown 을 모두 무시하고, 버튼을 뗀 채 움직여도 시트가 따라온다.
      // 터치·펜은 접촉 중 buttons 가 1 이상이라 여기 걸리지 않는다.
      if (event.pointerType === 'mouse' && event.buttons === 0) {
        dragRef.current = null;
        if (drag.locked) snapBack(content);
        return;
      }

      const deltaY = event.clientY - drag.startY;
      const deltaX = event.clientX - drag.startX;
      if (!drag.locked) {
        // 8px 전에는 판정 보류 — 탭과 스크롤을 빼앗지 않는다.
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) <= LOCK_PX) return;
        // 수평 우세면 포기(방어용 — 현재 시트 안에 가로 레일은 없다).
        // 위로 올라가면 스크롤에 맡긴다 — 핸들 영역이고 스크롤할 곳이 없을 때(allowUpward)만 저항으로 따라간다.
        if (Math.abs(deltaX) > Math.abs(deltaY) || (!drag.allowUpward && deltaY < 0)) {
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
      armClickGuard();

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
    // cancelable 이 false 면 네이티브 스크롤이 이미 시작돼 막을 수 없다 — 호출하면 개입 경고만 남는다(안드로이드 Chrome).
    const handleTouchMove = (event: TouchEvent) => {
      if (dragRef.current?.locked === true && event.cancelable) event.preventDefault();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      if (snapTimer !== null) clearTimeout(snapTimer);
      // 클릭 가드는 여기서 풀지 않는다 — 닫힘 경로에서는 onDismiss 렌더로 이 cleanup 이
      // 브라우저의 click 디스패치보다 먼저 돌아 가드가 무력화되므로, 해제는 setTimeout(0) 에 맡긴다.
      dragRef.current = null;
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
      document.removeEventListener('touchmove', handleTouchMove);
    };
  }, [enabled, contentRef]);
}
