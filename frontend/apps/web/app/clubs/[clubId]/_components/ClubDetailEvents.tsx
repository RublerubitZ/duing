'use client';

// 동아리 상세 페이지의 멤버 전용 "일정" 탭 — 일정 미리보기(읽기 전용) + 전체 보기 링크.
// 작성/수정/삭제 관리는 /clubs/{clubId}/member/events 가 담당한다.

import Link from 'next/link';

import { kstDateTimeFormatter, parseKstInstant, useClubEventListQuery } from '@duing/hooks';

import { toRoute } from '@/app/_lib/route';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';

const PREVIEW_COUNT = 4;

type Props = { clubId: number };

// KST "MM.DD HH:mm" — 미리보기용 짧은 표기 구조 유지.
const WHEN_FORMATTER = kstDateTimeFormatter({
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function formatWhen(startIso: string): string {
  const formattedParts = WHEN_FORMATTER.formatToParts(parseKstInstant(startIso));
  const partValue = (partType: Intl.DateTimeFormatPartTypes): string =>
    formattedParts.find((part) => part.type === partType)?.value ?? '';
  return `${partValue('month')}.${partValue('day')} ${partValue('hour')}:${partValue('minute')}`;
}

export function ClubDetailEvents({ clubId }: Props) {
  const { data, isLoading } = useClubEventListQuery(clubId);
  const events = (data ?? []).slice(0, PREVIEW_COUNT);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-ink-deep">일정</h3>
        <Link
          href={toRoute(`/clubs/${clubId}/member/events`)}
          className="text-[13px] font-semibold text-charcoal-2 hover:text-ink"
        >
          전체 보기 →
        </Link>
      </div>

      {isLoading ? (
        <ListRowsSkeleton
          rows={3}
          rowClassName="h-[64px] rounded-xl"
          className="space-y-2"
          label="일정 불러오는 중"
        />
      ) : events.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-8 text-center text-sm text-charcoal-3">
          등록된 일정이 없어요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={toRoute(`/clubs/${clubId}/member/events/${event.id}`)}
                className="block rounded-xl border border-line bg-paper px-4 py-3 transition hover:border-ink"
              >
                <span className="line-clamp-1 font-semibold text-ink-deep">{event.title}</span>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-charcoal-3">
                  <span>{formatWhen(event.startAt)}</span>
                  {event.location && <span>· {event.location}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
