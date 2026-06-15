import * as Sentry from '@sentry/nextjs';

import { scrubEvent } from './sentry-scrub';

// 서버(Node) 런타임 Sentry 초기화. NEXT_PUBLIC_SENTRY_DSN 이 비면 자동 비활성(이벤트 미전송).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'local',
  // 에러 모니터링만 — 성능 추적 비활성(데이터·오버헤드 최소화).
  tracesSampleRate: 0,
  // 요청 헤더·쿠키·IP·바디 등 PII 자동 첨부 차단(개인정보 보호).
  sendDefaultPii: false,
  // 요청 URL 쿼리스트링의 PII 제거(백엔드 beforeSend 와 동일 정책).
  beforeSend: scrubEvent,
});
