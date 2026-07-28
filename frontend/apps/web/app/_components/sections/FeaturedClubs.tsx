import Link from 'next/link';
import type { ClubSummary } from '@duing/types';

import { ArrowRight } from '@/components/duing/Icon';
import { Sparkle } from '@/components/duing/Sparkle';
import { fetchPopularClubs } from '@/app/_lib/home-data';

const CATEGORY_LABEL: Record<ClubSummary['category'], string> = {
  ACADEMIC: '학술',
  CREATION: '창작',
  ART: '예술',
  SPORTS: '운동',
  VOLUNTEER: '봉사',
  RELIGION: '종교',
  HOBBY: '취미',
  OTHER: '기타',
};

const CATEGORY_COLOR: Record<ClubSummary['category'], string> = {
  ACADEMIC: '#1F4A36',
  CREATION: '#6b7e3e',
  ART: '#7d4f87',
  SPORTS: '#c47a3b',
  VOLUNTEER: '#b88b3b',
  RELIGION: '#a85e5e',
  HOBBY: '#4d6b8a',
  OTHER: '#3e7a73',
};

export async function FeaturedClubs() {
  const clubs = await fetchPopularClubs(4);
  if (clubs.length === 0) return null;

  return (
    <section className="px-4 sm:px-6 md:px-10 py-8 sm:py-16">
      <div className="max-w-layout mx-auto">
        <div className="mb-9 flex items-end justify-between">
          <div>
            <div className="mb-2.5 text-[13px] font-semibold tracking-wide08 text-ink">
              FEATURED · 이번 주 주목
            </div>
            <h2 className="text-[26px] sm:text-[36px] md:text-[44px]">지금 가장 활발한 곳</h2>
          </div>
          <Link
            href="/clubs"
            className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-ink hover:gap-2"
          >
            전체 보기 <ArrowRight />
          </Link>
        </div>
        {/* 모바일 2×2(최대 4개) / 데스크탑 4열 */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
          {clubs.map((club) => (
            <FeaturedCard key={club.id} club={club} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturedCard({ club }: { club: ClubSummary }) {
  const color = CATEGORY_COLOR[club.category];
  const categoryLabel = CATEGORY_LABEL[club.category];
  const endDate = club.activeRecruitment?.endDate ?? null;

  return (
    <Link
      href={`/clubs/${club.id}`}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-lg border border-line bg-paper p-4 transition hover:shadow-2"
    >
      <div
        className="relative grid h-[156px] place-items-center overflow-hidden rounded-md"
        style={{ background: `linear-gradient(135deg, ${color}22 0%, ${color}11 100%)` }}
      >
        {club.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={club.logoUrl}
            alt={club.name}
            loading="lazy"
            decoding="async"
            className="h-20 w-20 rounded-full object-cover"
          />
        ) : (
          <span className="text-[44px] font-bold" style={{ color }}>
            {club.name.charAt(0)}
          </span>
        )}
        <Sparkle size={18} color={color} className="absolute right-3 top-3" />
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-[11.5px] font-bold text-paper">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          모집중
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="pill" style={{ fontSize: 11 }}>{categoryLabel}</span>
        {club.tags.slice(0, 1).map((tag) => (
          <span key={tag} className="text-[11.5px] text-charcoal-3">· {tag}</span>
        ))}
      </div>
      <div>
        <h3 className="mb-1 text-[19px]">{club.name}</h3>
        <p className="line-clamp-2 text-[13.5px] text-charcoal-3">
          {club.tags.length > 0 ? club.tags.join(' · ') : '소개 준비중'}
        </p>
      </div>
      {endDate && (
        <div className="mt-1 flex items-center justify-between border-t border-dashed border-line pt-3 text-[12.5px] text-charcoal-2">
          <span>모집 중</span>
          <span className="font-bold text-ink">~ {endDate}</span>
        </div>
      )}
    </Link>
  );
}
