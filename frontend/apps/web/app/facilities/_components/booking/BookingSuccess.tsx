'use client';

import Link from 'next/link';
import { toRoute } from '@/app/_lib/route';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { rangeLabel } from '../../_lib/bookingCalendar';

type TimelineState = 'done' | 'current' | 'todo';

type Props = {
  facilityName: string;
  date: string;
  range: SlotRange;
  overlappingPendingCount: number;
  submittedAt: string; // 제출 일시 라벨('M월 d일 HH:mm') — 페이지가 제출 시각 캡처
  manageHref?: `/${string}`;
  onExploreOther: () => void;
  onClose: () => void;
};

const TIMELINE: { title: string; detail: string; state: TimelineState }[] = [
  { title: '신청 접수', detail: '', state: 'done' }, // detail 은 렌더 시 submittedAt 로 대체
  { title: '관리자 승인 대기', detail: '관리자 승인 후 학교 반영 절차가 진행됩니다.', state: 'current' },
  { title: '학교 예약 시스템 반영', detail: '승인 후 진행돼요.', state: 'todo' },
  { title: '예약 확정', detail: '학교 반영 확인 후 확정돼요.', state: 'todo' },
];

export function BookingSuccess({
  facilityName, date, range, overlappingPendingCount, submittedAt, manageHref, onExploreOther, onClose,
}: Props) {
  return (
    <div className="space-y-4">
      <div role="status" className="rounded-md border border-line bg-cream/60 px-3 py-3 text-sm">
        <p className="font-medium text-ink-deep">{facilityName} · {date} · {rangeLabel(range)}</p>
        <p className="mt-1 text-charcoal-2">예약 신청이 접수됐어요.</p>
        {overlappingPendingCount > 0 && (
          <p className="mt-1 text-xs text-coral">
            같은 시간에 다른 신청 {overlappingPendingCount}건이 함께 대기 중이에요 — 승인은 한 건에만 돼요.
          </p>
        )}
      </div>

      <ol aria-label="승인 진행 타임라인">
        {TIMELINE.map((item, index) => {
          const isLast = index === TIMELINE.length - 1;
          return (
            <li key={item.title} className="flex gap-3">
              <span className="flex flex-col items-center">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    item.state === 'done' ? 'bg-ink text-cream'
                    : item.state === 'current' ? 'border-2 border-warm bg-[#FBEFD7] text-[#8E6620]'
                    : 'bg-graysoft text-charcoal-3'
                  }`}
                >
                  {item.state === 'done' ? '✓' : index + 1}
                </span>
                {!isLast && <span aria-hidden className={`w-[2px] flex-1 ${item.state === 'done' ? 'bg-ink' : 'bg-line'}`} />}
              </span>
              <div className={isLast ? '' : 'pb-4'}>
                <p className={`text-sm font-bold ${item.state === 'current' ? 'text-ink-deep' : item.state === 'done' ? 'text-charcoal' : 'text-charcoal-3'}`}>
                  {item.title}
                </p>
                <p className="mt-0.5 text-xs text-charcoal-3">
                  {index === 0 ? `${submittedAt} 접수` : item.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="rounded-md bg-sage-mist px-3 py-2 text-xs leading-relaxed text-ink-deep">
        같은 시간에 다른 신청이 들어올 수 있어요 — 승인은 한 건에만 돼요.
      </p>

      <div className="flex flex-col gap-2">
        {manageHref && (
          <Link href={toRoute(manageHref)} className="btn btn-primary w-full">내 예약에서 확인</Link>
        )}
        <button type="button" className="btn btn-secondary w-full" onClick={onExploreOther}>다른 시설 예약하기</button>
        <button type="button" className="btn btn-ghost w-full" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
