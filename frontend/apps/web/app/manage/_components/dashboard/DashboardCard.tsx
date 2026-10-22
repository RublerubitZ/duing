import type { ReactNode } from 'react';
import { LoadingGate } from '@/components/loading/LoadingGate';

type DashboardCardProps = {
  title: string;
  badge?: ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  emptyText?: string;
  children?: ReactNode;
  footer?: ReactNode;
};

export function DashboardCard({ title, badge, isLoading, isError, isEmpty, emptyText, children, footer }: DashboardCardProps) {
  // 조회 실패로 비었으면 "없어요"·건수 배지가 사실처럼 보이지 않게 오류 안내만 남긴다
  const isFailedEmpty = !isLoading && isError && isEmpty;

  return (
    <section className="card p-4 transition hover:shadow-2">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-charcoal">{title}</h2>
        {isFailedEmpty ? null : badge}
      </header>
      {isLoading ? (
        <LoadingGate className="min-h-0 py-6" />
      ) : isFailedEmpty ? (
        <p role="alert" className="rounded-md bg-graysoft py-6 text-center text-sm text-charcoal-2">
          불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      ) : isEmpty ? (
        <p className="rounded-md bg-graysoft py-6 text-center text-sm text-charcoal-3">{emptyText ?? ''}</p>
      ) : (
        <>
          {children}
          {/* 일부 조회·재조회만 실패했으면 받은 내용은 두고, 오래됐거나 빠졌을 수 있다고만 알린다 */}
          {isError ? <p className="mt-2 text-xs text-charcoal-3">일부 정보를 불러오지 못했어요.</p> : null}
        </>
      )}
      {!isLoading && !isEmpty && footer ? <div className="mt-3">{footer}</div> : null}
    </section>
  );
}
