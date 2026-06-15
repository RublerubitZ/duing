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
        </main>
      </body>
    </html>
  );
}
