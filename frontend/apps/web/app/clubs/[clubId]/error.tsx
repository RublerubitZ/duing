'use client';

import { RouteErrorView } from '@/app/_components/RouteErrorView';

export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorView error={error} reset={reset} />;
}
