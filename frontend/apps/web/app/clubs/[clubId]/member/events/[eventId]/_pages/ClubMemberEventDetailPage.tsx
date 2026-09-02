'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatDateTimeKst, useClubEventDetailQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { TextLinesSkeleton } from '@/components/loading/Skeleton';

type Props = { clubId: number; eventId: number };

export function ClubMemberEventDetailPage() {
  const params = useParams<{ clubId: string; eventId: string }>();
  const clubId = params.clubId ? Number(params.clubId) : null;
  const eventId = params.eventId ? Number(params.eventId) : null;
  if (clubId === null || eventId === null) return null;

  return <ClubMemberEventDetail clubId={clubId} eventId={eventId} />;
}

function ClubMemberEventDetail({ clubId, eventId }: Props) {
  const { data, isLoading, isError } = useClubEventDetailQuery(clubId, eventId);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <TextLinesSkeleton lines={5} label="일정 불러오는 중" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-coral">일정을 불러오지 못했습니다.</p>
        <Link
          href={toRoute(`/clubs/${clubId}/member/events`)}
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
        href={toRoute(`/clubs/${clubId}/member/events`)}
        className="mb-4 inline-block text-sm text-charcoal-2 hover:text-ink"
      >
        ← 목록으로
      </Link>
      <h1 className="text-xl font-bold text-ink">{data.title}</h1>
      <p className="mt-2 text-sm text-charcoal-2">
        {formatDateTimeKst(data.startAt)} ~ {formatDateTimeKst(data.endAt)}
      </p>
      {data.location && <p className="mt-1 text-sm text-charcoal-3">📍 {data.location}</p>}
      {data.description && (
        <div className="mt-6 whitespace-pre-wrap text-sm text-charcoal-2">{data.description}</div>
      )}
      <p className="mt-8 text-xs text-charcoal-3">작성자 {data.createdBy.name}</p>
    </article>
  );
}
