'use client';

import { RouteErrorView } from '@/app/_components/RouteErrorView';

// 인터셉트 상세의 오류 경계 — 없으면 global-error 로 떨어진다. [clubId]/error.tsx 와 같은 동작이다.
export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorView error={error} reset={reset} />;
}
