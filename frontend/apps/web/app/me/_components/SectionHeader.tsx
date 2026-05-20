import type { ReactNode } from 'react';

type Props = {
  title: string;
  hint?: string;
  extra?: ReactNode;
};

export function SectionHeader({ title, hint, extra }: Props) {
  return (
    <div
      data-section-title=""
      className="flex items-end justify-between mb-5 gap-4 flex-wrap"
    >
      <div>
        <h2 className="text-[22px] font-body text-ink-deep">{title}</h2>
        {hint && <p className="text-[12.5px] text-charcoal-3 mt-1.5">{hint}</p>}
      </div>
      {extra}
    </div>
  );
}
