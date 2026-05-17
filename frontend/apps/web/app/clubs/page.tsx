import { Suspense } from 'react';

import { ClubExplorePage } from './_pages/ClubExplorePage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ClubExplorePage />
    </Suspense>
  );
}