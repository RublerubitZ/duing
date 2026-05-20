'use client';

type Props = {
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
};

export function Pagination({ page, totalPages, onChange }: Props) {
  if (totalPages <= 1) return null;

  const windowSize = 5;
  const start = Math.max(0, Math.min(page - 2, totalPages - windowSize));
  const end = Math.min(totalPages, start + windowSize);
  const visible: number[] = [];
  for (let i = start; i < end; i++) visible.push(i);

  return (
    <nav aria-label="공지 페이지" className="flex items-center justify-center gap-1.5 mt-8">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        className="px-3 py-1.5 rounded-md text-[13px] font-semibold text-charcoal-2 disabled:text-charcoal-3 disabled:cursor-not-allowed hover:bg-graysoft"
      >이전</button>
      {visible.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-current={p === page ? 'page' : undefined}
          className={`min-w-[34px] px-2 py-1.5 rounded-md text-[13px] font-semibold ${
            p === page ? 'bg-ink text-paper' : 'text-charcoal-2 hover:bg-graysoft'
          }`}
        >{p + 1}</button>
      ))}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages - 1}
        className="px-3 py-1.5 rounded-md text-[13px] font-semibold text-charcoal-2 disabled:text-charcoal-3 disabled:cursor-not-allowed hover:bg-graysoft"
      >다음</button>
    </nav>
  );
}
