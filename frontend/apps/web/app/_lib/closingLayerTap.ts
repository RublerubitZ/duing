// 겹친 오버레이에서 위 다이얼로그를 닫는 탭(수정 창 "취소" 등)이 아래 시트·다이얼로그까지 닫지 않게 하는 판정. 공용 SheetContent·DialogContent 가 쓴다.
// 설계: docs/superpowers/specs/2026-10-20-overlay-closing-layer-tap-design.md
// 출처(Radix dismissable-layer 1.1.12·dialog 1.1.16 소스 기준): 터치 pointerdown 의 바깥 판정은 뒤따르는 click 때로 미뤄진다.
// 다이얼로그는 닫히기 시작하면 바깥 포인터 차단을 풀고, 닫힘 애니메이션 동안 data-state="closed" 로 DOM 에 남는다.
// 관측(§1 재현 — WebKit·Chromium 터치 에뮬레이션): "취소"가 위를 닫는 렌더가 그 click 판정보다 먼저 끝나, 아래가 그 탭을 바깥 탭으로 받았다.
const CLOSING_DIALOG_SELECTOR =
  '[role="dialog"][data-state="closed"], [role="alertdialog"][data-state="closed"]';

/** 닫히는 중이거나 이미 DOM 에서 빠진 다이얼로그에서 시작한 이벤트인가. */
export function startedOnClosingLayer(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  // 닫힘 애니메이션 없이(동작 줄이기·jsdom) 이미 빠진 레이어.
  if (!target.isConnected) return true;
  const element = target instanceof Element ? target : target.parentElement;
  if (element === null) return false; // document 노드 등
  return element.closest(CLOSING_DIALOG_SELECTOR) !== null;
}
