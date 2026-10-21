import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type Props = { children: ReactNode; className?: string } & Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'className'>;

/**
 * 콘솔 콘텐츠 카드(목업 CCard) — 라운드 16 종이 카드가 툴바·테이블·빈 상태를 감싼다.
 * 나머지 div 속성은 그대로 넘긴다 — 페이지네이션 표지(data-pagination-anchor)를 카드에 달 때 쓴다.
 */
export function ConsoleCard({ children, className = '', ...divProps }: Props) {
  return (
    <div {...divProps} className={`overflow-hidden rounded-2xl border border-line bg-paper ${className}`}>
      {children}
    </div>
  );
}
