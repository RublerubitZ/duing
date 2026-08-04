// 세션 종료(refresh 가 401/404 로 답함) 통지를 앱 레이어가 받아가는 사이드 채널.
// packages/api 는 라우터·스토어·DOM 을 직접 알 수 없으므로(플랫폼 추상화),
// registerCookieAdapter 와 동일하게 콜백 등록 방식으로 결합을 끊는다.

type UnauthorizedHandler = () => void;

let handler: UnauthorizedHandler | null = null;
// 핸들러 등록 전에 도착한 종료 통지를 보관한다. 버리면 콜드 부팅 중 확정된 만료가 어디에도
// 남지 않아, 이후 화면이 만료를 모른 채 동작한다. 통지는 갱신 사이클당 1회(single-flight 실행기)라
// 큐가 아니라 플래그 하나로 충분하다.
let pendingNotification = false;

export function registerUnauthorizedHandler(next: UnauthorizedHandler | null): void {
  handler = next;
  if (next === null || !pendingNotification) return;
  // 소비 후 호출 — 핸들러가 재진입해도 같은 통지를 두 번 흘리지 않는다.
  pendingNotification = false;
  next();
}

export function notifyUnauthorized(): void {
  if (handler === null) {
    pendingNotification = true;
    return;
  }
  handler();
}
