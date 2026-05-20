import Link from 'next/link';

import type { ManagedClub } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { ArrowRight } from '@/components/duing/Icon';

import { SectionHeader } from './SectionHeader';

type Props = {
  managedClubs: ManagedClub[];
  /** 총 가입 동아리 수 (관리 외 일반 회원 포함) — API 미지원 시 managedClubs.length 로 대체 */
  totalJoined?: number;
};

export function SectionJoined({ managedClubs, totalJoined }: Props) {
  const displayCount = totalJoined ?? managedClubs.length;

  return (
    <section
      data-section="joined"
      id="sec-joined"
      className="px-10 pt-8 pb-6 scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto">
        <SectionHeader
          title={`가입한 동아리 · ${displayCount}`}
          hint="활동 중인 동아리와 다음 모임 일정을 확인해요."
        />

        {managedClubs.length === 0 ? (
          <div className="bg-paper border border-line rounded-lg px-8 py-12 text-center text-charcoal-3 text-sm">
            운영 중인 동아리가 없어요.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {managedClubs.map((club) => {
              const isAdmin = club.myRole === 'LEADER' || club.myRole === 'OFFICER';
              const roleLabel = club.myRole === 'LEADER' ? '동아리장' : '운영진';

              return (
                <div
                  key={club.clubId}
                  className={cn(
                    'bg-paper rounded-[18px] px-5 py-5 flex items-center gap-4',
                    'transition-[transform,box-shadow] duration-150',
                    'hover:-translate-y-0.5 hover:shadow-2 cursor-pointer',
                    isAdmin ? 'border-[1.5px] border-ink' : 'border border-line',
                  )}
                >
                  {/* Logo slot */}
                  <div
                    className={cn(
                      'w-14 h-14 rounded-[14px] grid place-items-center text-[26px] shrink-0',
                      isAdmin ? 'bg-ink-deep text-white' : 'bg-sage-mist text-ink-deep',
                    )}
                  >
                    {club.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={club.logoUrl}
                        alt={club.clubName}
                        className="w-full h-full object-cover rounded-[14px]"
                      />
                    ) : (
                      '🏛'
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="font-bold text-[16px] text-ink-deep">{club.clubName}</span>
                      <span
                        className={cn(
                          'pill text-[10.5px]',
                          isAdmin && 'bg-ink text-white border-ink',
                        )}
                      >
                        {isAdmin && '✦ '}
                        {roleLabel}
                      </span>
                    </div>
                    {club.activeRecruitmentCount > 0 && (
                      <div className="text-[12.5px] text-charcoal-2">
                        <span className="font-semibold">모집 중</span> · {club.activeRecruitmentCount}개 공고
                      </div>
                    )}
                  </div>

                  {/* Action */}
                  {isAdmin ? (
                    <Link
                      href={`/manage?clubId=${club.clubId}`}
                      className="btn btn-primary btn-sm"
                      title="동아리 운영자 콘솔로 이동"
                    >
                      관리
                      <ArrowRight size={14} />
                    </Link>
                  ) : (
                    <Link
                      href={`/clubs/${club.clubId}`}
                      className="btn btn-ghost btn-sm"
                      aria-label={`${club.clubName} 상세 보기`}
                    >
                      <ArrowRight size={14} />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
