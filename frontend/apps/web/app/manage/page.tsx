import { Suspense } from 'react';
import { OperatorMainDashboardPage } from './_pages/OperatorMainDashboardPage';

export default function ManagePage() {
  return (
    <Suspense fallback={<div className="duing min-h-screen bg-cream" />}>
      <OperatorMainDashboardPage />
    </Suspense>
  );
}
