'use client';

import { useRef } from 'react';

// 공용 시트·다이얼로그가 닫히면 열기 직전 포커스 자리로 되돌린다(Radix dialog 1.1.16·focus-scope 1.1.9 소스 기준).
// 모달 Dialog 의 onCloseAutoFocus 는 FocusScope 기본 복귀(열 때 잡은 자리)를 막고 Trigger 로만 보내는데, 앱 소비처는
// Trigger 를 쓰지 않아(0건) 닫히면 포커스가 body 로 빠진다. 그래서 래퍼가 열 때 자리를 기억했다가 직접 되돌린다.
// 되돌리지 않을 때는 preventDefault 도 하지 않는다 — Trigger 가 있으면 Radix 가 그대로 Trigger 로 보낸다.
// - 닫는 순간 포커스가 이미 다른 요소에 있으면 그대로 둔다: 트랩이 풀린 뒤 앱(닫힘 effect·비동기 콜백)이나 사용자가 옮긴 자리다.
// - 열기 직전 자리가 입력 요소면 되돌리지 않는다: 탭이 버튼으로 포커스를 옮기지 않는 환경에서는 입력 중에 연 창의 자리가
//   그 입력칸일 수 있고, 되돌리면 닫는 탭에 맞춰 키보드·피커가 다시 올라올 수 있다.

type AutoFocusHandlers = {
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
};

// container 는 그 열림의 FocusScope 컨테이너(열림·닫힘 이벤트의 target)다 — 같은 창이 빠르게 다시 열리는 경합(동작 줄이기)
// 에서 옛 닫힘이 새 열림의 기억으로 되돌리지 않게 짝을 맞춘다.
type RememberedFocus = { container: EventTarget | null; element: HTMLElement };

// 포커스만으로는 입력 UI 를 띄우지 않는 input type — 나머지(text·search·email·number·date 등)는 띄울 수 있다.
const INPUT_TYPES_WITHOUT_INPUT_UI = new Set([
  'button',
  'checkbox',
  'radio',
  'submit',
  'reset',
  'range',
  'color',
  'file',
  'image',
]);

/**
 * 포커스를 받으면 키보드·피커 같은 입력 UI 를 띄울 수 있는 요소인가 — 텍스트형 input·textarea·select·contenteditable.
 * ProfileCheckPrompt 의 isUserBusyElsewhere(입력 중이면 팝업을 띄우지 않음)도 비슷한 판정을 한다 — 합치지는 않았다.
 */
export function opensInputUiOnFocus(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLInputElement) return !INPUT_TYPES_WITHOUT_INPUT_UI.has(element.type);
  return element instanceof HTMLElement && element.isContentEditable;
}

/** DialogContent·SheetContent 가 Radix Content 에 넘길 열림·닫힘 자동 포커스 핸들러 — 소비처 핸들러를 감싼다. */
export function useOverlayFocusReturn({ onOpenAutoFocus, onCloseAutoFocus }: AutoFocusHandlers) {
  const rememberedRef = useRef<RememberedFocus | null>(null);

  return {
    onOpenAutoFocus: (event: Event) => {
      // 소비처(제목 포커스 등)가 포커스를 안으로 옮기기 전에 잡는다.
      const activeElement = document.activeElement;
      rememberedRef.current =
        activeElement instanceof HTMLElement && activeElement !== document.body
          ? { container: event.target, element: activeElement }
          : null;
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event);
      const remembered = rememberedRef.current;
      rememberedRef.current = null;
      if (event.defaultPrevented) return;
      const activeElement = document.activeElement;
      if (
        remembered !== null &&
        remembered.container === event.target &&
        remembered.element.isConnected &&
        (activeElement === null || activeElement === document.body) &&
        !opensInputUiOnFocus(remembered.element)
      ) {
        event.preventDefault();
        remembered.element.focus({ preventScroll: true });
      }
    },
  };
}
