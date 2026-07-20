import type { ReactNode } from 'react';

/** 빈 상태 공용 패턴(개편 스펙 §9) — 아이콘+제목+본문+다음 행동 버튼으로 막다른 화면을 없앤다. */
export function EmptyState({
  icon = '📭',
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-paper px-6 py-12 text-center">
      <p aria-hidden className="text-3xl">
        {icon}
      </p>
      <p className="mt-3 text-sm font-medium text-ink-deep">{title}</p>
      {body !== undefined && (
        <p className="mx-auto mt-1.5 max-w-xs whitespace-pre-line text-xs leading-relaxed text-charcoal-3">{body}</p>
      )}
      {action !== undefined && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
