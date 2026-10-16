import type { ReactNode } from 'react';
import { ExploreNav } from '../_components/ExploreNav';

export default function ClubsLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <div className="duing min-h-dvh bg-cream">
      <ExploreNav slimOnMobile />
      {children}
      {modal}
    </div>
  );
}
