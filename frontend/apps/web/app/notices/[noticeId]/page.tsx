'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useNoticeDetailQuery } from '@duing/hooks';
import { ExploreNav } from '../../_components/ExploreNav';
import { NoticeDetailHeader } from '../_components/NoticeDetailHeader';
import { NoticeMarkdown } from '../_components/NoticeMarkdown';
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

  useEffect(() => {
    if (getStatus(detailQuery.error) === 403) {
      router.replace('/notices');
    }
  }, [detailQuery.error, router]);

  if (detailQuery.isLoading) {
    return (
      <>
        <ExploreNav active="공지" />
        <main className="max-w-[760px] mx-auto px-6 py-10">
          <p className="text-charcoal-3 text-[13px]">불러오는 중…</p>
        </main>
      </>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <>
        <ExploreNav active="공지" />
        <main className="max-w-[760px] mx-auto px-6 py-10">
          <p className="text-red-500 text-[13px]">공지를 불러오지 못했습니다.</p>
        </main>
      </>
    );
  }

  const notice = detailQuery.data;
  const expiredAndPast = notice.expiresAt !== null && new Date(notice.expiresAt) <= new Date();
  const publishedDate = new Date(notice.createdAt).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <>
      <ExploreNav active="공지" />
      <main className="max-w-[760px] mx-auto px-6 py-10">
        <NoticeDetailHeader category={notice.category} />
        {expiredAndPast && notice.expiresAt && (
          <div className="mb-6">
            <ExpiredBanner expiresAt={notice.expiresAt} />
          </div>
        )}
        <article>
          <div className="relative aspect-[16/9] rounded-2xl overflow-hidden bg-graysoft mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- 외부 URL (Supabase Storage). next/image 도메인 화이트리스트는 후속 PR. */}
            <img
              src={notice.coverImageUrl}
              alt={notice.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
          <h1 className="text-[22px] font-bold text-ink leading-snug">{notice.title}</h1>
          <p className="mt-2 text-[12.5px] text-charcoal-3">{publishedDate}</p>
          {notice.summary && (
            <p className="mt-4 text-[14px] text-charcoal-2 leading-relaxed">{notice.summary}</p>
          )}
          <div className="mt-6">
            <NoticeMarkdown content={notice.content} />
          </div>
          {notice.linkUrl && (
            <a
              href={notice.linkUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-ink text-paper text-[13.5px] font-semibold"
            >
              자세히 보기 →
            </a>
          )}
        </article>
      </main>
    </>
  );
}
