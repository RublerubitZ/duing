// 뒤로/앞으로(popstate) 내비게이션에서만 View Transition 애니메이션을 무효화하는 마커를 관리한다.
// iOS 스와이프 백은 네이티브 스냅샷 슬라이드를 이미 그리므로, next-view-transitions 가 popstate 에
// 무조건 실행하는 웹 크로스페이드가 겹치면 이중 전환으로 보인다(라이브러리에 비활성 옵션 없음).
// 마커가 있는 동안 시작된 전환은 globals.css 규칙으로 애니메이션 없이 즉시 완료된다.

const BACK_NAVIGATION_ATTRIBUTE = 'data-back-navigation';
// popstate 후 전환이 시작되지 않는 예외 상황(해시 전용 이동 등)에서도 마커가 남지 않게 하는 안전장치.
const FAILSAFE_CLEAR_MS = 2000;

let installed = false;

export function installBackNavigationViewTransitionGuard() {
  if (installed) return;
  if (typeof window === 'undefined') return;
  // 미지원 브라우저는 라이브러리도 전환을 실행하지 않으므로 설치 자체가 불필요하다.
  if (typeof document.startViewTransition !== 'function') return;
  installed = true;

  // 마커 세대 — 연속 popstate 에서 이전(스킵된) 전환의 finished 가 최신 마커를 지우지 못하게 한다.
  let markerGeneration = 0;
  let failsafeTimer: number | null = null;

  const cancelFailsafe = () => {
    if (failsafeTimer !== null) {
      window.clearTimeout(failsafeTimer);
      failsafeTimer = null;
    }
  };

  const clearMarker = (generation: number) => {
    // 더 새로운 popstate 가 마커를 재점유했으면 해제하지 않는다(그 세대의 해제 주체가 담당).
    if (generation !== markerGeneration) return;
    document.documentElement.removeAttribute(BACK_NAVIGATION_ATTRIBUTE);
    cancelFailsafe();
  };

  // next-view-transitions 는 마운트 effect 에서 popstate 리스너를 등록한다. 이 함수는
  // providers.tsx 모듈 평가 시점에 호출되므로 항상 먼저 등록되고(리스너는 등록순 실행),
  // 라이브러리 핸들러가 전환을 시작하기 전에 마커가 세팅된다.
  window.addEventListener('popstate', () => {
    markerGeneration += 1;
    document.documentElement.setAttribute(BACK_NAVIGATION_ATTRIBUTE, '');
    cancelFailsafe();
    const generation = markerGeneration;
    // 전환이 아예 시작되지 않는 예외 상황(라이브러리 미마운트 등)에서만 발화하는 안전장치 —
    // 전환이 마커를 인수하면 아래 래퍼가 즉시 취소한다.
    failsafeTimer = window.setTimeout(() => clearMarker(generation), FAILSAFE_CLEAR_MS);
  });

  // 마커 해제 시점 = 억제된 전환의 finished. 전환 객체는 라이브러리 내부에만 있으므로
  // startViewTransition 을 감싸 관찰한다(인자·반환값 그대로 — 동작 변경 없음).
  const originalStartViewTransition = document.startViewTransition.bind(document);
  document.startViewTransition = (callback) => {
    const transition = originalStartViewTransition(callback);
    if (document.documentElement.hasAttribute(BACK_NAVIGATION_ATTRIBUTE)) {
      // 전환이 마커를 인수 — failsafe 를 취소해 느린 라우트 커밋(>2s)에서도 조기 해제를 막고,
      // 해제는 이 전환의 finished(현 세대 한정)가 담당한다.
      cancelFailsafe();
      const generation = markerGeneration;
      transition.finished.catch(() => undefined).finally(() => clearMarker(generation));
    }
    return transition;
  };
}
