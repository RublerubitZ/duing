import Link from 'next/link';

import type { FavoriteClub } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { ClubLogo } from '@/app/_components/ClubLogo';
import { clubCategoryLabel } from '@/app/clubs/[clubId]/_lib/clubCategoryLabel';

import { SectionHeader } from './SectionHeader';

const CATEGORY_EMOJI: Record<string, string> = {
  ACADEMIC: '📚',
  CREATION: '🎨',
  ART: '🎭',
  SPORTS: '⚽',
  VOLUNTEER: '🤝',
  RELIGION: '🙏',
  HOBBY: '🎮',
  OTHER: '✨',
};

type Props = {
  favorites: FavoriteClub[];
};

export function SectionSaved({ favorites }: Props) {
  return (
    <section
      data-section="saved"
      id="sec-saved"
      className="px-4 sm:px-6 md:px-10 pt-8 pb-[260px] scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto">
        <SectionHeader
          title={`찜한 동아리 · ${favorites.length}`}
          hint="관심 표시한 동아리예요. 모집 마감이 임박하면 알려드려요."
        />

        {favorites.length === 0 ? (
          <div className="bg-paper border border-line rounded-lg px-8 py-12 text-center text-charcoal-3 text-sm">
            아직 찜한 동아리가 없어요.{' '}
            <Link href="/clubs" className="text-ink font-semibold hover:underline">
              동아리 탐색하러 가기 →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {favorites.map((club) => {
              const isRecruiting = club.openRecruitmentCount > 0;

              return (
                <Link
                  key={club.clubId}
                  href={`/clubs/${club.clubId}`}
                  className={cn(
                    'block bg-paper border border-line rounded-[16px] px-4 py-4',
                    'flex flex-col gap-3',
                    'transition-[transform,box-shadow,border-color] duration-150',
                    'hover:-translate-y-0.5 hover:shadow-2 hover:border-ink',
                  )}
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div
                      className="w-11 h-11 rounded-[12px] grid place-items-center text-[22px] bg-sage-mist text-ink-deep overflow-hidden relative"
                    >
                      <ClubLogo logoUrl={club.logoUrl} alt={club.name}>
                        <span>{CATEGORY_EMOJI[club.category] ?? '✨'}</span>
                      </ClubLogo>
                    </div>
                    {/* heart icon */}
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="#D97757"
                      stroke="#D97757"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </div>

                  {/* Name + division */}
                  <div>
                    <div className="font-bold text-[14.5px] text-ink-deep mb-1">{club.name}</div>
                    {club.division && (
                      <div className="text-[11.5px] text-charcoal-3 leading-snug">{club.division}분과</div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between text-[11px] pt-2">
                    <span className="pill text-[10px]">{clubCategoryLabel(club.category)}</span>
                    <span
                      className={cn(
                        'font-semibold font-mono',
                        isRecruiting ? 'text-ink' : 'text-charcoal-3',
                      )}
                    >
                      {isRecruiting ? `모집중 ${club.openRecruitmentCount}건` : '모집 없음'}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
