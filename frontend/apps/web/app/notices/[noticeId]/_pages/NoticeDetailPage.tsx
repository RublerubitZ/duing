'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useNoticeDetailQuery } from '@duing/hooks';
import { TextLinesSkeleton } from '@/components/loading/Skeleton';
import { NoticeDetailTopBar } from '../../_components/NoticeDetailTopBar';
import { NoticeArticleHeader } from '../../_components/NoticeArticleHeader';
import { NoticePosterHero } from '../../_components/NoticePosterHero';
import { NoticeContent } from '../../_components/NoticeContent';
import { NoticeEventCard } from '../../_components/NoticeEventCard';
import { NoticeEventSummary } from '../../_components/NoticeEventSummary';
import { NoticeDetailLinkBar } from '../../_components/NoticeDetailLinkBar';
import { NoticeMetaCard } from '../../_components/NoticeMetaCard';
import { NoticeShareCard } from '../../_components/NoticeShareCard';
import { RelatedNotices } from '../../_components/RelatedNotices';
import { ExpiredBanner } from '../../_components/ExpiredBanner';

function getStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

export function NoticeDetailPage() {
  const params = useParams<{ noticeId: string }>();
  const noticeId = params.noticeId ? Number(params.noticeId) : null;
  const router = useGuardedRouter();

  const detailQuery = useNoticeDetailQuery(noticeId);
  const notice = detailQuery.data;

  // 볼 수 없는 공지는 서버가 미존재와 같은 404 로 답한다(열거 방지) — 404·403 을 같은 "목록으로
  // 돌려보내기"로 처리한다. 403 은 서버 배포 전 잔존 응답과 향후 다른 거부 경로를 위해 남긴다.
  useEffect(() => {
    const status = getStatus(detailQuery.error);
    if (status === 403 || status === 404) {
      router.replace('/notices');
    }
  }, [detailQuery.error, router]);

  // 세 분기 모두 크림 캔버스(duing min-h-lvh bg-cream)와 ExploreNav 는 notices/layout.tsx 가 렌더한다
  // — 로딩 경계 밖에서 유지되도록. ExploreNav 는 상세 경로에서 스스로 모바일 숨김을 판단한다(pathname 기반).
  // 최상위는 fragment 가 아닌 정적 div — 첫 요소가 sticky 면 라우터 자동 스크롤 기준에서 제외된다.
  if (detailQuery.isLoading) {
    return (
      <div>
        <NoticeDetailTopBar />
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6 md:px-10 py-16">
          <TextLinesSkeleton lines={6} label="공지 불러오는 중" />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !notice) {
    return (
      <div>
        <NoticeDetailTopBar />
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6 md:px-10 py-16">
          <p className="text-coral text-[13px]">공지를 불러오지 못했습니다.</p>
        </div>
      </div>
    );
  }

  const expiredAndPast = notice.expiresAt !== null && new Date(notice.expiresAt) <= new Date();

  return (
    <div>
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
