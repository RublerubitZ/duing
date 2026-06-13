'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useNoticeDetailQuery } from '@duing/hooks';
import { ExploreNav } from '../../_components/ExploreNav';
import { NoticeArticleHeader } from '../_components/NoticeArticleHeader';
import { NoticePosterHero } from '../_components/NoticePosterHero';
import { NoticeContent } from '../_components/NoticeContent';
import { NoticeEventCard } from '../_components/NoticeEventCard';
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
  const router = useRouter();

  const detailQuery = useNoticeDetailQuery(noticeId);
  const notice = detailQuery.data;

  useEffect(() => {
    if (getStatus(detailQuery.error) === 403) {
      router.replace('/notices');
    }
  }, [detailQuery.error, router]);

  if (detailQuery.isLoading) {
    return (
      <div className="duing min-h-screen bg-cream">
        <ExploreNav active="공지" />
        <div className="max-w-[1120px] mx-auto px-10 py-16">
          <p className="text-charcoal-3 text-[13px]">불러오는 중…</p>
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !notice) {
    return (
      <div className="duing min-h-screen bg-cream">
        <ExploreNav active="공지" />
        <div className="max-w-[1120px] mx-auto px-10 py-16">
          <p className="text-coral text-[13px]">공지를 불러오지 못했습니다.</p>
        </div>
      </div>
    );
  }

  const expiredAndPast = notice.expiresAt !== null && new Date(notice.expiresAt) <= new Date();

  return (
    <div className="duing min-h-screen bg-cream">
      <ExploreNav active="공지" />
      <div className="max-w-[1120px] mx-auto px-10 pb-24">
        <NoticeArticleHeader
          category={notice.category}
          title={notice.title}
          pinned={notice.pinned}
          expiresAt={notice.expiresAt}
          createdAt={notice.createdAt}
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
            <NoticeContent content={notice.content} format={notice.contentFormat} />
          </article>

          <aside className="lg:sticky lg:top-24 flex flex-col gap-4 min-w-0">
            {notice.eventInfo ? (
              <NoticeEventCard eventInfo={notice.eventInfo} linkUrl={notice.linkUrl} />
            ) : (
              <NoticeMetaCard
                category={notice.category}
                createdAt={notice.createdAt}
                expiresAt={notice.expiresAt}
                tags={notice.tags}
                linkUrl={notice.linkUrl}
              />
            )}
            <NoticeShareCard />
            <RelatedNotices category={notice.category} currentId={notice.id} />
          </aside>
        </div>
      </div>
    </div>
  );
}
