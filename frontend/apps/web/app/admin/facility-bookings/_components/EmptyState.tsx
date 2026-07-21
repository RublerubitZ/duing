import type { ReactNode } from 'react';

/** 빈 상태(목업 EmptyState) — 카드(ConsoleCard) 안에서 아이콘 40px·제목·본문·다음 행동 버튼으로 구성한다. */
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
    <div className="px-6 py-14 text-center">
      <p aria-hidden className="mb-3.5 text-[40px] leading-none opacity-90">
        {icon}
      </p>
      <p className="text-[15.5px] font-bold text-ink-deep">{title}</p>
      {body !== undefined && (
        <p className="mx-auto mt-2 max-w-[360px] whitespace-pre-line text-[13px] leading-relaxed text-charcoal-3">
          {body}
        </p>
      )}
      {action !== undefined && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
