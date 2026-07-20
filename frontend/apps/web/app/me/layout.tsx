import type { ReactNode } from 'react';

import { MeAuthGuard } from './_components/MeAuthGuard';

export default function MeLayout({ children }: { children: ReactNode }) {
  return <MeAuthGuard>{children}</MeAuthGuard>;
}
