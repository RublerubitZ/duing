// 플랫폼별 연결 상태 어댑터. packages/* 는 DOM API 를 직접 참조하지 않으므로
// (RN 등 플랫폼 추상화), 앱 쪽에서 navigator.onLine 등을 주입한다.
// 어댑터가 명시적으로 false 를 반환할 때만 오프라인으로 판정한다 —
// navigator.onLine 은 false-negative(온라인인데 신호 없음)가 있어 그 외에는 요청을 진행시키고
// 타임아웃(REQUEST_TIMEOUT_MS)이 최종 방어선이 된다. (스펙 §3.3)
// 보내려는 요청은 beforeRequest 만 넘긴다(요청마다 판정을 달리할 수 있게) — 401 뒤 갱신·재시도 가드는 요청 없이 부른다.
type ConnectivityAdapter = (request?: Request) => boolean;

let connectivityAdapter: ConnectivityAdapter | null = null;

export function registerConnectivityAdapter(adapter: ConnectivityAdapter | null): void {
  connectivityAdapter = adapter;
}

export function isKnownOffline(request?: Request): boolean {
  if (!connectivityAdapter) return false;
  try {
    return connectivityAdapter(request) === false;
  } catch {
    return false;
  }
}
