import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: '운영진 콘솔 | 두잉' };

export default function ManageLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}