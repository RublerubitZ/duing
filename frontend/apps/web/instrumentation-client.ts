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
  // timeout(라우트 전환 중 DOM 업데이트가 브라우저 제한 약 4초를 넘김, Sentry NEXT-DUING-9).
  // timeout 은 동적 라우트 loading.tsx 배치(2026-07 네트워크 내성 작업, PR-B)로 정상 회선의
  // 발생 경로는 해소됐고, 완전 오프라인·극단 저속 회선의 잔존 케이스만 남아 가드를 유지한다.
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

// PostHog 클라이언트 초기화 — Sentry 아래 별도로 둔다.
import posthog from 'posthog-js';

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (!posthogKey) {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error(
      'NEXT_PUBLIC_POSTHOG_KEY variable required by PostHog is missing or un-configured, ' +
        'this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_KEY is configured',
    );
  }
} else {
  posthog.init(posthogKey, {
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    defaults: '2026-01-30',
    // 예외 모니터링은 Sentry 전담(소스맵 업로드까지 구축) — 중복 캡처와 예외 메시지 경유 PII 유입을 막는다.
    capture_exceptions: false,
    // 세션 리코딩 금지 — 위 Sentry 세션 리플레이와 같은 이유다. 입력 필드만 가려지고 화면에 렌더된
    // 텍스트(조회된 원본 전화번호·지원자 연락처·이름/학번/학과)는 그대로 녹화돼, 조회마다 감사 기록을
    // 남기도록 만든 통제를 통째로 우회한다.
    // 이 플래그는 대시보드 토글과 AND 로 묶인다(SDK: server_side_enabled && !disable_session_recording).
    // 원격으로 켜도 배포된 코드가 이 값을 들고 있는 한 레코더 스크립트조차 내려받지 않는다.
    disable_session_recording: true,
    debug: process.env.NODE_ENV === 'development',
  });
}
