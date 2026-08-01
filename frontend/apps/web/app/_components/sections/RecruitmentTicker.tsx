import Link from 'next/link';

import { ArrowRight } from '@/components/duing/Icon';
import { cn } from '@/app/_lib/cn';
import { fetchUpcomingDeadlineClubs } from '@/app/_lib/home-data';
import {
  selectClosingSoonClubs,
  type ClosingSoonEmphasis,
  type ClosingSoonItem,
} from '@/app/_lib/closingSoon';

// 다크 배경(bg-ink-deep) 위에서 읽히는 강조 토큰. 위험=coral, 경고=warm(골드), 기본=sage.
const CHIP_EMPHASIS: Record<ClosingSoonEmphasis, string> = {
  danger: 'bg-coral/20 text-coral',
  warning: 'bg-warm/20 text-warm',
  default: 'bg-white/10 text-sage',
};

function TickerChip({ item, duplicate = false }: { item: ClosingSoonItem; duplicate?: boolean }) {
  return (
    <span
      className={cn('mr-8 flex shrink-0 items-center gap-2.5', duplicate && 'motion-reduce:hidden')}
      aria-hidden={duplicate || undefined}
    >
      <span className="text-white/65">{item.name}</span>
      <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-bold', CHIP_EMPHASIS[item.emphasis])}>
        {item.label}
      </span>
    </span>
  );
}

export async function RecruitmentTicker() {
  // 마감 임박순 모집중 동아리를 넉넉히 받아 D-7 윈도우가 잘리지 않게 한다.
  const clubs = await fetchUpcomingDeadlineClubs(40);
  const items = selectClosingSoonClubs(clubs, new Date());
  if (items.length === 0) return null;

  // 항목 수에 비례한 길이(개당 약 2.6s, 최소 12s)로 개수와 무관하게 일정한 속도를 유지한다.
  const durationSeconds = Math.max(12, Math.round(items.length * 2.6));

  return (
    <section className="relative mt-7 overflow-hidden bg-ink-deep py-5 text-white sm:mt-14">
      <div className="max-w-layout mx-auto flex items-center gap-6 px-4 sm:px-6 md:px-10">
        <div
          className="flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold tracking-wide04 text-sage"
          style={{ background: 'rgba(157,182,160,0.18)' }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          마감 임박
        </div>

        {/* 오른쪽→왼쪽 seamless 무한 티커. hover 시 정지(CSS), reduced-motion 시 정지 + 가로 스크롤 폴백. */}
        <div className="group flex-1 overflow-hidden motion-reduce:overflow-x-auto">
          <div
            className="flex w-max text-sm font-medium animate-marquee group-hover:[animation-play-state:paused] motion-reduce:animate-none"
            style={{ animationDuration: `${durationSeconds}s` }}
          >
            {items.map((item) => (
              <TickerChip key={item.id} item={item} />
            ))}
            {/* seamless 루프용 복제 — 스크린리더 중복 방지(aria-hidden), reduced-motion 에선 숨김. */}
            {items.map((item) => (
              <TickerChip key={`dup-${item.id}`} item={item} duplicate />
            ))}
          </div>
        </div>

        <Link
          href="/clubs?recruitmentStatus=AVAILABLE"
          className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-white hover:text-sage"
        >
          전체 보기 <ArrowRight />
        </Link>
      </div>
    </section>
  );
}
