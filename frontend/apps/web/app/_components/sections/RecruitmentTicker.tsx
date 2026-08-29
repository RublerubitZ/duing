import Link from 'next/link';

import { ChevronRight } from 'lucide-react';
import { Siren } from '@/components/duing/Icon';
import { cn } from '@/app/_lib/cn';
import { fetchUpcomingDeadlineClubs } from '@/app/_lib/home-data';
import { RECRUITING_CLUBS_HREF } from '@/app/_lib/exploreLinks';
import {
  selectClosingSoonClubs,
  type ClosingSoonEmphasis,
  type ClosingSoonItem,
} from '@/app/_lib/closingSoon';

// 시안(509:7790)의 칩은 밝은 회색 면(Gray/004 #E1E1E1) 위 딥그린 글자 하나뿐이라, 긴급도는 면 색으로만 가른다.
// 글자는 셋 다 딥그린 — warm 7.8:1, coral 4.5:1 로 셋 다 AA 를 넘고, 기존 반투명 칩(3.5:1)보다 대비가 높다.
const CHIP_EMPHASIS: Record<ClosingSoonEmphasis, string> = {
  danger: 'bg-coral',
  warning: 'bg-warm',
  default: 'bg-[#E1E1E1]',
};

function TickerChip({ item, duplicate = false }: { item: ClosingSoonItem; duplicate?: boolean }) {
  return (
    <span
      className={cn(
        'mr-8 flex shrink-0 items-center gap-1.5 sm:mr-[52px]',
        duplicate && 'motion-reduce:hidden',
      )}
      aria-hidden={duplicate || undefined}
    >
      <span className="text-[#E1E1E1]">{item.name}</span>
      <span
        className={cn(
          'flex h-[18px] items-center rounded-full px-2 text-[13px] font-medium leading-none text-ink-deep',
          CHIP_EMPHASIS[item.emphasis],
        )}
      >
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
    // 시안 1920 캔버스의 80px 띠를 콘텐츠 폭 1200 기준(×0.815)으로 환산한 값: 높이 64·라벨 16/사이렌 26·이름 20·간격 48/52.
    <section className="relative mt-7 overflow-hidden bg-ink-deep text-white sm:mt-14">
      <div className="max-w-layout mx-auto flex h-16 items-center gap-4 px-4 sm:gap-12 sm:px-6 md:px-10">
        <div className="flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tightest text-cream sm:text-base">
          마감 임박 동아리
          <Siren size={26} />
        </div>

        {/* 오른쪽→왼쪽 seamless 무한 티커. hover 시 정지(CSS), reduced-motion 시 정지 + 가로 스크롤 폴백. */}
        <div className="group flex-1 overflow-hidden motion-reduce:overflow-x-auto">
          <div
            className="flex w-max text-base font-medium tracking-tightest animate-marquee group-hover:[animation-play-state:paused] motion-reduce:animate-none sm:text-xl"
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

        {/* 시안은 캐럿만 — 아이콘 링크라 접근명을 직접 단다. 44px 히트 박스, 글리프 우측이 콘텐츠 끝선에 오도록 박스 여백만큼 당긴다. */}
        <Link
          href={RECRUITING_CLUBS_HREF}
          aria-label="마감 임박 동아리 전체 보기"
          className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/85 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage motion-reduce:transition-none"
        >
          <ChevronRight size={28} strokeWidth={2.25} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
