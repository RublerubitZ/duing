'use client';

import Link from 'next/link';
import { toRoute } from '@/app/_lib/route';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { rangeLabel } from '../../_lib/bookingCalendar';

const STEPS = ['신청 완료', '총동연 승인', '학교 확정'] as const;

type Props = {
  facilityName: string;
  date: string;
  range: SlotRange;
  overlappingPendingCount: number;
  // toRoute(`/${string}`) 계약에 맞춰 슬래시 프리픽스 경로만 받는다(로그인 링크 loginHref 전례와 동일).
  manageHref?: `/${string}`;
  onClose: () => void;
};

export function BookingSuccess({ facilityName, date, range, overlappingPendingCount, manageHref, onClose }: Props) {
  return (
    <div className="space-y-4">
      <ol className="grid grid-cols-3 gap-1" aria-label="예약 진행 단계">
        {STEPS.map((label, index) => (
          <li key={label} className="flex flex-col items-center gap-1 text-center">
            <span
              aria-hidden
              className={`h-2.5 w-2.5 rounded-full ${index === 0 ? 'bg-ink' : 'bg-graysoft'}`}
            />
            <span className={`text-[11px] ${index === 0 ? 'font-medium text-ink-deep' : 'text-charcoal-3'}`}>
              {label}
            </span>
          </li>
        ))}
      </ol>
      <div role="status" className="rounded-md border border-line bg-cream/60 px-3 py-3 text-sm">
        <p className="font-medium text-ink-deep">{facilityName} · {date} · {rangeLabel(range)}</p>
        <p className="mt-1 text-charcoal-2">
          신청이 접수됐어요. 총동연 승인과 학교 반영을 거쳐 최종 확정됩니다.
        </p>
        {overlappingPendingCount > 0 && (
          <p className="mt-1 text-xs text-coral">
            같은 시간에 다른 신청 {overlappingPendingCount}건이 함께 대기 중이에요 — 승인은 한 건에만 됩니다.
          </p>
        )}
      </div>
      {manageHref && (
        <Link href={toRoute(manageHref)} className="btn btn-secondary w-full">
          내 예약에서 확인
        </Link>
      )}
      <button type="button" className="btn btn-primary w-full" onClick={onClose}>확인</button>
    </div>
  );
}
