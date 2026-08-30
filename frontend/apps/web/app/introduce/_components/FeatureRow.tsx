import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { Reveal } from './motion/Reveal';

function CheckList({ items }: { items: ReadonlyArray<string> }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-[14px] text-charcoal-2">
          <span className="mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-sm bg-ink text-paper">
            <Check size={11} strokeWidth={2.5} aria-hidden />
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

export type FeatureRowProps = {
  index: string;
  label: string;
  title: ReactNode;
  desc: string;
  items: ReadonlyArray<string>;
  visual: ReactNode;
  /** true 면 비주얼을 왼쪽으로(데스크탑) 배치해 좌우 교차 */
  reverse?: boolean;
};

/** Apple product-page 식 좌우 교차 기능 블록 — 텍스트와 비주얼이 반대편에서 슬라이드 진입. */
export function FeatureRow({ index, label, title, desc, items, visual, reverse }: FeatureRowProps) {
  return (
    <div className="grid items-center gap-10 py-12 md:grid-cols-2 md:gap-16 md:py-16">
      <Reveal x={reverse ? 40 : -40} y={0} className={reverse ? 'md:order-2' : undefined}>
        <p className="mb-3.5 tabular-nums text-[11.5px] font-semibold uppercase tracking-[0.2em] text-ink">
          {index} · {label}
        </p>
        <h3 className="mb-4" style={{ fontSize: 'clamp(26px, 3.2vw, 36px)' }}>
          {title}
        </h3>
        <p className="mb-6 text-[15.5px] leading-[1.6] text-charcoal-2">{desc}</p>
        <CheckList items={items} />
      </Reveal>
      <Reveal x={reverse ? -40 : 40} y={0} delay={0.08} className={reverse ? 'md:order-1' : undefined}>
        {visual}
      </Reveal>
    </div>
  );
}
