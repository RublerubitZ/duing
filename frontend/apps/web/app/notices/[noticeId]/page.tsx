'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useNoticeDetailQuery } from '@duing/hooks';
import { TextLinesSkeleton } from '@/components/loading/Skeleton';
import { ExploreNav } from '../../_components/ExploreNav';
import { NoticeDetailTopBar } from '../_components/NoticeDetailTopBar';
import { NoticeArticleHeader } from '../_components/NoticeArticleHeader';
import { NoticePosterHero } from '../_components/NoticePosterHero';
import { NoticeContent } from '../_components/NoticeContent';
import { NoticeEventCard } from '../_components/NoticeEventCard';
import { NoticeEventSummary } from '../_components/NoticeEventSummary';
import { NoticeDetailLinkBar } from '../_components/NoticeDetailLinkBar';
import { NoticeMetaCard } from '../_components/NoticeMetaCard';
import { NoticeShareCard } from '../_components/NoticeShareCard';
import { RelatedNotices } from '../_components/RelatedNotices';
import { ExpiredBanner } from '../_components/ExpiredBanner';

function getStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

export default function NoticeDetailPage() {
  const params = useParams<{ noticeId: string }>();
  const noticeId = params.noticeId ? Number(params.noticeId) : null;
  const router = useGuardedRouter();

  const detailQuery = useNoticeDetailQuery(noticeId);
  const notice = detailQuery.data;

  useEffect(() => {
    if (getStatus(detailQuery.error) === 403) {
      router.replace('/notices');
    }
  }, [detailQuery.error, router]);

  if (detailQuery.isLoading) {
    return (
      <div className="duing min-h-dvh bg-cream">
        <ExploreNav slimOnMobile />
        <NoticeDetailTopBar />
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6 md:px-10 py-16">
          <TextLinesSkeleton lines={6} label="공지 불러오는 중" />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !notice) {
    return (
      <div className="duing min-h-dvh bg-cream">
        <ExploreNav slimOnMobile />
        <NoticeDetailTopBar />
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6 md:px-10 py-16">
          <p className="text-coral text-[13px]">공지를 불러오지 못했습니다.</p>
        </div>
      </div>
    );
  }

  const expiredAndPast = notice.expiresAt !== null && new Date(notice.expiresAt) <= new Date();

  return (
    <div className="duing min-h-dvh bg-cream">
      <ExploreNav slimOnMobile />
      <NoticeDetailTopBar />
      <div className="max-w-[1120px] mx-auto px-4 sm:px-6 md:px-10 pb-24">
        <NoticeArticleHeader
          category={notice.category}
          title={notice.title}
          pinned={notice.pinned}
          expiresAt={notice.expiresAt}
          createdAt={notice.createdAt}
          owningClubId={notice.owningClubId}
          clubName={notice.clubName}
        />

        {expiredAndPast && notice.expiresAt && (
          <div className="mt-6">
            <ExpiredBanner expiresAt={notice.expiresAt} />
          </div>
        )}

        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-12 pt-8 items-start">
          <article className="min-w-0">
            <NoticePosterHero
              coverImageUrl={notice.coverImageUrl}
              title={notice.title}
              summary={notice.summary}
            />
            {/* 모바일: 한눈에 보기(이벤트)를 본문 위로 끌어올림. 데스크탑은 우측 카드를 쓴다. */}
            {notice.eventInfo && (
              <NoticeEventSummary eventInfo={notice.eventInfo} className="mb-8 md:hidden" />
            )}
            <NoticeContent content={notice.content} format={notice.contentFormat} />
          </article>

          <aside className="lg:sticky lg:top-24 flex flex-col gap-4 min-w-0">
            {notice.eventInfo ? (
              <div className="hidden md:block">
                <NoticeEventCard eventInfo={notice.eventInfo} linkUrl={notice.linkUrl} />
              </div>
            ) : (
              <NoticeMetaCard
                category={notice.category}
                createdAt={notice.createdAt}
                expiresAt={notice.expiresAt}
                tags={notice.tags}
                linkUrl={notice.linkUrl}
              />
            )}
            {/* 공유 카드 — 모바일 삭제(상단 액션바로 공유). */}
            <div className="hidden md:block">
              <NoticeShareCard />
            </div>
            <RelatedNotices category={notice.category} currentId={notice.id} />
          </aside>
        </div>
      </div>

      {/* 모바일 전용 하단 고정 '자세히 보기' 바 — 외부 안내가 있는 이벤트 공지. 데스크탑은 우측 카드 버튼. */}
      {notice.eventInfo && (
        <NoticeDetailLinkBar eventInfo={notice.eventInfo} linkUrl={notice.linkUrl} />
      )}
    </div>
  );
}
