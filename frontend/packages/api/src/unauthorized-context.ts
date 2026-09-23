// 세션 종료(refresh 가 401/404 로 답함) 통지를 앱 레이어가 받아가는 사이드 채널.
// packages/api 는 라우터·스토어·DOM 을 직접 알 수 없으므로(플랫폼 추상화),
// registerCookieAdapter 와 동일하게 콜백 등록 방식으로 결합을 끊는다.

// refreshStartedAt — 종료를 확정한 refresh 가 전송된 시각. 벽시계가 아니라 문서 단조 시각(performance.now())이다 —
// 벽시계는 OS 시각 보정으로 역행해 비교가 영구히 뒤집힐 수 있다. 같은 문서 안의 세션 개시 시각과만 비교하며,
// 앱 레이어가 세션 개시 이전에 시작한 갱신의 늦은 통지를 가려내는 근거다(#845).
type UnauthorizedHandler = (refreshStartedAt: number) => void;

let handler: UnauthorizedHandler | null = null;
// 핸들러 등록 전에 도착한 종료 통지를 보관한다. 버리면 콜드 부팅 중 확정된 만료가 어디에도
// 남지 않아, 이후 화면이 만료를 모른 채 동작한다. 통지는 갱신 사이클당 1회(single-flight 실행기)라
// 큐가 아니라 값 하나로 충분하다(나중 통지가 덮는다). 시각을 함께 보관해야 늦게 등록된 핸들러도
// 세션 개시 이전 갱신의 통지를 가려낼 수 있다.
let pendingRefreshStartedAt: number | null = null;

export function registerUnauthorizedHandler(next: UnauthorizedHandler | null): void {
  handler = next;
  const pending = pendingRefreshStartedAt;
  if (next === null || pending === null) return;
  // 소비 후 호출 — 핸들러가 재진입해도 같은 통지를 두 번 흘리지 않는다.
  pendingRefreshStartedAt = null;
  next(pending);
}

// 기본값은 "지금" — 갱신 시각을 모르는 호출(bearer 분기 등)은 가장 최근 갱신으로 취급돼 가려지지 않는다.
export function notifyUnauthorized(refreshStartedAt: number = performance.now()): void {
  if (handler === null) {
    pendingRefreshStartedAt = refreshStartedAt;
    return;
  }
  handler(refreshStartedAt);
}
