'use client';

// FAQ 아코디언 — 펼침/접힘에 height 애니메이션을 입힌 접근성 아코디언.
// 네이티브 <details> 대신 button + aria-expanded/aria-controls 로 상태를 명시한다.
// 접근성: prefers-reduced-motion 이면 전이 시간 0 으로 즉시 펼친다.

import { motion, useReducedMotion } from 'framer-motion';
import { useId, useState } from 'react';

const EASE_DUING = [0.2, 0.7, 0.2, 1] as const;

export type AccordionItemData = { question: string; answer: string };

function AccordionRow({ item, index, defaultOpen }: { item: AccordionItemData; index: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const shouldReduce = useReducedMotion();
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const buttonId = `${baseId}-button`;

  return (
    <div className="card px-5 transition hover:shadow-2 md:px-6">
      <button
        id={buttonId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full cursor-pointer items-center gap-3.5 py-4 text-left md:py-5"
      >
        <span className="shrink-0 font-mono text-[12px] font-semibold tracking-[0.12em] text-ink">
          Q.{String(index + 1).padStart(2, '0')}
        </span>
        <span className="flex-1 text-[15px] font-bold text-ink-deep">{item.question}</span>
        <span
          className={`relative grid h-7 w-7 shrink-0 place-items-center rounded-full text-paper transition-colors ${
            open ? 'bg-ink-deep' : 'bg-ink'
          }`}
          aria-hidden
        >
          <span
            className={`absolute h-[2px] w-[11px] rounded-[2px] bg-paper transition-opacity ${open ? 'opacity-0' : ''}`}
          />
          <span
            className={`absolute h-[11px] w-[2px] rounded-[2px] bg-paper transition-transform ${
              open ? 'rotate-90 opacity-0' : ''
            }`}
          />
        </span>
      </button>
      <motion.div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={shouldReduce ? { duration: 0 } : { duration: 0.32, ease: EASE_DUING }}
        className="overflow-hidden"
      >
        <div className="border-t border-dashed border-line pb-5 pt-3.5 text-[14px] leading-[1.65] text-charcoal-2">
          {item.answer}
        </div>
      </motion.div>
    </div>
  );
}

export function Accordion({ items }: { items: ReadonlyArray<AccordionItemData> }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => (
        <AccordionRow key={item.question} item={item} index={index} defaultOpen={index === 0} />
      ))}
    </div>
  );
}
