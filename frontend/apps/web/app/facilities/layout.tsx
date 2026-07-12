import type { ReactNode } from 'react';

import { ExploreNav } from '../_components/ExploreNav';

export default function FacilitiesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="duing min-h-dvh bg-cream">
      <ExploreNav slimOnMobile />
      {children}
    </div>
  );
}
