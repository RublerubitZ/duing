// 모바일 전용 '한눈에 보기' — 일시/장소/주최/대상을 라벨+값 가로 행(점선)으로 가볍게 보여준다.
// 데스크탑은 우측 사이드바의 NoticeEventCard(dark 카드)를 쓴다. 본문 위(포스터/요약 다음)에 배치한다.

import type { NoticeEventInfo } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { buildEventRows } from '../_lib/eventFormat';

type Props = {
  eventInfo: NoticeEventInfo;
  className?: string;
};

export function NoticeEventSummary({ eventInfo, className }: Props) {
  const rows = buildEventRows(eventInfo);

  return (
    <section className={cn('rounded-2xl border border-line bg-paper p-5', className)} aria-label="한눈에 보기">
      <div className="mb-2.5 text-[12px] font-bold tracking-[0.08em] text-ink">한눈에 보기</div>
      <dl>
        {rows.map((row) => (
          <div key={row.label} className="flex gap-3 border-b border-dashed border-line py-2.5 last:border-0">
            <dt className="w-12 shrink-0 text-[12.5px] text-charcoal-3">{row.label}</dt>
            <dd className="min-w-0 flex-1 text-[13.5px] font-semibold text-charcoal">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
