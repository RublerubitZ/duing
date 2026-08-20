'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import Link from 'next/link';
import { useGlobalEventDetailQuery } from '@duing/hooks';
import type { CalEvent, EventSource } from '@duing/types';
import { useBackDismiss } from '@/app/_lib/backDismiss';
import { TextLinesSkeleton } from '@/components/loading/Skeleton';
import { KIND_LABEL } from '../_lib/calendarDisplay';
import { ImageWithFallback } from '../../_components/ImageWithFallback';
import { safeExternalHref, toRoute } from '../../_lib/route';

type Props = {
  event: CalEvent;
  open: boolean;
  onClose: () => void;
  /** 총동연은 동아리 회원 전용 화면에 들어갈 수 없어 원본 링크의 목적지가 달라진다. */
  isAdmin: boolean;
};

const sourcePath: Record<EventSource, (event: CalEvent, isAdmin: boolean) => `/${string}` | null> = {
  global: () => null, // 캘린더 모달 안에서 description + linkUrl 노출 — 별도 페이지 없음
  // 마감된 모집은 지원 페이지로 보내면 에러 화면을 만난다. 대신 동아리 소개로 보낸다 —
  // 지원은 못 해도 "어떤 동아리였는지"는 학생이 이어서 보고 싶어 하는 정보다.
  recruitment: (event) =>
    event.sourceClosed
      ? event.sourceClubId !== undefined
        ? `/clubs/${event.sourceClubId}`
        : null
      : `/apply/${event.sourceId}`,
  // 회원 전용 상세는 총동연에게 403 이다 — 총동연은 열람 권한이 있는 콘솔 동아리 상세로 보낸다.
  clubEvent: (event, isAdmin) =>
    event.sourceClubId !== undefined
      ? isAdmin
        ? `/admin/clubs/${event.sourceClubId}`
        : `/clubs/${event.sourceClubId}/member/events/${event.sourceId}`
      : null,
};

export function EventDetailModal({ event, open, onClose, isAdmin }: Props) {
  // PhotoLightbox 와 같은 방식 — 커스텀 룩은 그대로 두고 Radix 프리미티브만 재사용해
  // ESC·포커스 트랩·스크롤 잠금·aria-labelledby 를 얻는다. Root 를 직접 쓰므로
  // 뒤로가기 닫기(components/ui/dialog 의 Dialog 래퍼에 내장된 것)는 여기서 직접 건다.
  useBackDismiss(open, onClose);

  const rawPath = sourcePath[event.sourceType](event, isAdmin);
  const originPath = rawPath !== null ? toRoute(rawPath) : null;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[480px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-paper p-6 space-y-5 outline-none"
        >
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
            {/* Radix 가 이 Title(h2) 을 aria-labelledby 로 연결한다. */}
            <DialogPrimitive.Title className="text-[18px] font-bold text-ink leading-snug">
              {event.title}
            </DialogPrimitive.Title>
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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function GlobalDetailSection({ eventId }: { eventId: number }) {
  const detailQuery = useGlobalEventDetailQuery(eventId);

  if (detailQuery.isLoading) {
    return <TextLinesSkeleton lines={3} label="상세 정보 불러오는 중" className="pt-4" />;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return <p className="text-[13px] text-coral">상세 정보를 불러오지 못했습니다.</p>;
  }
  const detail = detailQuery.data;
  const safeLink = safeExternalHref(detail.linkUrl);
  return (
    <div className="space-y-3 pt-4">
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
      {safeLink && (
        <a
          href={safeLink}
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
