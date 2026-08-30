'use client';

import { useEffect } from 'react';

import {
  useApiClient,
  useClubDetailQuery,
  useClubPhotosQuery,
  useClubMembershipQuery,
} from '@duing/hooks';

import { captureEvent } from '@/app/_lib/analytics';
import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';
import { getVisitorKey } from '@/app/_lib/visitorKey';
import { TextLinesSkeleton } from '@/components/loading/Skeleton';

import { ClubContactCard } from '../_components/ClubContactCard';
import { ClubDetailApplyBar } from '../_components/ClubDetailApplyBar';
import { ClubDetailHero } from '../_components/ClubDetailHero';
import { ClubDetailStats } from '../_components/ClubDetailStats';
import { ClubDetailTabs } from '../_components/ClubDetailTabs';
import { ClubRecruitmentCard } from '../_components/ClubRecruitmentCard';
import { ClubRecruitmentSummary } from '../_components/ClubRecruitmentSummary';

export function ClubDetailPage({ clubId }: { clubId: number }) {
  const apiClient = useApiClient();
  const detail = useClubDetailQuery(clubId);
  const photos = useClubPhotosQuery(clubId);

  useEffect(() => {
    captureEvent('club_detail_viewed', { club_id: clubId });
  }, [clubId]);

  // 홈 "관심도가 높은 동아리" 집계용 조회 기록 — PostHog 이벤트를 대체하는 게 아니라, 서버가 정렬에
  // 쓸 집계를 따로 확보하는 경로다. 부수 신호라 실패해도 화면이 흔들려선 안 되므로 결과를 기다리지
  // 않고 삼킨다(오프라인·429·404 모두 조용히 지나간다).
  // 같은 사람이 같은 날 다시 들어온 경우의 중복 제거는 서버의 유니크 인덱스가 맡는다 —
  // 여기서 "이미 봤는지" 를 캐싱하면 서버 규칙과 두 벌이 되어 조용히 어긋난다.
  useEffect(() => {
    const visitorKey = getVisitorKey();
    if (!visitorKey) return;
    void apiClient.clubs.recordView(clubId, { visitorKey }).catch(() => {});
  }, [apiClient, clubId]);
  // 멤버에게만 공지/일정 탭을 노출한다. 비로그인 시 null 로 비활성화해 불필요한 요청을 막는다.
  const isAuthenticated = useSeededAuthStatus() === 'authenticated';
  const membership = useClubMembershipQuery(isAuthenticated ? clubId : null);

  if (detail.isLoading) {
    return (
      <div className="mx-auto max-w-layout px-6 py-10">
        <TextLinesSkeleton lines={8} label="동아리 정보 불러오는 중" />
      </div>
    );
  }
  if (!detail.data) {
    return <p className="p-6 text-sm text-coral">동아리를 찾을 수 없습니다.</p>;
  }

  const club = detail.data;

  return (
    <>
      <ClubDetailHero
        club={club}
        recruitmentDisplayStatus={club.activeRecruitment?.displayStatus}
      />

      <section className="bg-cream px-4 sm:px-6 md:px-10 pb-16">
        <div className="max-w-layout mx-auto grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px] lg:gap-12">
          <div>
            <div className="mb-6 md:mb-8">
              <ClubDetailStats club={club} />
            </div>
            {/* 모바일 전용 모집 요약 — 탭 위. 데스크탑은 우측 사이드바 풀 카드를 쓴다. */}
            <div className="mb-4 md:hidden">
              <ClubRecruitmentSummary recruitment={club.activeRecruitment ?? undefined} />
            </div>
            <ClubDetailTabs club={club} photos={photos.data ?? []} membership={membership.data ?? null} />
          </div>

          {/* lg:self-start 는 필수 — grid 기본 stretch 가 sticky 를 무력화한다(self-start 로 컬럼을 콘텐츠 높이로). */}
          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            {/* 풀 모집 카드는 데스크탑/태블릿 전용. 모바일은 위 요약 + 하단 지원 바로 대체. */}
            <div className="hidden md:block">
              <ClubRecruitmentCard recruitment={club.activeRecruitment ?? undefined} clubId={clubId} />
            </div>
            <ClubContactCard
              clubName={club.name}
              snsLinks={club.snsLinks}
              location={club.location}
              contactPhone={club.contactPhone}
              contactVisibility={club.contactVisibility}
            />
          </div>
        </div>
      </section>

      {/* 모바일 전용 하단 고정 지원 바 (md:hidden). 데스크탑은 우측 모집 카드를 그대로 쓴다. */}
      <ClubDetailApplyBar recruitment={club.activeRecruitment ?? undefined} />
    </>
  );
}
