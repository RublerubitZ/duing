'use client';

import { useState } from 'react';
import type { ClubDetail, RecruitmentDisplayStatus } from '@duing/types';
import { useAuthStore } from '@duing/stores';
import { ReportModal } from '@/components/report/ReportModal';
import { cn } from '@/app/_lib/cn';
import { ClubLogo } from '@/app/_components/ClubLogo';
import { displayStatusLabel } from '../../../_lib/recruitmentDisplay';
import { collegeDisplayName } from '../../../_lib/college';
import { clubCategoryLabel } from '../_lib/clubCategoryLabel';
import { formatDivisionLabel } from '../../_lib/clubs';
import { pickColor } from '../../_lib/clubAdapter';
import { ClubDetailTopBar } from './ClubDetailTopBar';

type Props = {
  club: ClubDetail;
  /** 활성 모집의 displayStatus. 모집이 없으면 undefined. */
  recruitmentDisplayStatus?: RecruitmentDisplayStatus;
};

export function ClubDetailHero({ club, recruitmentDisplayStatus }: Props) {
  const categoryLabel = clubCategoryLabel(club.category);
  // 소속 보조 표기 — 중앙은 분과, 단과대는 학과. 비중앙 행의 division 은 단과대명·분과명이 섞인
  // 잔여 데이터라 centralClub 게이트로 함께 막는다(탐색 카드와 같은 규칙).
  const affiliation = club.centralClub ? club.division : club.department;
  // 모바일 히어로용 소속 조각 — 데스크탑은 카테고리 pill 옆이라 짧게(분과/학과) 두지만,
  // 모바일에는 소속을 보여줄 자리가 여기뿐이라 단과대 동아리는 단과대학까지 함께 밝힌다.
  // 값이 없는 조각은 통째로 빠지고, 전부 없으면 소속 표기 자체를 그리지 않는다.
  const affiliationParts = (
    club.centralClub
      ? [club.division && formatDivisionLabel(club.division)]
      : [club.college != null && collegeDisplayName(club.college), club.department]
  ).filter((part): part is string => typeof part === 'string' && part.length > 0);
  const initial = club.name.trim().charAt(0);
  // 로고 없는 동아리의 로고박스 배경 — 카드/리스트와 동일 색을 써 모핑 중 배경 점프를 없앤다.
  const logoColor = pickColor(club.id);
  const authStatus = useAuthStore((state) => state.status);
  const isAuthenticated = authStatus === 'authenticated';

  const [reportOpen, setReportOpen] = useState(false);

  // 모바일 이름 뒤 중앙동아리 아이콘용 — 마지막 글자와 아이콘을 한 덩어리로 묶어야
  // 이름이 여러 줄로 접힐 때 아이콘만 다음 줄에 남는 것을 막을 수 있다.
  const nameChars = Array.from(club.name);
  const nameHead = nameChars.slice(0, -1).join('');
  const nameTail = nameChars.at(-1) ?? '';

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
                    {affiliation ? ` · ${affiliation}` : ''}
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
          {/* 로고 · 동아리명 한 행 — 이름이 행 폭을 다 쓰도록 신고하기는 아래 메타 행으로 내렸다. */}
          <div className="flex items-center gap-3">
            <div
              // 로고 1/3만 커버에 걸침 — 히어로 프로필 규칙(편집 폼·Preview와 통일).
              // 겹침 마진과 self-start 를 행이 아닌 로고에 두는 게 핵심 — 행은 커버 아래에서
              // 시작해 이름이 몇 줄이든 아래로만 자라고, 로고 걸침 폭은 줄 수와 무관하게 일정하다.
              className={cn(
                'relative grid h-20 w-20 shrink-0 self-start place-items-center overflow-hidden rounded-[22px] border-[3px] border-white text-white shadow-lg',
                club.coverUrl ? '-mt-6' : 'mt-1',
              )}
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
            {/* break-keep+anywhere: 한글은 어절 단위로 접고, 공백 없는 긴 이름(라틴·괄호)은
                글자 단위로 쪼개 잘림을 막는다. 글꼴 확대(OS 접근성 설정) 상태까지 방어. */}
            <h1 className="min-w-0 text-[28px] leading-[1.15] tracking-tightx break-keep [overflow-wrap:anywhere]">
              {/* 중앙동아리는 칩 대신 이름 뒤 은은한 체크 아이콘으로만 표시 — 없으면 단과대/일반. */}
              {club.centralClub ? (
                <>
                  {nameHead}
                  <span className="whitespace-nowrap">
                    {nameTail}
                    <VerifiedIcon />
                    <span className="sr-only"> 중앙동아리</span>
                  </span>
                </>
              ) : (
                club.name
              )}
            </h1>
          </div>

          {/* 소속·창설년도·기수(좌) 와 신고하기(우) 한 행 — 이름 행 폭을 비워 긴 동아리명을 살린다.
              소속까지 얹으면 좁은 화면에서 두 줄로 접히므로 items-start 로 신고하기를 첫 줄에 붙인다. */}
          {(affiliationParts.length > 0
            || club.foundedYear !== null
            || club.cohortNumber !== null
            || isAuthenticated) && (
            <div className="mt-2.5 flex items-start gap-3">
              {(affiliationParts.length > 0
                || club.foundedYear !== null
                || club.cohortNumber !== null) && (
                <div className="min-w-0 text-[12px] text-charcoal-3">
                  {[
                    ...affiliationParts,
                    club.foundedYear !== null ? `${club.foundedYear}년 창설` : null,
                    club.cohortNumber !== null ? `${club.cohortNumber}기` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-charcoal-3 underline-offset-2 hover:text-coral hover:underline"
                >
                  <FlagIcon />
                  신고하기
                </button>
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

/** 중앙동아리 표시 아이콘 — 이름 톤에 묻히도록 muted 색·소형(옆 텍스트 대비 튀지 않게). */
function VerifiedIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="ml-1.5 inline-block h-[17px] w-[17px] align-[-1.5px] text-charcoal-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="m8 12.2 2.7 2.7L16 9.6" />
    </svg>
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
