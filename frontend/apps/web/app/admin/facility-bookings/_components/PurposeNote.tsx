import type { ReactNode } from 'react';

/** 화면 목적 1줄 안내(개편 스펙 §1) — 매일 쓰는 콘솔이라 목업의 3줄 배너 대신 컴팩트를 유지한다. */
export function PurposeNote({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-sage/10 px-3 py-2 text-xs leading-relaxed text-ink-deep">{children}</p>;
}
