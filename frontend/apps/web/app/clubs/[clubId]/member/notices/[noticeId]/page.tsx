'use client';

import { use } from 'react';
import Link from 'next/link';
import { useNoticeDetailQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';

export default function MemberNoticeDetailPage({
  params,
}: { params: Promise<{ clubId: string; noticeId: string }> }) {
  const { clubId, noticeId: noticeIdParam } = use(params);
  const noticeId = Number(noticeIdParam);
  const { data: notice, isLoading, isError } = useNoticeDetailQuery(noticeId);

  if (isLoading) return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
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
        {new Date(notice.createdAt).toLocaleString('ko-KR')}
      </p>
      <div className="mt-6 whitespace-pre-wrap text-sm text-charcoal-2">{notice.content}</div>
    </article>
  );
}
