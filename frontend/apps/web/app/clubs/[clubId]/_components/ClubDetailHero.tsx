'use client';

<<<<<<< HEAD
import { useState } from 'react';
import type { ClubDetail, RecruitmentDisplayStatus } from '@duing/types';
import { useAuthStore } from '@duing/stores';
import { ReportModal } from '@/components/report/ReportModal';
=======
import type { ClubDetail, RecruitmentDisplayStatus } from '@duing/types';
>>>>>>> origin/main
import { displayStatusLabel } from '../../../_lib/recruitmentDisplay';
import { clubCategoryLabel } from '../_lib/clubCategoryLabel';

type Props = {
  club: ClubDetail;
  /** 활성 모집의 displayStatus. 모집이 없으면 undefined. */
  recruitmentDisplayStatus?: RecruitmentDisplayStatus;
};

export function ClubDetailHero({ club, recruitmentDisplayStatus }: Props) {
  const categoryLabel = clubCategoryLabel(club.category);
  const initial = club.name.trim().charAt(0);
<<<<<<< HEAD
  const authStatus = useAuthStore((state) => state.status);
  const isAuthenticated = authStatus === 'authenticated';

  const [reportOpen, setReportOpen] = useState(false);
=======
>>>>>>> origin/main

  return (
    <>
      <div className="border-b border-line bg-cream">
        <div className="max-w-layout mx-auto px-10 py-4 text-[12.5px] text-charcoal-3">
          동아리 탐색 / <span>{categoryLabel}</span> /{' '}
          <span className="font-semibold text-ink">{club.name}</span>
        </div>
      </div>

      <section className="bg-cream px-10 pt-11 pb-8">
        <div className="max-w-layout mx-auto">
          <div className="mb-8 flex items-start gap-6">
            <div
              className="relative grid h-[140px] w-[140px] shrink-0 place-items-center rounded-[28px] text-white shadow-2 overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #1F4A36 0%, #2E6149 100%)' }}
            >
              {club.logoUrl ? (
                <img
                  src={club.logoUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <span className="font-display text-[56px] font-bold leading-none">
                  {initial}
                </span>
              )}
            </div>

            <div className="flex-1 pt-2">
              <div className="mb-3.5 flex items-center gap-2">
<<<<<<< HEAD
                {club.centralClub && (
                  <span className="pill pill-solid">
                    🏛️ 중앙동아리
                  </span>
                )}
=======
>>>>>>> origin/main
                <span className="pill">
                  {categoryLabel}{club.division ? ` · ${club.division}` : ''}
                </span>
                {recruitmentDisplayStatus && (
                  <span className="pill pill-solid">
                    {displayStatusLabel(recruitmentDisplayStatus)}
                  </span>
                )}
                {(club.foundedYear !== null || club.cohortNumber !== null) && (
                  <span className="text-[13px] text-charcoal-3">
                    {club.foundedYear !== null && `${club.foundedYear}년 창설`}
                    {club.foundedYear !== null && club.cohortNumber !== null && ' · '}
                    {club.cohortNumber !== null && `${club.cohortNumber}기`}
                  </span>
                )}
              </div>
              <h1 className="mb-4 text-[56px] leading-none tracking-tightx">{club.name}</h1>
              {club.description && (
                <p className="max-w-[580px] text-lg leading-relaxed text-charcoal-2 line-clamp-2">
                  {club.description}
                </p>
              )}
<<<<<<< HEAD

              {isAuthenticated && (
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="mt-4 flex items-center gap-1.5 text-xs text-charcoal-3 underline-offset-2 hover:text-coral hover:underline"
                >
                  <FlagIcon />
                  신고하기
                </button>
              )}
=======
>>>>>>> origin/main
            </div>
          </div>
        </div>
      </section>
<<<<<<< HEAD

      {reportOpen && (
        <ReportModal
          targetType="CLUB"
          targetId={club.id}
          targetLabel={club.name}
          onClose={() => setReportOpen(false)}
        />
      )}
    </>
  );
}

function FlagIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" x2="4" y1="22" y2="15" />
    </svg>
  );
}
=======
    </>
  );
}
>>>>>>> origin/main
