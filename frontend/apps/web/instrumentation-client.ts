import * as Sentry from '@sentry/nextjs';

import { scrubBreadcrumb, scrubEvent } from './sentry-scrub';

// 클라이언트(브라우저) 런타임 Sentry 초기화. NEXT_PUBLIC_SENTRY_DSN 이 비면 자동 비활성.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'local',
  // 에러 모니터링만 — 성능 추적 비활성.
  // 세션 리플레이는 학생 PII(이름·학번·이메일)가 담긴 화면을 그대로 캡처하므로 절대 추가하지 않는다.
  tracesSampleRate: 0,
  // 요청/사용자 PII 자동 첨부 차단(개인정보 보호).
  sendDefaultPii: false,
  // next-view-transitions(View Transitions API)가 내는 무해한 unhandled rejection 2종 —
  // invalid state(백그라운드 탭·bfcache 복원·중단된 연속 이동, Sentry NEXT-DUING-4)와
  // timeout(라우트 전환 중 DOM 업데이트가 브라우저 제한 약 4초를 넘김 — 느린 네트워크·dev 온디맨드
  // 컴파일, Sentry NEXT-DUING-9).
  // 둘 다 페이지 이동은 정상이고 시각 전환만 스킵되며 사용자 영향 0 → 운영 노이즈만 끈다.
  // 이 두 메시지에만 최소 범위로 매칭하고, 다른 InvalidStateError/TimeoutError 는 그대로 수집한다.
  ignoreErrors: [
    'Transition was aborted because of invalid state',
    'Transition was aborted because of timeout in DOM update',
  ],
  // 요청 URL·브레드크럼(fetch/xhr/navigation)의 쿼리스트링 PII 제거.
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});

// 위 ignoreErrors 는 Sentry 전송만 거를 뿐 브라우저 콘솔의 "Uncaught (in promise)" 노이즈는 남는다.
// next-view-transitions(0.3.5 가 최신)가 잡지 않고 흘리는 View Transition abort rejection 에만
// 기본 동작(콘솔 출력)을 막는다 — preventDefault 는 다른 리스너(Sentry 포함)에 영향이 없고,
// 조건 밖의 모든 rejection 은 평소처럼 노출된다.
window.addEventListener('unhandledrejection', (event) => {
  const reason: unknown = event.reason;
  const isViewTransitionAbort =
    reason instanceof DOMException &&
    (reason.name === 'InvalidStateError' || reason.name === 'TimeoutError') &&
    reason.message.includes('Transition was aborted');
  if (isViewTransitionAbort) event.preventDefault();
});

// App Router 네비게이션 계측 훅(추적 비활성 시 no-op).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
