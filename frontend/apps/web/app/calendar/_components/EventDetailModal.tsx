'use client';

import Link from 'next/link';
import { useGlobalEventDetailQuery } from '@duing/hooks';
import type { CalEvent, EventSource } from '@duing/types';
import { ImageWithFallback } from '../../_components/ImageWithFallback';
import { toRoute } from '../../_lib/route';

type Props = {
  event: CalEvent;
  open: boolean;
  onClose: () => void;
};

const KIND_LABEL: Record<CalEvent['kind'], string> = {
  system: '행사·일정',
  deadline: '모집 마감',
  event: '동아리 일정',
};

const sourcePath: Record<EventSource, (event: CalEvent) => `/${string}` | null> = {
  global: () => null, // 캘린더 모달 안에서 description + linkUrl 노출 — 별도 페이지 없음
  recruitment: (event) => `/apply/${event.sourceId}`,
  clubEvent: (event) =>
    event.sourceClubId !== undefined
      ? `/clubs/${event.sourceClubId}/member/events/${event.sourceId}`
      : null,
};

export function EventDetailModal({ event, open, onClose }: Props) {
  if (!open) return null;

  const rawPath = sourcePath[event.sourceType](event);
  const originPath = rawPath !== null ? toRoute(rawPath) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-[480px] max-w-[92vw] rounded-2xl bg-paper p-6 space-y-5">
        <header className="flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-wider text-charcoal-3">
            {KIND_LABEL[event.kind]}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-charcoal-3 text-[20px]"
          >
            ×
          </button>
        </header>

        <div>
          <h2 className="text-[18px] font-bold text-ink leading-snug">{event.title}</h2>
          <p className="mt-2 text-[12.5px] text-charcoal-3 font-mono">
            {event.date} · {event.time}
          </p>
          {event.place && (
            <p className="mt-1 text-[13px] text-charcoal-2">📍 {event.place}</p>
          )}
          {event.club && (
            <p className="mt-1 text-[13px] text-charcoal-2">🏷 {event.club}</p>
          )}
        </div>

        {event.sourceType === 'global' && (
          <GlobalDetailSection eventId={event.sourceId} />
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full border border-line text-[13px] text-charcoal-2"
          >
            닫기
          </button>
          {originPath && (
            <Link
              href={originPath}
              className="px-4 py-2 rounded-full bg-ink text-paper text-[13px] font-semibold"
            >
              원본 보기
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function GlobalDetailSection({ eventId }: { eventId: number }) {
  const detailQuery = useGlobalEventDetailQuery(eventId);

  if (detailQuery.isLoading) {
    return <p className="text-[13px] text-charcoal-3">상세 정보를 불러오는 중…</p>;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return <p className="text-[13px] text-coral">상세 정보를 불러오지 못했습니다.</p>;
  }
  const detail = detailQuery.data;
  return (
    <div className="space-y-3 border-t border-line pt-4">
      {detail.coverImageUrl && (
        <ImageWithFallback
          src={detail.coverImageUrl}
          alt={detail.title}
          className="aspect-[16/9] rounded-lg overflow-hidden"
        />
      )}
      {detail.description && (
        <p className="text-[13.5px] text-charcoal whitespace-pre-wrap">{detail.description}</p>
      )}
      {detail.linkUrl && (
        <a
          href={detail.linkUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-[13px] text-ink font-semibold underline"
        >
          자세히 보기 ↗
        </a>
      )}
    </div>
  );
}
