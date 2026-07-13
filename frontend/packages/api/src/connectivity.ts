// 플랫폼별 연결 상태 어댑터. packages/* 는 DOM API 를 직접 참조하지 않으므로
// (RN 등 플랫폼 추상화), 앱 쪽에서 navigator.onLine 등을 주입한다.
// 어댑터가 명시적으로 false 를 반환할 때만 오프라인으로 판정한다 —
// navigator.onLine 은 false-negative(온라인인데 신호 없음)가 있어 그 외에는 요청을 진행시키고
// 타임아웃(REQUEST_TIMEOUT_MS)이 최종 방어선이 된다. (스펙 §3.3)
type ConnectivityAdapter = () => boolean;

let connectivityAdapter: ConnectivityAdapter | null = null;

export function registerConnectivityAdapter(adapter: ConnectivityAdapter | null): void {
  connectivityAdapter = adapter;
}

export function isKnownOffline(): boolean {
  if (!connectivityAdapter) return false;
  try {
    return connectivityAdapter() === false;
  } catch {
    return false;
  }
}
