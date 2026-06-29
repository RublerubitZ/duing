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
  // next-view-transitions(View Transitions API)가 문서 비활성 상태(백그라운드 탭·bfcache 복원·
  // 중단된 연속 이동)에서 startViewTransition 프로미스를 reject 하며 내는 무해한 unhandled rejection.
  // 페이지 이동은 정상이고 시각 전환만 스킵되며 사용자 영향 0(Sentry NEXT-DUING-4) → 운영 노이즈만 끈다.
  // 이 메시지에만 최소 범위로 매칭하고, 다른 InvalidStateError 는 그대로 수집한다.
  ignoreErrors: ['Transition was aborted because of invalid state'],
  // 요청 URL·브레드크럼(fetch/xhr/navigation)의 쿼리스트링 PII 제거.
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});

// App Router 네비게이션 계측 훅(추적 비활성 시 no-op).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
