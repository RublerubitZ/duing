'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

// 루트 레이아웃 단계에서 발생한 렌더 에러의 최후 폴백. 이 시점엔 앱 CSS/프로바이더를 신뢰할 수 없어
// 인라인 스타일로 최소 UI 만 그리고, 에러는 Sentry 로 보고한다.
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <main
          style={{
            display: 'flex',
            minHeight: '100dvh',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <p style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em', color: '#1F4030' }}>Duing</p>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>일시적인 오류가 발생했어요</h1>
          <p style={{ color: '#666' }}>잠시 후 다시 시도해 주세요.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem 1.25rem',
              borderRadius: '0.5rem',
              border: '1px solid #ddd',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            다시 시도
          </button>
          {/* 루트 레이아웃이 깨진 뒤의 최후 폴백이라 라우터를 신뢰할 수 없다 — <Link> 의 클라이언트
              내비게이션 대신 문서를 통째로 다시 받는 <a> 로 확실히 빠져나간다. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ marginTop: '0.25rem', color: '#1F4030', textDecoration: 'underline' }}>
            홈으로
          </a>
        </main>
      </body>
    </html>
  );
}
