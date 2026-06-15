import * as Sentry from '@sentry/nextjs';

import { scrubEvent } from './sentry-scrub';

// Edge 런타임(미들웨어 등) Sentry 초기화. 서버 설정과 동일 정책.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'local',
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
});
