import type { ReactNode } from 'react';
import { ExploreNav } from '../_components/ExploreNav';

export default function ClubsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="duing min-h-dvh bg-cream">
      <ExploreNav />
      {children}
    </div>
  );
}
