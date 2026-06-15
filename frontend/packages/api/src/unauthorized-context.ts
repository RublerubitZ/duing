// 인증 만료(401) 감지 시 호출할 핸들러를 앱 레이어가 주입한다.
// packages/api 는 라우터·스토어·DOM 을 직접 알 수 없으므로(플랫폼 추상화),
// registerCookieAdapter 와 동일하게 콜백 등록 방식으로 결합을 끊는다.

type UnauthorizedHandler = () => void;

let handler: UnauthorizedHandler | null = null;

export function registerUnauthorizedHandler(next: UnauthorizedHandler | null): void {
  handler = next;
}

export function notifyUnauthorized(): void {
  handler?.();
}
