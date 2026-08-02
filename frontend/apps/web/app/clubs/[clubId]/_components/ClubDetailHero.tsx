'use client';

import { useState } from 'react';
import type { ClubDetail, RecruitmentDisplayStatus } from '@duing/types';
import { useAuthStore } from '@duing/stores';
import { ReportModal } from '@/components/report/ReportModal';
import { cn } from '@/app/_lib/cn';
import { ClubLogo } from '@/app/_components/ClubLogo';
import { displayStatusLabel } from '../../../_lib/recruitmentDisplay';
import { clubCategoryLabel } from '../_lib/clubCategoryLabel';
import { pickColor } from '../../_lib/clubAdapter';
import { ClubDetailTopBar } from './ClubDetailTopBar';

type Props = {
  club: ClubDetail;
  /** 활성 모집의 displayStatus. 모집이 없으면 undefined. */
  recruitmentDisplayStatus?: RecruitmentDisplayStatus;
};

export function ClubDetailHero({ club, recruitmentDisplayStatus }: Props) {
  const categoryLabel = clubCategoryLabel(club.category);
  const initial = club.name.trim().charAt(0);
  // 로고 없는 동아리의 로고박스 배경 — 카드/리스트와 동일 색을 써 모핑 중 배경 점프를 없앤다.
  const logoColor = pickColor(club.id);
  const authStatus = useAuthStore((state) => state.status);
  const isAuthenticated = authStatus === 'authenticated';

  const [reportOpen, setReportOpen] = useState(false);

  return (
    <>
      {/* ===================== 데스크탑/태블릿 히어로 (md+) ===================== */}
      <div className="hidden md:block">
        <div className="bg-cream">
          <div className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-4 text-[12.5px] text-charcoal-3">
            동아리 탐색 / <span>{categoryLabel}</span> /{' '}
            <span className="font-semibold text-ink">{club.name}</span>
          </div>
        </div>

        <section className="relative overflow-hidden bg-cream">
          {club.coverUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- 외부 Storage URL. Hero 배경 분위기용. */}
              <img
                src={club.coverUrl}
                alt=""
                aria-hidden
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover opacity-50"
              />
              {/* cream 오버레이 — 텍스트 가독성 보존. 좌하단에서 우상단으로 갈수록 cover 살짝 더 비침. */}
              <div
                className="absolute inset-0 bg-gradient-to-tr from-cream/85 via-cream/65 to-cream/45"
                aria-hidden
              />
            </>
          )}
          <div className="relative max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-9">
            <div className="flex flex-col items-start gap-6 md:flex-row">
              {/* 커버는 히어로 전체 배경(풀블리드)이라 걸침 없음 — 보더·섀도만 규칙 통일. */}
              <div
                className="relative grid h-[140px] w-[140px] shrink-0 place-items-center overflow-hidden rounded-[28px] border-[3px] border-white text-white shadow-lg"
                style={{
                  // 로고 있으면 ink(이미지가 덮음), 없으면 카드와 동일 시그니처 색 → 모핑 중 배경 일치.
                  background: club.logoUrl
                    ? 'linear-gradient(135deg, #1F4A36 0%, #2E6149 100%)'
                    : `linear-gradient(135deg, ${logoColor} 0%, ${logoColor}CC 100%)`,
                  // 공유요소 전환 — 목록 카드 로고에서 모핑되어 들어온다.
                  viewTransitionName: `club-logo-${club.id}`,
                }}
              >
                <ClubLogo logoUrl={club.logoUrl}>
                  <span className="font-display text-[56px] font-bold leading-none">
                    {initial}
                  </span>
                </ClubLogo>
              </div>

              <div className="flex-1 pt-2">
                <div className="mb-3.5 flex flex-wrap items-center gap-2">
                  {club.centralClub && <span className="pill pill-solid">🏛️ 중앙동아리</span>}
                  <span className="pill">
                    {categoryLabel}
                    {club.division ? ` · ${club.division}` : ''}
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
                {/* 이름 아래는 해시태그 — 소개 본문은 소개 탭에서만 보여준다(중복 제거). */}
                {club.tags.length > 0 && (
                  <div className="flex max-w-[580px] flex-wrap gap-1.5">
                    {club.tags.map((tagName) => (
                      <span key={tagName} className="pill pill-outline bg-paper/60 text-[12px]">
                        #{tagName.replace(/^#+/, '')}
                      </span>
                    ))}
                  </div>
                )}

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
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ===================== 모바일 히어로 (md 미만) ===================== */}
      <div className="md:hidden">
        {/* 커버 배너(있으면) + 상단 액션바(오버레이). 부모 relative. */}
        <div className="relative">
          {club.coverUrl ? (
            <div className="relative h-[150px] w-full overflow-hidden bg-sage-mist">
              {/* eslint-disable-next-line @next/next/no-img-element -- 외부 Storage URL. 모바일 커버 배너. */}
              <img src={club.coverUrl} alt="" aria-hidden decoding="async" className="h-full w-full object-cover" />
              {/* 배너 하단을 cream 으로 페이드 — 아래 콘텐츠와 매끄럽게 잇고 겹친 로고를 받쳐준다. */}
              <div
                className="absolute inset-0 bg-gradient-to-t from-cream via-cream/20 to-transparent"
                aria-hidden
              />
            </div>
          ) : (
            <div className="h-[calc(3.25rem+env(safe-area-inset-top))]" />
          )}
          <ClubDetailTopBar clubId={club.id} />
        </div>

        <div className="px-4 pb-1">
          {/* 로고 · 동아리명 · 신고하기 한 행 — 첫 화면에서 동아리명이 최우선으로 읽히게. */}
          <div
            className={cn(
              'flex items-center justify-between gap-3',
              club.coverUrl ? '-mt-6' : 'mt-1',
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                // 로고 1/3만 커버에 걸침 — 히어로 프로필 규칙(편집 폼·Preview와 통일).
                className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[22px] border-[3px] border-white text-white shadow-lg"
                style={{
                  // 로고 있으면 ink(이미지가 덮음), 없으면 카드/리스트와 동일 시그니처 색 → 모핑 중 배경 일치.
                  background: club.logoUrl
                    ? 'linear-gradient(135deg, #1F4A36 0%, #2E6149 100%)'
                    : `linear-gradient(135deg, ${logoColor} 0%, ${logoColor}CC 100%)`,
                  // 공유요소 전환 — 목록 카드 로고에서 모핑되어 들어온다(모바일 히어로).
                  viewTransitionName: `club-logo-${club.id}`,
                }}
              >
                <ClubLogo logoUrl={club.logoUrl}>
                  <span className="font-display text-[34px] font-bold leading-none">{initial}</span>
                </ClubLogo>
              </div>
              <h1 className="min-w-0 text-[28px] leading-[1.15] tracking-tightx">{club.name}</h1>
            </div>

            {isAuthenticated && (
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="flex shrink-0 items-center gap-1.5 text-[11px] text-charcoal-3 underline-offset-2 hover:text-coral hover:underline"
              >
                <FlagIcon />
                신고하기
              </button>
            )}
          </div>

          {/* 중앙동아리 pill(좌) · 창설년도/기수(우) 한 행 — 같은 계층의 메타 정보로 묶는다. */}
          {(club.centralClub || club.foundedYear !== null || club.cohortNumber !== null) && (
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              {club.centralClub && (
                <span className="pill pill-solid text-[11px]">🏛️ 중앙동아리</span>
              )}
              {(club.foundedYear !== null || club.cohortNumber !== null) && (
                <div className="min-w-0 text-[12px] text-charcoal-3">
                  {club.foundedYear !== null && `${club.foundedYear}년 창설`}
                  {club.foundedYear !== null && club.cohortNumber !== null && ' · '}
                  {club.cohortNumber !== null && `${club.cohortNumber}기`}
                </div>
              )}
            </div>
          )}

          {/* 이름 아래는 해시태그 — 소개 본문은 소개 탭에서만 보여준다(데스크탑 히어로와 동일 규칙). */}
          {club.tags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {club.tags.map((tagName) => (
                <span key={tagName} className="pill pill-outline bg-paper/60 text-[11px]">
                  #{tagName.replace(/^#+/, '')}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

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
