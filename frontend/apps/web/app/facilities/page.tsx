import { Suspense } from 'react';

import { FacilityExplorePage } from './_pages/FacilityExplorePage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <FacilityExplorePage />
    </Suspense>
  );
}
