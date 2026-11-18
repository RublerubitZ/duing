import { NETWORK_ERROR_MESSAGE } from './http';

// 플랫폼별 연결 상태 어댑터. packages/* 는 DOM API 를 직접 참조하지 않으므로
// (RN 등 플랫폼 추상화), 앱 쪽에서 navigator.onLine 등을 주입한다.
// 어댑터가 false 면 오프라인, 문자열이면 그 문구로 요청을 막는다(원인이 네트워크가 아닌 막힘 — 웹: 다른 탭이 로그인 상태를 바꿈).
// 그 밖(true·예외)은 요청을 진행시킨다 — navigator.onLine 은 false-negative(온라인인데 신호 없음)가 있어
// 타임아웃(REQUEST_TIMEOUT_MS)이 최종 방어선이 된다. (스펙 §3.3)
// 보내려는 요청은 beforeRequest 만 넘긴다(요청마다 판정을 달리할 수 있게) — 401 뒤 갱신·재시도 가드는 요청 없이 부른다.
type ConnectivityAdapter = (request?: Request) => boolean | string;

let connectivityAdapter: ConnectivityAdapter | null = null;

export function registerConnectivityAdapter(adapter: ConnectivityAdapter | null): void {
  connectivityAdapter = adapter;
}

// 요청을 막아야 하면 사용자에게 보일 문구, 아니면 null. 문자열은 참·거짓이 아니라 타입으로 본다(빈 문자열도 막힘).
export function blockedRequestMessage(request?: Request): string | null {
  if (!connectivityAdapter) return null;
  try {
    const verdict = connectivityAdapter(request);
    if (verdict === false) return NETWORK_ERROR_MESSAGE;
    return typeof verdict === 'string' ? verdict : null;
  } catch {
    return null;
  }
}

// 요청 없이 부르는 가드(401 뒤 갱신·재시도·만료 알림)용 — 오프라인과 막힘을 함께 본다.
export function isKnownOffline(): boolean {
  return blockedRequestMessage() !== null;
}
