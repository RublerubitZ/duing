// 뒤로/앞으로(popstate) 내비게이션에서만 View Transition 애니메이션을 무효화하는 마커를 관리한다.
// iOS 스와이프 백은 네이티브 스냅샷 슬라이드를 이미 그리므로, next-view-transitions 가 popstate 에
// 무조건 실행하는 웹 크로스페이드가 겹치면 이중 전환으로 보인다(라이브러리에 비활성 옵션 없음).
// 마커가 있는 동안 시작된 전환은 globals.css 규칙으로 애니메이션 없이 즉시 완료된다.

import { isOverlayOnlyTraversal } from './backDismiss';

const BACK_NAVIGATION_ATTRIBUTE = 'data-back-navigation';
// popstate 후 전환이 시작되지 않는 예외 상황(해시 전용 이동 등)에서도 마커가 남지 않게 하는 안전장치.
const FAILSAFE_CLEAR_MS = 2000;

let installed = false;

/**
 * 뒤로·앞으로 가기(popstate)로 화면이 그려지는 중인지 — 마커가 서 있는 동안 참이다.
 * 화면 본문 등장 연출(useEntranceMotion)이 마운트 때 읽어, 돌아온 화면에는 연출을 붙이지 않는다.
 * 서버 렌더(문서 없음)에서는 거짓이다.
 */
export function isBackNavigationPending(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.documentElement.hasAttribute(BACK_NAVIGATION_ATTRIBUTE)
  );
}

