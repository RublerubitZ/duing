import Link from 'next/link';

import { ChevronRight } from 'lucide-react';
import { cn } from '@/app/_lib/cn';
import { fetchClubStats } from '@/app/_lib/club-stats';
import { fetchUpcomingDeadlineClubs } from '@/app/_lib/home-data';
import { RECRUITING_CLUBS_HREF } from '@/app/_lib/exploreLinks';
import { CLOSING_SOON_CHIP_CLASS, selectClosingSoonClubs } from '@/app/_lib/closingSoon';

/**
 * 홈 모바일 전용 모집 요약 타일 — 히어로 바로 아래 잉크 색면 1장.
 *
 * <p>모바일에서는 티커(PC 전용으로 내려감)가 갖던 "가장 급한 마감" 을 이 타일이 승계한다.
 * 데이터는 히어로(`fetchClubStats`)·티커(`fetchUpcomingDeadlineClubs` + `selectClosingSoonClubs`)가
 * 이미 쓰는 로더 그대로다 — `fetchClubStats` 는 `cache()` 로 감싸져 있어 히어로와 같은 렌더에서
 * 요청이 한 번만 나가고, 두 로더의 fail-soft·ISR 정책도 그대로 따른다(쿠키·헤더 미사용).
 */
export async function HomeRecruitAnchor() {
  // D-7 윈도우가 잘리지 않도록 티커와 같은 40건을 받는다(선별 후 첫 항목만 쓴다).
  const [stats, clubs] = await Promise.all([fetchClubStats(), fetchUpcomingDeadlineClubs(40)]);
  if (stats === null || stats.recruitingCount <= 0) return null;

  const closing = selectClosingSoonClubs(clubs, new Date())[0] ?? null;
  const ariaLabel = `지금 모집 중 ${stats.recruitingCount}곳${
    closing === null ? '' : `, 가장 급한 마감 ${closing.name} ${closing.label}`
  }. 모집 중 동아리 보기`;

  return (
    // 히어로 컨테이너와 같은 좌우 여백. 위아래 마진은 두지 않는다 — 히어로 pb-3·검색바 pt-3 가 12px 리듬을
    // 만든다(sm 구간은 히어로 pb-8 이라 위 32·아래 12).
    <section className="px-4 sm:px-6 md:hidden">
      {/* 누름 피드백(축소·reduced-motion 해제)은 공용 `tap-card` 클래스가 갖는다(globals.css, 모바일 리듬 PR). */}
      <Link
        href={RECRUITING_CLUBS_HREF}
        aria-label={ariaLabel}
        className="tap-card block rounded-lg bg-ink p-5 text-cream shadow-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold text-cream/70">지금 모집 중</p>
            <p className="mt-1 text-[28px] font-bold leading-none tabular-nums tracking-tightest">
              {stats.recruitingCount}곳
            </p>
          </div>
          {closing !== null && (
            <div className="min-w-0 text-right">
              <p className="text-[12px] font-semibold text-cream/70">가장 급한 마감</p>
              <p className="mt-1 flex items-center justify-end gap-1.5">
                <span className="truncate text-[14px] font-semibold">{closing.name}</span>
                <span
                  className={cn(
                    'flex h-[18px] shrink-0 items-center rounded-full px-2 text-[12px] font-semibold leading-none text-ink-deep',
                    CLOSING_SOON_CHIP_CLASS[closing.emphasis],
                  )}
                >
                  {closing.label}
                </span>
              </p>
            </div>
          )}
        </div>
        <p className="mt-4 flex items-center gap-1 text-[13px] font-semibold text-cream/85">
          모집 중 동아리 보기
          <ChevronRight size={14} aria-hidden />
        </p>
      </Link>
    </section>
  );
}
