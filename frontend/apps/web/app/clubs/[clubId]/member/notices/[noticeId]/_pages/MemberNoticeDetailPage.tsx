'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatDateTimeKst, useClubNoticeDetailQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { TextLinesSkeleton } from '@/components/loading/Skeleton';
import { ImageWithFallback } from '@/app/_components/ImageWithFallback';
import { NoticeContent } from '@/app/notices/_components/NoticeContent';

type Props = { clubId: number; noticeId: number };

export function MemberNoticeDetailPage() {
  const params = useParams<{ clubId: string; noticeId: string }>();
  const clubId = params.clubId ? Number(params.clubId) : null;
  const noticeId = params.noticeId ? Number(params.noticeId) : null;
  if (clubId === null || noticeId === null) return null;

  return <MemberNoticeDetail clubId={clubId} noticeId={noticeId} />;
}

function MemberNoticeDetail({ clubId, noticeId }: Props) {
  const { data: notice, isLoading, isError } = useClubNoticeDetailQuery(clubId, noticeId);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <TextLinesSkeleton lines={6} label="공지 불러오는 중" />
      </div>
    );
  }
  if (isError || !notice) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-coral">공지를 불러오지 못했습니다.</p>
        <Link
          href={toRoute(`/clubs/${clubId}/member/notices`)}
          className="mt-4 inline-block text-sm text-ink"
        >
          ← 목록으로
        </Link>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href={toRoute(`/clubs/${clubId}/member/notices`)}
        className="mb-4 inline-block text-sm text-charcoal-2 hover:text-ink"
      >
        ← 목록으로
      </Link>
      <h1 className="text-xl font-bold text-ink">{notice.title}</h1>
      <p className="mt-2 text-xs text-charcoal-3">
        {formatDateTimeKst(notice.createdAt)}
      </p>
      {notice.coverImageUrl ? (
        <ImageWithFallback
          src={notice.coverImageUrl}
          alt={notice.title}
          className="mt-6 aspect-[16/9] w-full rounded-xl"
          errorMessage="표지를 불러올 수 없습니다"
        />
      ) : null}
      <div className="mt-6">
        <NoticeContent content={notice.content} format={notice.contentFormat} />
      </div>
    </article>
  );
}
