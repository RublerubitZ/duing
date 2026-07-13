import { Suspense } from 'react';

import { ClubExploreSkeleton } from './_components/ClubExploreSkeleton';
import { ClubExplorePage } from './_pages/ClubExplorePage';

export default function Page() {
  return (
    <Suspense fallback={<ClubExploreSkeleton />}>
      <ClubExplorePage />
    </Suspense>
  );
}