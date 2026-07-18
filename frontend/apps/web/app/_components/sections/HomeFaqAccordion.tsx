'use client';

// 홈 "자주 묻는 질문" 섹션용 얇은 자체 아코디언 — 승격된 Accordion(components/Accordion.tsx)과
// 접근성 구조(button + aria-expanded/aria-controls)는 같지만, 펼침 영역에 답변 요약(line-clamp)과
// "자세히 보기" 딥링크가 필요해 별도로 구현한다. 모든 항목은 접힌 상태로 시작한다.

import Link from 'next/link';
import { useId, useState } from 'react';

import type { FederationFaqItem } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';

function HomeFaqAccordionRow({ faq }: { faq: FederationFaqItem }) {
  const [open, setOpen] = useState(false);
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const buttonId = `${baseId}-button`;

  return (
    <div className="card px-5 transition hover:shadow-2">
      <button
        id={buttonId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full cursor-pointer items-center gap-3 py-4 text-left"
      >
        <span className="flex-1 text-[14.5px] font-bold text-ink-deep">{faq.question}</span>
        <span
          className={cn(
            'relative grid h-6 w-6 shrink-0 place-items-center rounded-full text-paper transition-colors',
            open ? 'bg-ink-deep' : 'bg-ink',
          )}
          aria-hidden
        >
          <span
            className={cn(
              'absolute h-[2px] w-[10px] rounded-[2px] bg-paper transition-opacity',
              open && 'opacity-0',
            )}
          />
          <span
            className={cn(
              'absolute h-[10px] w-[2px] rounded-[2px] bg-paper transition-transform',
              open && 'rotate-90 opacity-0',
            )}
          />
        </span>
      </button>
      <div
        id={panelId}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-duing motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-dashed border-line pb-4 pt-3">
            <p className="line-clamp-3 text-[13.5px] leading-[1.6] text-charcoal-2">{faq.answer}</p>
            <Link
              href={toRoute(`/faq?item=${faq.id}`)}
              className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-ink"
            >
              자세히 보기 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomeFaqAccordion({ items }: { items: ReadonlyArray<FederationFaqItem> }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {items.map((faq) => (
        <HomeFaqAccordionRow key={faq.id} faq={faq} />
      ))}
    </div>
  );
}