export function installBackNavigationViewTransitionGuard() {
  if (installed) return;
  if (typeof window === 'undefined') return;
  // 미지원 브라우저는 라이브러리도 전환을 실행하지 않으므로 설치 자체가 불필요하다.
  if (typeof document.startViewTransition !== 'function') return;
  installed = true;

  // 마커 세대 — 연속 popstate 에서 이전(스킵된) 전환의 finished 가 최신 마커를 지우지 못하게 한다.
  let markerGeneration = 0;
  let failsafeTimer: number | null = null;
  // 마커를 인수해 finished 를 기다리는 전환 수 — 죽은 엔트리 스킵의 두 번째 hop 처럼 앞선 popstate 의
  // 전환이 진행 중일 때 뒤따르는 오버레이 분기가 마커를 내리면 그 전환의 억제가 풀린다.
  let markerHolders = 0;

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

  // 마커를 인수한 전환의 DOM 업데이트를 바깥에서 끝내는 자리. next-view-transitions 는 popstate 마다 전환 상태를 새것으로
  // 갈아 끼워, 앞 전환이 기다리는 업데이트 프라미스를 영영 resolve 하지 않는다. 죽은 엔트리 스킵처럼 첫 hop 의 실제 전환
  // 직후 두 번째 popstate 가 오면, 그 전환이 4초 DOM 업데이트 시한까지 화면을 옛 스냅샷에 묶었다가 TimeoutError 로 끝난다.
  // finished 도 정산되지 않아 보유 수가 줄지 않는다. 그래서 다음 호출이 이 함수로 앞 전환의 업데이트를 넘겨받아 끝낸다.
  let settlePendingUpdate: ((updateDone: Promise<unknown>) => void) | null = null;

  const withSettleableUpdate = (callback: ViewTransitionUpdateCallback | StartViewTransitionOptions | undefined) => {
    let settle: (updateDone: Promise<unknown>) => void = () => undefined;
    const settled = new Promise<unknown>((resolve) => {
      settle = resolve;
    });
    settlePendingUpdate = settle;
    const settleable = (update: ViewTransitionUpdateCallback | null | undefined) => () =>
      Promise.race([Promise.resolve(update?.()), settled]).finally(() => {
        if (settlePendingUpdate === settle) settlePendingUpdate = null;
      });
    return typeof callback === 'function' ? settleable(callback) : { ...callback, update: settleable(callback?.update) };
  };

  // 마커 해제 시점 = 억제된 전환의 finished. 전환 객체는 라이브러리 내부에만 있으므로
  // startViewTransition 을 감싸 관찰한다(반환값 그대로, 마커를 인수하는 전환만 업데이트를 위 자리로 끝낼 수 있게 감싼다).
  const originalStartViewTransition = document.startViewTransition.bind(document);
  document.startViewTransition = (callback) => {
    // 오버레이만 닫는 뒤로가기(URL 동일)에는 전환을 시작하지 않는다.
    // next-view-transitions 는 popstate 마다 전환을 시작하지만 DOM 업데이트 프라미스를
    // pathname/hash 변경 effect 에서만 resolve 하므로, 같은 URL 이면 전환이 끝나지 않는다.
    // 그 결과 화면이 옛 스냅샷에 묶였다가 4초 뒤 TimeoutError(Transition was aborted…)로 중단된다.
    if (isOverlayOnlyTraversal()) {
      // 콜백은 그대로 실행해 라이브러리의 "전환 시작됨" 대기를 풀어 준다. 콜백이 돌려주는
      // 프라미스(라이브러리가 pathname 변경 때 resolve)는 기다리지 않는다 — 그게 멈춤의 원인이다.
      const update = typeof callback === 'function' ? callback : callback?.update;
      const updateDone = Promise.resolve(update?.());
      updateDone.catch(() => undefined);
      // 앞선 실제 전환(죽은 엔트리 스킵의 첫 hop)이 업데이트를 기다리면, 그 끝을 이 hop 프라미스에 묶는다 — 라이브러리가 그
      // 전환의 프라미스를 이 hop 것으로 갈아 끼웠고, 이 hop 프라미스가 그 이동의 커밋(pathname 변경)에서 resolve 된다.
      settlePendingUpdate?.(updateDone);
      // 이 분기는 전환을 시작하지 않는다. 시트·라이트박스·모달을 닫는 한 번짜리 뒤로 가기에서는 마커가 할 일이 없으니
      // 바로 내린다(안전장치 타이머도 함께 취소). 남겨 두면 2초 안에 이어지는 앞으로 전환(카드 → 상세)이 마커를
      // "뒤로 가기"로 인수해 애니메이션(로고 모핑 포함)이 꺼지고, 그 화면의 등장 연출도 빠진다 — 닫고 바로 카드를 누르는 흔한 경로다.
      // 앞선 전환이 마커를 들고 있으면 내리지 않는다. 죽은 엔트리 스킵의 두 번째 hop(같은 URL 착지)이 그 경우로, 여기서
      // 내리면 첫 hop 의 실제 페이지 전환이 억제를 잃어 크로스페이드가 재생된다. 그때는 그 전환이 끝날 때 함께 내린다(아래 finally).
      if (markerHolders === 0) clearMarker(markerGeneration);
      const settled = Promise.resolve();
      return {
        ready: settled,
        finished: settled,
        updateCallbackDone: settled,
        // 전역 ViewTransitionTypeSet 생성자에 기대지 않는다(런타임 존재 보장 없음).
        // 표준 Set 이 같은 형태를 만족하고, 소비처도 이 스텁의 types 를 읽지 않는다.
        types: new Set<string>(),
        skipTransition: () => undefined,
      };
    }

    // 새 실제 전환은 앞 전환을 건너뛰게 한다(브라우저 규칙) — 앞 전환의 업데이트를 바로 끝내 그 finished 가 정산되게 한다.
    settlePendingUpdate?.(Promise.resolve());
    const holdsMarker = document.documentElement.hasAttribute(BACK_NAVIGATION_ATTRIBUTE);
    const transition = originalStartViewTransition(holdsMarker ? withSettleableUpdate(callback) : callback);
    if (holdsMarker) {
      // 전환이 마커를 인수 — failsafe 를 취소해 느린 라우트 커밋(>2s)에서도 조기 해제를 막고,
      // 해제는 이 전환의 finished(현 세대 한정)가 담당한다.
      cancelFailsafe();
      const generation = markerGeneration;
      markerHolders += 1;
      transition.finished
        .catch(() => undefined)
        .finally(() => {
          markerHolders -= 1;
          // 마지막 보유 전환이 끝나면 현 세대까지 내린다 — 그 사이 세대를 올린 popstate 는 오버레이 hop 뿐이다(실제 전환이었다면
          // 라이브러리가 popstate 리스너 안에서 startViewTransition 을 동기로 불러 보유 수가 이미 올라가 있다). 자기 세대만 내리면
          // 오버레이 hop 세대의 안전장치(2초)까지 마커가 남아, 그 사이 앞으로 이동이 뒤로 가기로 읽힌다.
          clearMarker(markerHolders === 0 ? markerGeneration : generation);
        });
    }
    return transition;
  };
}
