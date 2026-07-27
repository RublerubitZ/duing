import type { ReactNode } from 'react';

/** 콘솔 콘텐츠 카드(목업 CCard) — 라운드 16 종이 카드가 툴바·테이블·빈 상태를 감싼다. */
export function ConsoleCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-2xl border border-line bg-paper ${className}`}>{children}</div>;
}
