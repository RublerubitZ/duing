import type { ReactNode } from 'react';
import { ExploreNav } from '../_components/ExploreNav';

export default function CalendarLayout({ children }: { children: ReactNode }) {
  return (
    <div className="duing min-h-screen bg-cream">
      <ExploreNav />
      {children}
    </div>
  );
}
