import type { ReactNode } from 'react';
<<<<<<< HEAD

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
=======
import { AuthCard } from './_components/AuthCard';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthCard>{children}</AuthCard>;
>>>>>>> origin/main
}
