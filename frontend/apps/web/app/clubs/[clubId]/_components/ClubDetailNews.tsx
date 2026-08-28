'use client';

// 동아리 상세 페이지의 멤버 전용 "소식" 탭 — 최근 공지 + 다가오는 일정 미리보기(읽기 전용)를
// 2컬럼으로 통합한다. 작성/수정/삭제 관리는 /clubs/{clubId}/member/notices · /events 가 담당한다.

import Link from 'next/link';

import {
  formatDateKst,
  formatTimeKst,
  kstDateTimeFormatter,
  parseKstInstant,
  todayKstDateString,
  useClubEventListQuery,
  useClubNoticeListQuery,
} from '@duing/hooks';

import { toRoute } from '@/app/_lib/route';
import { NOTICE_CATEGORY_LABEL } from '@/app/notices/_lib/categoryLabels';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';

const PREVIEW_COUNT = 4;

type Props = { clubId: number };

// KST 날짜 칸용 — 월·일·요일을 뽑는다. +180일 윈도우라 타월 일정 구분을 위해 월도 표기한다.
// 인스턴스 생성 비용이 있어 모듈 레벨에 둔다.
const EVENT_DATE_FORMATTER = kstDateTimeFormatter({ month: 'numeric', day: 'numeric', weekday: 'short' });

function eventDateBox(startIso: string): { month: string; day: string; weekday: string } {
  const formattedParts = EVENT_DATE_FORMATTER.formatToParts(parseKstInstant(startIso));
  const partValue = (partType: Intl.DateTimeFormatPartTypes): string =>
    formattedParts.find((part) => part.type === partType)?.value ?? '';
  return { month: partValue('month'), day: partValue('day'), weekday: partValue('weekday') };
}

const EMPTY_STATE_CLASS =
  'rounded-[14px] border border-dashed border-line py-8 text-center text-sm text-charcoal-3';

const CARD_CLASS =
  'block rounded-[14px] border border-line bg-white p-4 shadow-1 transition hover:border-ink';

function SectionHeader({ title, moreHref }: { title: string; moreHref: `/${string}` }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-base font-bold text-ink-deep">{title}</h3>
      <Link href={toRoute(moreHref)} className="text-[13px] font-semibold text-charcoal-2 hover:text-ink">
        전체 보기 →
      </Link>
    </div>
  );
}

function RecentNotices({ clubId }: Props) {
  const { data, isLoading } = useClubNoticeListQuery(clubId, 0);
  const notices = (data?.content ?? []).slice(0, PREVIEW_COUNT);

  return (
    <section>
      <SectionHeader title="최근 공지" moreHref={`/clubs/${clubId}/member/notices`} />

      {isLoading ? (
        <ListRowsSkeleton
          rows={3}
          rowClassName="h-[72px] rounded-[14px]"
          className="space-y-2"
          label="공지 불러오는 중"
        />
      ) : notices.length === 0 ? (
        <p className={EMPTY_STATE_CLASS}>등록된 공지가 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notices.map((notice) => (
            <li key={notice.id}>
              <Link href={toRoute(`/clubs/${clubId}/member/notices/${notice.id}`)} className={CARD_CLASS}>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded-full bg-graysoft px-2 py-0.5 text-[11px] font-semibold text-charcoal-2">
                    {NOTICE_CATEGORY_LABEL[notice.category]}
                  </span>
                  {notice.pinned && (
                    <span className="shrink-0 rounded-full bg-warm/20 px-2 py-0.5 text-[11px] font-semibold text-warm">
                      고정
                    </span>
                  )}
                  <span className="line-clamp-1 font-semibold text-ink-deep">{notice.title}</span>
                </div>
                <div className="mt-2 text-[12px] text-charcoal-3">{formatDateKst(notice.createdAt)}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function UpcomingEvents({ clubId }: Props) {
  // BE 기본 윈도우는 오늘−30일~+180일 + startAt ASC 라 오늘(KST) 기준 from 을 넘겨야
  // "다가오는 일정" 라벨과 데이터가 일치한다(지난 일정 우선 노출 방지).
  const { data, isLoading } = useClubEventListQuery(clubId, { from: todayKstDateString(new Date()) });
  const events = (data ?? []).slice(0, PREVIEW_COUNT);

  return (
    <section>
      <SectionHeader title="다가오는 일정" moreHref={`/clubs/${clubId}/member/events`} />

      {isLoading ? (
        <ListRowsSkeleton
          rows={3}
          rowClassName="h-[72px] rounded-[14px]"
          className="space-y-2"
          label="일정 불러오는 중"
        />
      ) : events.length === 0 ? (
        <p className={EMPTY_STATE_CLASS}>등록된 일정이 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => {
            const { month, day, weekday } = eventDateBox(event.startAt);
            return (
              <li key={event.id}>
                <Link
                  href={toRoute(`/clubs/${clubId}/member/events/${event.id}`)}
                  className={`flex items-center gap-4 ${CARD_CLASS}`}
                >
                  <div className="flex w-10 shrink-0 flex-col items-center">
                    <span className="text-[11px] leading-none text-charcoal-3">{month}월</span>
                    <span className="mt-0.5 text-xl font-bold leading-none text-ink-deep">{day}</span>
                    <span className="mt-0.5 text-[11px] text-charcoal-3">{weekday}</span>
                  </div>
                  <div className="h-9 w-px shrink-0 bg-line" aria-hidden />
                  <div className="min-w-0">
                    <span className="line-clamp-1 font-semibold text-ink-deep">{event.title}</span>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-charcoal-3">
                      <span>{formatTimeKst(event.startAt)}</span>
                      {event.location && <span>· {event.location}</span>}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function ClubDetailNews({ clubId }: Props) {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
      <RecentNotices clubId={clubId} />
      <UpcomingEvents clubId={clubId} />
    </div>
  );
}
