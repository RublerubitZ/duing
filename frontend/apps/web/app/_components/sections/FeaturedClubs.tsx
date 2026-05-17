import Link from 'next/link';
import { ArrowRight } from '@/components/duing/Icon';
import { Sparkle } from '@/components/duing/Sparkle';
import { featuredClubs, type FeaturedClub } from '../../_mocks';

export function FeaturedClubs() {
  return (
    <section className="px-10 py-16">
      <div className="max-w-layout mx-auto">
        <div className="mb-9 flex items-end justify-between">
          <div>
            <div className="mb-2.5 text-[13px] font-semibold tracking-wide08 text-ink">
              FEATURED · 이번 주 주목
            </div>
            <h2 className="text-[44px]">지금 가장 활발한 곳</h2>
          </div>
          <Link
            href="/clubs"
            className="flex items-center gap-1.5 text-sm font-semibold text-ink hover:gap-2"
          >
            전체 보기 <ArrowRight />
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-4">
          {featuredClubs.map((club) => (
            <FeaturedCard key={club.id} club={club} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturedCard({ club }: { club: FeaturedClub }) {
  return (
    <Link
      href={`/clubs/${club.id}`}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-lg border border-line bg-paper p-4 transition hover:shadow-2"
    >
      <div
        className="relative grid h-[156px] place-items-center overflow-hidden rounded-md"
        style={{
          background: `linear-gradient(135deg, ${club.color}22 0%, ${club.color}11 100%)`,
        }}
      >
        <span className="text-[56px] saturate-[0.85]">{club.avatar}</span>
        <Sparkle size={18} color={club.color} className="absolute right-3 top-3" />
        {club.recruit && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-[11.5px] font-bold text-paper">
            <span className="h-1.5 w-1.5 rounded-full bg-sage" />
            모집중
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="pill" style={{ fontSize: 11 }}>
          {club.cat}
        </span>
        <span className="text-[11.5px] text-charcoal-3">· {club.gen}</span>
        <span className="ml-auto text-xs text-charcoal-3">{club.members}명</span>
      </div>
      <div>
        <h3 className="mb-1 text-[19px]">{club.name}</h3>
        <p className="text-[13.5px] text-charcoal-3">{club.tag}</p>
      </div>
      {club.recruit && (
        <div className="mt-1 flex items-center justify-between border-t border-dashed border-line pt-3 text-[12.5px] text-charcoal-2">
          <span>모집 {club.spots}</span>
          <span className="font-bold text-ink">~ {club.deadline}</span>
        </div>
      )}
    </Link>
  );
}