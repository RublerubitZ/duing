import Link from 'next/link';
import { ArrowRight } from '@/components/duing/Icon';
import { recruitmentTickers } from '../../_mocks';

export function RecruitmentTicker() {
  return (
    <section className="relative mt-16 overflow-hidden bg-ink-deep py-5 text-white">
      <div className="max-w-layout mx-auto flex items-center gap-6 px-10">
        <div
          className="flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold tracking-wide04 text-sage"
          style={{ background: 'rgba(157,182,160,0.18)' }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          이번 주 마감
        </div>
        <div className="flex flex-1 gap-8 overflow-hidden text-sm font-medium">
          {recruitmentTickers.map((item) => (
            <span key={item.name} className="flex shrink-0 items-center gap-2.5">
              <span className="text-white/65">{item.name}</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11.5px] font-bold text-sage">
                {item.dDay}
              </span>
            </span>
          ))}
        </div>
        <Link
          href="/clubs?recruiting=true"
          className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-white hover:text-sage"
        >
          전체 보기 <ArrowRight />
        </Link>
      </div>
    </section>
  );
}
