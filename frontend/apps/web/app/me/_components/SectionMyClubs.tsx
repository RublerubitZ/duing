'use client';

import { useState } from 'react';
import Link from 'next/link';

import type { ClubStatus, MyClubSummary } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { clubMemberRoleLabel } from '@/app/_lib/clubMemberRoleLabel';
import { ArrowRight } from '@/components/duing/Icon';
import { ClubLogo } from '@/app/_components/ClubLogo';

import { LeaveClubDialog } from './LeaveClubDialog';
import { SectionHeader } from './SectionHeader';

/**
 * 알려진 비 ACTIVE 상태 안내 문구. 백엔드(#591)가 마이페이지 목록을 ACTIVE 로 필터하고
 * status 를 내려주므로 정상 흐름에선 노출되지 않지만, FE-BE 정책 일치(심층 방어)를 위해
 * 상태 기반으로 액션을 가드한다.
 */
const STATUS_NOTICE: Record<Exclude<ClubStatus, 'ACTIVE'>, string> = {
  PENDING_APPROVAL: '승인 대기 중인 동아리입니다.',
  REJECTED: '거절된 동아리입니다.',
  INACTIVE: '운영 종료된 동아리입니다.',
};

type Props = {
  myClubs: MyClubSummary[];
};

export function SectionMyClubs({ myClubs }: Props) {
  const [leaveTarget, setLeaveTarget] = useState<MyClubSummary | null>(null);

  return (
    <section
      data-section="joined"
      id="sec-joined"
      className="px-4 sm:px-6 md:px-10 pt-8 pb-6 scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto">
        <SectionHeader
          title={`가입한 동아리 · ${myClubs.length}`}
          hint="활동 중인 동아리와 다음 모임 일정을 확인해요."
        />

        {myClubs.length === 0 ? (
          <div className="bg-paper border border-line rounded-lg px-8 py-12 text-center text-charcoal-3 text-sm">
            아직 가입한 동아리가 없어요.{' '}
            <Link href="/clubs" className="text-ink font-semibold hover:underline">
              동아리 탐색하러 가기 →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {myClubs.map((club) => {
              const isManager = club.myRole === 'LEADER' || club.myRole === 'OFFICER';
              const roleLabel = clubMemberRoleLabel(club.myRole);
              // BE(#591)가 status 를 내려주기 전(배포 전환기)이나 미지의 상태값에서는
              // 기존 동작(액션 노출)으로 폴백한다 — 비 ACTIVE 차단의 1차 방어선은 백엔드 필터다.
              const statusNotice = club.status === 'ACTIVE' ? null : STATUS_NOTICE[club.status];

              return (
                <div
                  key={club.clubId}
                  className={cn(
                    'bg-paper rounded-[18px] px-5 py-5 flex items-center gap-4',
                    'transition-[transform,box-shadow] duration-150',
                    'hover:-translate-y-0.5 hover:shadow-2',
                    isManager ? 'border-[1.5px] border-ink' : 'border border-line',
                  )}
                >
                  <div
                    className={cn(
                      'w-14 h-14 rounded-[14px] grid place-items-center text-[26px] shrink-0 relative overflow-hidden',
                      isManager ? 'bg-ink-deep text-white' : 'bg-sage-mist text-ink-deep',
                    )}
                  >
                    <ClubLogo logoUrl={club.logoUrl} alt={club.clubName}>
                      <span>🏛</span>
                    </ClubLogo>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="font-bold text-[16px] text-ink-deep">{club.clubName}</span>
                      <span
                        className={cn(
                          'pill text-[10.5px]',
                          isManager && 'bg-ink text-white border-ink',
                        )}
                      >
                        {isManager && '✦ '}
                        {roleLabel}
                      </span>
                    </div>
                    {club.activeRecruitmentCount > 0 && (
                      <div className="text-[12.5px] text-charcoal-2">
                        <span className="font-semibold">모집 중</span> · {club.activeRecruitmentCount}개 공고
                      </div>
                    )}
                  </div>

                  {statusNotice ? (
                    <span className="text-[12px] text-charcoal-3 shrink-0">{statusNotice}</span>
                  ) : isManager ? (
                    <Link
                      href={`/manage?clubId=${club.clubId}`}
                      className="btn btn-primary btn-sm"
                      title="동아리 운영자 콘솔로 이동"
                    >
                      관리
                      <ArrowRight size={14} />
                    </Link>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link
                        href={`/clubs/${club.clubId}/member`}
                        className="btn btn-ghost btn-sm"
                        aria-label={`${club.clubName} 둘러보기`}
                      >
                        둘러보기
                        <ArrowRight size={14} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setLeaveTarget(club)}
                        className="btn btn-ghost btn-sm text-coral"
                        aria-label={`${club.clubName} 탈퇴`}
                      >
                        탈퇴
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {leaveTarget && (
          <LeaveClubDialog
            key={leaveTarget.clubId}
            club={{ clubId: leaveTarget.clubId, clubName: leaveTarget.clubName }}
            onClose={() => setLeaveTarget(null)}
          />
        )}
      </div>
    </section>
  );
}
