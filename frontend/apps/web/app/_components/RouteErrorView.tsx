'use client';

import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import { useEffect } from 'react';

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

/** 라우트 세그먼트 error.tsx 공용 본문 — 레이아웃은 살아 있으므로 앱 클래스를 쓴다. */
export function RouteErrorView({ error, reset }: Props) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="duing bg-cream mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold text-ink">잠시 문제가 생겼어요</h1>
      <p className="text-charcoal-2 mt-3 text-sm">잠시 후 다시 시도해 주세요.</p>
      <div className="mt-6 flex gap-2">
        <button type="button" onClick={() => reset()} className="btn btn-primary rounded-full px-5">
          다시 시도
        </button>
        <Link href="/" className="btn btn-secondary rounded-full px-5">
          홈으로
        </Link>
      </div>
    </div>
  );
}
