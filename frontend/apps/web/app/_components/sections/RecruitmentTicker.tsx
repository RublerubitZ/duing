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
        'mr-5 flex shrink-0 items-center gap-1.5 sm:mr-[52px]',
        duplicate && 'motion-reduce:hidden',
      )}
      aria-hidden={duplicate || undefined}
    >
      <span className="text-[#E1E1E1]">{item.name}</span>
      <span
        className={cn(
          'flex h-3 items-center rounded-full px-2 text-[10px] font-medium leading-none text-ink-deep sm:h-[18px] sm:text-[13px]',
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

  // 트랙을 -50% 옮겨 이어붙이는 마퀴라, 한 카피가 마퀴 폭보다 좁으면 이음매에 빈 띠가 지나간다.
  // 빈 띠가 생기는지는 항목 폭이 아니라 "마퀴 폭 ÷ 항목 폭" 이 정하고, 그 비는 모바일보다 PC 가 크다 —
  // 모바일 393 은 마퀴 ≈225px 에 항목 ≈78~97px(3카피면 충분), PC 1280 은 마퀴 ≈922px 에 항목 ≈173px 라
  // ≈5.3카피가 필요하다. 넓은 쪽에 맞춰 한 카피가 최소 6개가 되도록 되풀이해 채운다.
  const MIN_CYCLE_ITEMS = 6;
  const repeatCount = Math.ceil(MIN_CYCLE_ITEMS / items.length);
  const cycle = Array.from({ length: repeatCount }, () => items).flat();

  // 항목 수에 비례한 길이(개당 약 2.6s, 최소 12s)로 개수와 무관하게 일정한 속도를 유지한다.
  // 되풀이 배수를 그대로 곱해야 속도가 보존된다 — 늘어난 카피 길이를 12s 하한에 그대로 맡기면
  // 모집이 적을수록 같은 시간에 더 긴 트랙을 지나가 눈에 띄게 빨라진다(1곳이면 6배).
  const durationSeconds = Math.max(12, Math.round(items.length * 2.6)) * repeatCount;

  return (
    // PC(sm+): 시안 1920 캔버스의 80px 띠를 콘텐츠 폭 1200 기준(×0.815)으로 환산 — 높이 64·라벨 16/사이렌 26·이름 20·간격 48/52.
    // 모바일: 시안 393 프레임(493:5362)은 1:1 이라 그대로 — 높이 38·라벨 10/사이렌 14·이름 10·칩 12·항목 간격 20·캐럿 14.
    <section className="relative mt-7 overflow-hidden bg-ink-deep text-white sm:mt-14">
      <div className="max-w-layout mx-auto flex h-[38px] items-center gap-2 px-4 sm:h-16 sm:gap-12 sm:px-6 md:px-10">
        <div className="flex shrink-0 items-center gap-1 text-[10px] font-semibold tracking-tightest text-cream sm:gap-2 sm:text-base">
          마감 임박 동아리
          <Siren size={14} className="sm:size-[26px]" />
        </div>

        {/* 오른쪽→왼쪽 seamless 무한 티커. hover 시 정지(CSS), reduced-motion 시 정지 + 가로 스크롤 폴백. */}
        <div className="group flex-1 overflow-hidden motion-reduce:overflow-x-auto">
          <div
            className="flex w-max text-[10px] font-medium tracking-tightest animate-marquee group-hover:[animation-play-state:paused] motion-reduce:animate-none sm:text-xl"
            style={{ animationDuration: `${durationSeconds}s` }}
          >
            {/* 첫 카피의 원본 구간만 스크린리더에 남기고, 폭을 채우려 되풀이한 뒤쪽은 복제로 처리한다. */}
            {cycle.map((item, index) => (
              <TickerChip
                key={`cycle-${item.id}-${index}`}
                item={item}
                duplicate={index >= items.length}
              />
            ))}
            {/* seamless 루프용 복제 — 스크린리더 중복 방지(aria-hidden), reduced-motion 에선 숨김. */}
            {cycle.map((item, index) => (
              <TickerChip key={`loop-${item.id}-${index}`} item={item} duplicate />
            ))}
          </div>
        </div>

        {/* 시안은 캐럿만 — 아이콘 링크라 접근명을 직접 단다. 글리프 우측이 콘텐츠 끝선에 오도록 박스 여백만큼 당긴다.
            모바일 히트 박스는 44×38 이다: 띠가 시안대로 38px 이고 조상이 overflow-hidden 이라 세로로 44px 를 주면
            넘치는 3px 이 잘려 눌리지도, 포커스 링이 보이지도 않는다. 가로만 44px 를 지키고 세로는 띠 높이에 맞춘다
            (WCAG 2.5.8 AA 24px 상회). 포커스 링 offset 도 같은 이유로 모바일만 0 이다. PC 는 44×44 그대로. */}
        <Link
          href={RECRUITING_CLUBS_HREF}
          aria-label="마감 임박 동아리 전체 보기"
          className="-mr-[15px] grid h-[38px] w-11 shrink-0 place-items-center rounded-full text-white/85 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-sage motion-reduce:transition-none sm:h-11 sm:-mr-2 sm:focus-visible:outline-offset-2"
        >
          <ChevronRight size={14} strokeWidth={2.25} className="sm:size-[28px]" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
