/**
 * 배포 스큐(version skew) 복구 — 구 번들 세션이 새 배포와 어긋나 죽는 것을 제한된 하드 리로드로 살린다.
 *
 * <p>Vercel 은 배포가 바뀌면 이전 빌드의 `/_next/static` 청크를 더 이상 서빙하지 않는다(404).
 * 열린 지 오래된 탭(iOS Safari 동결·복원, 브라우저 캐시의 구 HTML)이 클라이언트 내비게이션을
 * 하면 webpack 런타임이 등록되지 않은 모듈을 require 하다 죽는다 — Sentry 실측 부호 2종:
 * Safari `undefined is not an object (evaluating 'e[o].call')` / Chromium 계열
 * `Cannot read properties of undefined (reading 'call')` (둘 다 webpack-*.js 프레임),
 * 그리고 청크 자체가 404 인 `ChunkLoadError`. (2026-08-25 조사: NEXT-DUING-1B·1C·1D 등,
 * 구 런타임 webpack-108e0ae2… 가 prod 에서 404 로 확인됨.)
 *
 * <p>이 상태는 코드 결함이 아니라 "죽은 번들"이라, 유일한 복구는 현재 배포의 문서를 다시 받는
 * 하드 리로드다. 1차 방어는 Vercel Skew Protection(구 배포 자산을 세션 수명 동안 계속 서빙)이고,
 * 이 가드는 그 밖의 잔존 케이스(보호 창 만료·청크 평가 실패)를 덮는 폴백이다.
 *
 * <p>Sentry 보고와는 독립이다 — 리스너는 preventDefault 없이 관찰만 하므로 Sentry 전역 핸들러의
 * 캡처·전송은 그대로 일어나고, 이 가드는 복구만 담당한다.
 */

// webpack 런타임 청크 프레임 — 모듈 미스 판정을 런타임 내부 오류로만 좁힌다.
// 앱 코드의 우연한 `undefined.call` 오류(스택에 webpack-*.js 프레임 없음)는 리로드 대상이 아니다.
const WEBPACK_RUNTIME_FRAME = /\/_next\/static\/chunks\/webpack-[^\s/]+\.js/;
// __webpack_require__ 의 e[o].call 지점에서 모듈 팩토리가 undefined 일 때의 브라우저별 문구.
// 런타임 변수명은 빌드마다 달라질 수 있어 "짧은 식 + .call" 형태로 매칭한다.
const MODULE_REGISTRY_MISS =
  /Cannot read properties of undefined \(reading 'call'\)|undefined is not an object \(evaluating '[^']{0,80}\.call'\)/;
// webpack 청크 로드 실패 — 구 HTML 이 참조하는 소멸된 청크 URL 이 404 일 때.
const CHUNK_LOAD_FAILED = /Loading chunk [^\s]+ failed/;

const RECOVERY_STATE_KEY = 'duing:skew-recovery';
// 리로드 후에도 같은 오류가 나는 환경에서 리로드가 잦아지지 않도록 리로드 사이 최소 간격을 둔다.
const RELOAD_MIN_INTERVAL_MS = 60_000;
// 세션(탭)당 리로드 총량 상한 — 간격 제한만으로는 병적인 환경(끈질긴 캐시·프록시)에서
// "분당 1회 무한 리로드"가 되므로, 상한 도달 후에는 복구를 포기하고 오류를 그대로 둔다.
const MAX_RELOADS_PER_SESSION = 3;

/** 배포 스큐(죽은 번들) 부호인지 판정한다. Error 가 아니면 항상 false. */
export function isDeploySkewError(candidate: unknown): boolean {
  if (!(candidate instanceof Error)) return false;
  if (candidate.name === 'ChunkLoadError' || CHUNK_LOAD_FAILED.test(candidate.message)) return true;
  return (
    MODULE_REGISTRY_MISS.test(candidate.message) &&
    typeof candidate.stack === 'string' &&
    WEBPACK_RUNTIME_FRAME.test(candidate.stack)
  );
}

let reloadScheduled = false;

/** `${count}:${lastAt}` 형태의 복구 이력을 읽는다. 값이 깨져 있으면 초기 상태로 취급. */
function readRecoveryState(storedValue: string | null): { count: number; lastAt: number } {
  if (storedValue === null) return { count: 0, lastAt: 0 };
  const [countPart, lastAtPart] = storedValue.split(':');
  const count = Number(countPart);
  const lastAt = Number(lastAtPart);
  if (!Number.isFinite(count) || !Number.isFinite(lastAt)) return { count: 0, lastAt: 0 };
  return { count, lastAt };
}

function scheduleReloadOnce(reload: () => void): void {
  if (reloadScheduled) return;
  try {
    const { count, lastAt } = readRecoveryState(window.sessionStorage.getItem(RECOVERY_STATE_KEY));
    if (count >= MAX_RELOADS_PER_SESSION) return;
    if (Date.now() - lastAt < RELOAD_MIN_INTERVAL_MS) return;
    window.sessionStorage.setItem(RECOVERY_STATE_KEY, `${count + 1}:${Date.now()}`);
  } catch {
    // 저장소를 못 쓰는 환경(스토리지 차단 등)은 리로드 이력을 남길 수 없어 루프 방지가 불가능하다.
    // 이때는 리로드하지 않는다(fail-open) — 오류는 Sentry 로 이미 보고됐고 복구만 포기한다.
    return;
  }
  reloadScheduled = true;
  // 리로드를 한 틱 미룬다. 두 가지 이유:
  // (1) Sentry 전역 핸들러가 이 오류를 캡처해 전송 요청을 발사할 시간을 준다 — 전송 자체는
  //     keepalive fetch 라 리로드에도 살아남지만, 캡처 파이프라인이 요청을 만들기 전에 문서가
  //     내려가면 이벤트가 유실된다.
  // (2) 스큐 부트는 실측상 한 번에 4~7건이 연발한다(모듈 require 실패마다 1건) — 지연이
  //     버스트를 한 번의 리로드로 묶는다.
  window.setTimeout(reload, 250);
}

/**
 * 전역 error/unhandledrejection 에서 스큐 부호를 감지하면 제한된 하드 리로드를 예약한다.
 * instrumentation-client 에서 Sentry 초기화 뒤에 한 번 호출한다. 반환값은 리스너 해제 함수 —
 * 앱은 문서 수명 동안 유지하므로 쓰지 않고, 테스트가 케이스 간 격리에 쓴다.
 */
export function installDeploySkewRecovery(
  reload: () => void = () => window.location.reload(),
): () => void {
  const onError = (event: ErrorEvent): void => {
    if (isDeploySkewError(event.error)) scheduleReloadOnce(reload);
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    if (isDeploySkewError(event.reason)) scheduleReloadOnce(reload);
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
