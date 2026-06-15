import Link from 'next/link';

import { ArrowRight } from '@/components/duing/Icon';
import { fetchUpcomingDeadlineClubs } from '@/app/_lib/home-data';
import { computeDday } from '@/app/_lib/dday';

export async function RecruitmentTicker() {
  const clubs = await fetchUpcomingDeadlineClubs(8);
  if (clubs.length === 0) return null;

  const today = new Date();

  return (
    <section className="relative mt-8 overflow-hidden bg-ink-deep py-5 text-white sm:mt-16">
      <div className="max-w-layout mx-auto flex items-center gap-6 px-4 sm:px-6 md:px-10">
        <div
          className="flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold tracking-wide04 text-sage"
          style={{ background: 'rgba(157,182,160,0.18)' }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          마감 임박
        </div>
        <div className="flex flex-1 gap-8 overflow-hidden text-sm font-medium">
          {clubs.map((club) => {
            const endDate = club.activeRecruitment?.endDate;
            if (!endDate) return null;
            return (
              <span key={club.id} className="flex shrink-0 items-center gap-2.5">
                <span className="text-white/65">{club.name}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11.5px] font-bold text-sage">
                  {computeDday(endDate, today)}
                </span>
              </span>
            );
          })}
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
