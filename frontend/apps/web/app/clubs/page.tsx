import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ClubExploreSkeleton } from './_components/ClubExploreSkeleton';
import { ClubExplorePage } from './_pages/ClubExplorePage';

export const metadata: Metadata = { title: '동아리 탐색 | 두잉' };

export default function Page() {
  return (
    <Suspense fallback={<ClubExploreSkeleton />}>
      <ClubExplorePage />
    </Suspense>
  );
}