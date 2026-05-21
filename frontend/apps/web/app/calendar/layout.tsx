import type { ReactNode } from 'react';

import { ExploreNav } from '../_components/ExploreNav';

type Props = {
  children: ReactNode;
};

export default function CalendarLayout({ children }: Props) {
  return (
    <div className="duing min-h-screen bg-cream">
      <ExploreNav />
      {children}
    </div>
  );
}
