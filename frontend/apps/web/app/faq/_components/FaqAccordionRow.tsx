'use client';

// FAQ 아코디언 행 — 실제 화면(FaqPage)과 서버 기본 목록(FaqPageFallback)이 같은 행을 쓴다. pinned 뱃지·카테고리 캡션이
// 필요해 자체 렌더한다. 서버 컴포넌트가 그리므로 props 는 직렬화 가능한 값만 둔다(함수 prop 은 RSC 렌더가 throw 한다).
// 서버 기본 목록은 피드백 위젯을 뺀다(withFeedback=false) — 접힌 패널 안이라 높이에 영향이 없고, 위젯의 useToast 는
// 프로바이더 밖이면 throw 한다.

import { useId, useState } from 'react';

import { cn } from '@/app/_lib/cn';
import { FaqFeedback } from './FaqFeedback';

import type { FederationFaqItem } from '@duing/types';

type Props = {
  faq: FederationFaqItem;
  index: number;
  withFeedback?: boolean;
};

export function FaqAccordionRow({ faq, index, withFeedback = true }: Props) {
  const [open, setOpen] = useState(false);
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
        <span className="flex-1">
          <span className="flex flex-wrap items-center gap-2">
            {faq.pinned && (
              <span className="rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-bold text-paper">
                고정
              </span>
            )}
            <span className="text-[15px] font-bold text-ink-deep">{faq.question}</span>
          </span>
          {faq.categoryName && (
            <span className="mt-1 block text-[12px] text-charcoal-3">{faq.categoryName}</span>
          )}
        </span>
        <span
          className={cn(
            'relative grid h-7 w-7 shrink-0 place-items-center rounded-full text-paper transition-colors',
            open ? 'bg-ink-deep' : 'bg-ink',
          )}
          aria-hidden
        >
          <span
            className={cn(
              'absolute h-[2px] w-[11px] rounded-[2px] bg-paper transition-opacity',
              open && 'opacity-0',
            )}
          />
          <span
            className={cn(
              'absolute h-[11px] w-[2px] rounded-[2px] bg-paper transition-transform',
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
          <div className="pb-5 pt-3.5">
            <p className="whitespace-pre-line text-[14px] leading-[1.65] text-charcoal-2">
              {faq.answer}
            </p>
            {withFeedback && <FaqFeedback faqId={faq.id} />}
          </div>
        </div>
      </div>
    </div>
  );
}
