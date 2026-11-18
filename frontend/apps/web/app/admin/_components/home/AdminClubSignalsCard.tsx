'use client';

import Link from 'next/link';
import { ApiError } from '@duing/api';
import { useAdminClubSignalsQuery } from '@duing/hooks';
import type { AdminClubSignals } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { DASHBOARD_CHIP_TONE_CLASS } from '@/components/dashboard/dashboardChipTone';

import { signalListHref } from '../../clubs/_lib/clubSignals';
import { CLUB_SIGNALS_TEXT, contactSignalRows, usageSignalRows } from './adminClubSignalsPresentation';

import type { ContactSignalRow, UsageSignalRow } from './adminClubSignalsPresentation';
import { ChevronRight } from 'lucide-react';

// 카드 푸터 링크 전례(AdminFeeAuditCard·AdminSchoolSyncCard) — 터치 높이 44px, 밝은 카드라 포커스 링은 ink(sage 는 대비 미달).
const TEXT_LINK_CLASS =
  'inline-flex min-h-11 items-center rounded text-xs font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';
// 행 이름은 줄바꿈되고 숫자는 줄지 않는다 — flex 안 break-keep 은 min-w-0 이 있어야 듣는다.
const ROW_NAME_CLASS = 'min-w-0 flex-1 break-keep text-sm font-medium text-charcoal';
const ROW_COUNT_CLASS = 'shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-ink';

/** 총동연 홈 동아리 현황 — ① 운영진에게 알릴 일, ② 두잉 사용 현황(참고). 경고색을 쓰지 않는다(동아리 신호 스펙 §8-2). */
export function AdminClubSignalsCard() {
  const clubSignalsQuery = useAdminClubSignalsQuery();
  const clubSignals = clubSignalsQuery.data;
  // 404 는 집계 API 를 모르는 옛 백엔드다 — 카드를 그리지 않는다(대기 칸의 "모르는 옛 백엔드면 칸을 그리지 않는다" 선례).
  if (clubSignalsQuery.error instanceof ApiError && clubSignalsQuery.error.status === 404) return null;

  return (
    <DashboardCard
      title={CLUB_SIGNALS_TEXT.title}
      badge={
        clubSignals ? (
          <span className={cn('shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', DASHBOARD_CHIP_TONE_CLASS.info)}>
            운영 중 {clubSignals.activeClubCount}곳
          </span>
        ) : undefined
      }
      // 로딩 = 아직 data 가 없고 실패도 아님(오프라인으로 멈춘 조회 포함) — 회비 감사 카드와 같다.
      isLoading={clubSignals === undefined && !clubSignalsQuery.isError}
      isError={clubSignalsQuery.isError}
      isEmpty={!clubSignals}
    >
      {clubSignals ? <ClubSignalsBody clubSignals={clubSignals} now={new Date()} /> : null}
    </DashboardCard>
  );
}

function ClubSignalsBody({ clubSignals, now }: { clubSignals: AdminClubSignals; now: Date }) {
  const contactRows = contactSignalRows(clubSignals, now);
  const hasContactSignal = contactRows.some((row) => row.clubCount > 0);
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="break-keep text-xs font-semibold text-charcoal">{CLUB_SIGNALS_TEXT.contactHeading}</h3>
        {hasContactSignal ? (
          <>
            <p className="mt-0.5 break-keep text-xs text-charcoal-3">{CLUB_SIGNALS_TEXT.contactGuide}</p>
            <ul className="mt-1 flex flex-col">
              {contactRows.map((row) => (
                <ContactSignalItem key={row.signal} row={row} />
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-1 break-keep text-sm text-charcoal-2">{CLUB_SIGNALS_TEXT.contactNone}</p>
        )}
      </section>
      <section>
        <h3 className="break-keep text-xs font-semibold text-charcoal">{CLUB_SIGNALS_TEXT.usageHeading}</h3>
        <p className="mt-0.5 break-keep text-xs text-charcoal-3">{CLUB_SIGNALS_TEXT.usageGuide}</p>
        {clubSignals.activeClubCount === 0 ? (
          <p className="mt-1 break-keep text-sm text-charcoal-2">{CLUB_SIGNALS_TEXT.usageNoActiveClub}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {usageSignalRows(clubSignals).map((row) => (
              <UsageSignalItem key={row.signal} row={row} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** ① 행 — 0곳이 아니면 행 전체가 신호 목록 링크(44px 이상), "›" 는 읽지 않는다. 0곳이면 "없음"만 쓰고 링크를 걸지 않는다. */
function ContactSignalItem({ row }: { row: ContactSignalRow }) {
  if (row.clubCount === 0) {
    return (
      <li className="flex min-h-11 items-center gap-2">
        <span className={ROW_NAME_CLASS}>{row.name}</span>
        <span className="shrink-0 whitespace-nowrap text-sm text-charcoal-3">{CLUB_SIGNALS_TEXT.contactRowNone}</span>
      </li>
    );
  }
  return (
    <li>
      <Link
        href={toRoute(signalListHref(row.signal))}
        className="-mx-2 flex min-h-11 flex-col justify-center rounded-md px-2 py-1.5 hover:bg-graysoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
      >
        <span className="flex items-baseline gap-2">
          <span className={ROW_NAME_CLASS}>{row.name}</span>
          <span className={ROW_COUNT_CLASS}>
            {row.clubCount}곳 <ChevronRight size={14} aria-hidden="true" className="inline-block align-[-2px]" />
          </span>
        </span>
        {row.detailLines.map((line) => (
          <span key={line} className="block break-keep text-xs text-charcoal-3">
            {line}
          </span>
        ))}
      </Link>
    </li>
  );
}

/** ② 행 — 숫자는 양수 표기, 신호에 걸린 곳은 보조 줄 아래 줄 왼쪽 글자 링크(0 이면 완료 문구). 어떤 경우에도 중립색. */
function UsageSignalItem({ row }: { row: UsageSignalRow }) {
  return (
    <li className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className={ROW_NAME_CLASS}>{row.name}</span>
        <span className={ROW_COUNT_CLASS}>{row.countText}</span>
      </div>
      {row.caption ? <p className="break-keep text-xs text-charcoal-3">{row.caption}</p> : null}
      {row.linkText ? (
        <Link href={toRoute(signalListHref(row.signal))} className={TEXT_LINK_CLASS}>
          {row.linkText}
        </Link>
      ) : (
        <p className="flex min-h-11 items-center text-xs text-charcoal-3">{row.doneText}</p>
      )}
    </li>
  );
}
