import type { ReactNode } from 'react';
import { LoadingGate } from '@/components/loading/LoadingGate';

type DashboardCardProps = {
  title: string;
  badge?: ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyText?: string;
  children?: ReactNode;
  footer?: ReactNode;
};

export function DashboardCard({ title, badge, isLoading, isEmpty, emptyText, children, footer }: DashboardCardProps) {
  return (
    <section className="card p-4 transition hover:shadow-2">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-charcoal">{title}</h2>
        {badge}
      </header>
      {isLoading ? (
        <LoadingGate className="min-h-0 py-6" />
      ) : isEmpty ? (
        <p className="rounded-md bg-graysoft py-6 text-center text-sm text-charcoal-3">{emptyText ?? ''}</p>
      ) : (
        children
      )}
      {!isLoading && !isEmpty && footer ? <div className="mt-3">{footer}</div> : null}
    </section>
  );
}
