'use client';

// FAQ 아코디언 — 펼침/접힘에 grid-rows 전환을 입힌 접근성 아코디언.
// 네이티브 <details> 대신 button + aria-expanded/aria-controls 로 상태를 명시한다.
// 펼침은 JS 프레임 루프(framer height 애니메이션) 대신 CSS grid-template-rows 0fr↔1fr 전환 —
// 컴포지터 친화적이진 않지만 메인 스레드 JS 비용이 없고 framer 번들 의존이 빠진다.
// 접근성: motion-reduce 면 전이 없이 즉시 펼친다.

import { useId, useState } from 'react';

export type AccordionItemData = { question: string; answer: string };

function AccordionRow({ item, index, defaultOpen }: { item: AccordionItemData; index: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
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
        <span className="shrink-0 tabular-nums text-[12px] font-semibold tracking-[0.12em] text-ink">
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
      <div
        id={panelId}
        // 닫힌 패널은 시각적으로만 접히는 게 아니라 포커스·스크린리더에서도 빠지도록 inert + aria-hidden.
        // FAQ 스케일에서 role="region" 랜드마크는 과도하므로 두지 않는다.
        aria-hidden={!open}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-200 ease-duing motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pb-5 pt-3.5 text-[14px] leading-[1.65] text-charcoal-2">
            {item.answer}
          </div>
        </div>
      </div>
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
