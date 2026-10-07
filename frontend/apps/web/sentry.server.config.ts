import * as Sentry from '@sentry/nextjs';

import { scrubBreadcrumb, scrubEvent } from './sentry-scrub';

// 서버(Node) 런타임 Sentry 초기화. NEXT_PUBLIC_SENTRY_DSN 이 비면 자동 비활성(이벤트 미전송).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'local',
  // 에러 모니터링만 — 성능 추적 비활성(데이터·오버헤드 최소화).
  tracesSampleRate: 0,
  // IP 등 PII 자동 첨부 차단. 요청 헤더·쿠키·본문은 이 설정으로도 오류 이벤트에 실려 beforeSend(scrubEvent)가 지운다.
  sendDefaultPii: false,
  // 요청 URL 쿼리스트링의 PII 제거(백엔드 beforeSend 와 동일 정책)와 자격 증명 헤더·쿠키·본문 가림.
  beforeSend: scrubEvent,
  // 외부 호출(http) 브레드크럼의 쿼리 값 제거 — 서버에서 사용자 입력 쿼리로 호출하는 경로가 생겨도 새지 않게.
  beforeBreadcrumb: scrubBreadcrumb,
});
