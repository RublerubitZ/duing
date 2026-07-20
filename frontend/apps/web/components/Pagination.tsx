'use client';

type Props = {
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
  ariaLabel?: string;
  /** 둘 다 지정하면 좌측에 "1–20 / 42건" 범위를 표기한다. 총계가 부정확한 병합 목록 등에선 생략. */
  totalElements?: number;
  pageSize?: number;
};

export function Pagination({ page, totalPages, onChange, ariaLabel = '페이지', totalElements, pageSize }: Props) {
  if (totalPages <= 1) return null;

  const windowSize = 5;
  const start = Math.max(0, Math.min(page - 2, totalPages - windowSize));
  const end = Math.min(totalPages, start + windowSize);
  const visible: number[] = [];
  for (let i = start; i < end; i++) visible.push(i);

  const showRange = totalElements !== undefined && pageSize !== undefined && totalElements > 0;

  return (
    <nav aria-label={ariaLabel} className="flex items-center justify-center gap-1.5 mt-8">
      {showRange && (
        <span className="mr-1.5 text-xs tabular-nums text-charcoal-3">
          {page * pageSize + 1}–{Math.min(totalElements, (page + 1) * pageSize)} / {totalElements}건
        </span>
      )}
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
