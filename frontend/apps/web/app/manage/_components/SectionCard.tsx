import type { ReactNode } from 'react';

type SectionCardProps = { number: number; title: string; description?: string; children: ReactNode };

/** 목업의 번호 배지 카드 (§6.1). 배지·제목 행 + 32px 들여쓴 본문. */
export function SectionCard({ number, title, description, children }: SectionCardProps) {
  return (
    <section className="mb-4 rounded-[18px] border border-line bg-white p-[22px]">
      <div className={`flex items-baseline gap-2.5 ${description ? 'mb-1' : 'mb-4'}`}>
        <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-sage-mist tabular-nums text-[12px] font-extrabold text-ink-deep">
          {number}
        </span>
        <h3 className="text-[16px] font-bold text-ink-deep">{title}</h3>
      </div>
      {description && <p className="mb-4 ml-8 text-[12.5px] leading-relaxed text-charcoal-3">{description}</p>}
      <div className="ml-0 sm:ml-8">{children}</div>
    </section>
  );
}
