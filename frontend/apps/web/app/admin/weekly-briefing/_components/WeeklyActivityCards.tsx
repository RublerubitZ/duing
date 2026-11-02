import Link from 'next/link';

import { addDaysIso } from '@duing/hooks';

import { toRoute } from '@/app/_lib/route';

import { ACTIVITY_DRIFT_LINE, PROFILE_CHECK_RECORDED_SINCE, deltaOf } from '../_lib/weeklyBriefingPresentation';
import { DeltaText } from './DeltaText';

import type { ReactNode } from 'react';
import type { AdminWeeklyBriefing } from '@duing/types';

type ActivityRow = {
  label: string;
  note?: string;
  /** null 이면 그 주에는 셀 수 없는 값 — "—" 와 unavailableText(스크린리더) */
  value: number | null;
  previous: number | null | undefined;
  unit: '건' | '곳' | '명';
  unavailableText?: string;
};

type Props = { weekStart: string; briefing: AdminWeeklyBriefing; previous: AdminWeeklyBriefing | null };

/** 카드 3개(모집·회비·공지·정보 확인) — xl 부터 가로 셋, 그 아래는 한 줄씩. */
export function WeeklyActivityCards({ weekStart, briefing, previous }: Props) {
  const isBeforeProfileCheck = weekStart < PROFILE_CHECK_RECORDED_SINCE;
  const isPreviousBeforeProfileCheck = addDaysIso(weekStart, -7) < PROFILE_CHECK_RECORDED_SINCE;
  return (
    <div className="mt-6">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <ActivityCard
          title="모집"
          rows={[
            { label: '새로 등록한 모집', value: briefing.recruitment.createdCount, previous: previous?.recruitment.createdCount, unit: '건' },
            { label: '모집 기간이 끝난 모집', value: briefing.recruitment.endedCount, previous: previous?.recruitment.endedCount, unit: '건' },
            { label: '제출된 지원서', value: briefing.recruitment.applicationCount, previous: previous?.recruitment.applicationCount, unit: '건' },
          ]}
        />
        <ActivityCard
          title="회비"
          rows={[
            { label: '회원 청구', value: briefing.fee.billCount, previous: previous?.fee.billCount, unit: '건' },
            { label: '청구한 동아리', value: briefing.fee.billedClubCount, previous: previous?.fee.billedClubCount, unit: '곳' },
            {
              label: '회원 납부 기록',
              note: '입력한 날 기준, 나중에 정정된 납부 포함',
              value: briefing.fee.paymentCount,
              previous: previous?.fee.paymentCount,
              unit: '건',
            },
            { label: '납부 정정', value: briefing.fee.voidedPaymentCount, previous: previous?.fee.voidedPaymentCount, unit: '건' },
            {
              label: '입금 계좌를 바꾸거나 지운 동아리',
              value: briefing.fee.accountChangedClubCount,
              previous: previous?.fee.accountChangedClubCount,
              unit: '곳',
            },
          ]}
        />
        <ActivityCard
          title="공지·정보 확인"
          rows={[
            { label: '총동연 공지', value: briefing.federationNoticeCount, previous: previous?.federationNoticeCount, unit: '건' },
            {
              label: '학기 정보 확인 완료',
              note: '가입·프로필 저장 포함',
              value: isBeforeProfileCheck ? null : briefing.profileCheckConfirmedCount,
              previous: isPreviousBeforeProfileCheck ? null : previous?.profileCheckConfirmedCount,
              unit: '명',
              unavailableText: '이 기능이 생기기 전이에요',
            },
          ]}
          footer={
            <Link
              href={toRoute('/admin/profile-check')}
              className="inline-flex min-h-11 items-center rounded text-xs font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              정보 확인 팝업
            </Link>
          }
        />
      </div>
      <p className="mt-2 break-keep text-xs text-charcoal-3">{ACTIVITY_DRIFT_LINE}</p>
    </div>
  );
}

function ActivityCard({ title, rows, footer }: { title: string; rows: ActivityRow[]; footer?: ReactNode }) {
  return (
    <section aria-label={title} className="card p-4 print:break-inside-avoid">
      <h3 className="text-sm font-semibold text-charcoal">{title}</h3>
      <dl className="mt-2 space-y-2 text-sm">
        {rows.map((row) => {
          const delta = row.value === null ? null : deltaOf(row.value, row.previous, row.unit);
          return (
            <div key={row.label} className="flex items-start justify-between gap-3">
              <dt className="min-w-0 break-keep text-charcoal-2">
                {row.label}
                {row.note ? <span className="block text-xs text-charcoal-3">({row.note})</span> : null}
              </dt>
              <dd className="shrink-0 text-right tabular-nums">
                {row.value === null ? (
                  <>
                    <span aria-hidden>—</span>
                    <span className="sr-only">{row.unavailableText}</span>
                  </>
                ) : (
                  <span className="font-semibold text-charcoal">{`${row.value}${row.unit}`}</span>
                )}
                {delta ? <DeltaText delta={delta} /> : null}
              </dd>
            </div>
          );
        })}
      </dl>
      {footer ? <div className="mt-2">{footer}</div> : null}
    </section>
  );
}
