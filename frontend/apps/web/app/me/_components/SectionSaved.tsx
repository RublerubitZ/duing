import Link from 'next/link';

import type { FavoriteClub } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { ClubLogo } from '@/app/_components/ClubLogo';
import { clubCategoryLabel } from '@/app/clubs/[clubId]/_lib/clubCategoryLabel';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';

import { ListLoadError } from './ListLoadError';
import { SectionHeader } from './SectionHeader';

type Props = {
  /** 받은 찜 — 마이페이지는 첫 페이지(20개)만 받는다. */
  favorites: FavoriteClub[];
  /** 찜 전체 수(응답 totalElements) — 받은 카드보다 많을 수 있다(#1580). */
  totalCount: number;
  /** 조회 중 — 빈 상태 대신 스켈레톤(정적 HTML·조회 전에 거짓 "없어요"를 그리지 않는다, #1500). */
  isPending?: boolean;
  /** 첫 조회가 실패해 받은 목록이 없을 때만 넘긴다 — 있으면 빈 안내 대신 실패 안내와 다시 시도(#1579). */
  onRetry?: () => void;
};

export function SectionSaved({ favorites, totalCount, isPending = false, onRetry }: Props) {
  // 첫 페이지만 그린다 — 전체가 더 많을 때만 나머지를 볼 /me/favorites 로 잇는다(받은 것이 전부면 같은 목록이라 링크가 필요 없다).
  const hasMoreFavorites = !isPending && !onRetry && totalCount > favorites.length;

  return (
    <section
      data-section="saved"
      id="sec-saved"
      className="pt-6 pb-[260px] md:pt-8 scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto px-4 sm:px-6 md:px-10">
        <SectionHeader
          title={isPending || onRetry ? '찜한 동아리' : `찜한 동아리 · ${totalCount}`}
          hint="관심 표시한 동아리예요. 모집 마감이 임박하면 알려드려요."
          extra={
            hasMoreFavorites ? (
              <Link
                href={toRoute('/me/favorites')}
                className="text-[13px] font-semibold text-ink hover:underline"
              >
                {/* 문의 섹션에도 '전체 보기'가 있다 — 링크 목록으로 훑어도 구분되게 접근 이름에만 섹션을 붙인다.
                    띄어쓰기는 span 밖에 둔다(span 안 끝 공백은 이름 계산에서 잘린다). 보이는 쪽 맨 앞 공백은 줄 처음이라 접힌다. */}
                <span className="sr-only">찜한 동아리</span> 전체 보기
              </Link>
            ) : undefined
          }
        />

        {isPending ? (
          <ListRowsSkeleton rows={2} rowClassName="h-[88px] rounded-lg" label="찜한 동아리 불러오는 중" />
        ) : onRetry ? (
          <ListLoadError message="찜한 동아리를 불러오지 못했어요." onRetry={onRetry} />
        ) : totalCount === 0 ? (
          <div className="bg-paper border border-line rounded-lg px-8 py-12 text-center text-charcoal-3 text-sm">
            아직 찜한 동아리가 없어요.{' '}
            <Link href="/clubs" className="text-ink font-semibold hover:underline">
              동아리 탐색하러 가기
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
                        <span aria-hidden className="font-bold">{(club.name || '?').trim().charAt(0)}</span>
                      </ClubLogo>
                    </div>
                    {/* heart icon */}
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="var(--coral)"
                      stroke="var(--coral)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </div>

                  {/* Name + division — 띄어쓰기 없는 긴 이름·분과도 카드 안에서 줄바꿈 */}
                  <div className="break-words">
                    <div className="font-bold text-[14.5px] text-ink-deep mb-1">{club.name}</div>
                    {club.division && (
                      <div className="text-[11.5px] text-charcoal-3 leading-snug">{club.division}분과</div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between text-[11px] pt-2">
                    <span className="pill text-[11px]">{clubCategoryLabel(club.category)}</span>
                    <span
                      className={cn(
                        'font-semibold tabular-nums',
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
