import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// 서버 컴포넌트·미들웨어·라우트 핸들러에서 발생한 에러를 Sentry 로 캡처한다.
export const onRequestError = Sentry.captureRequestError;
