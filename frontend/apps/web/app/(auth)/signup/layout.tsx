import type { ReactNode } from 'react';
import { AuthCard } from '../_components/AuthCard';

export default function SignupLayout({ children }: { children: ReactNode }) {
  return <AuthCard>{children}</AuthCard>;
}
