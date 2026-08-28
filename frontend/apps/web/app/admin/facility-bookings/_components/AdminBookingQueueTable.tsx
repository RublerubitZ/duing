'use client';

import { formatDateTimeKst } from '@duing/hooks';
import type { AdminFacilityBookingSummary } from '@duing/types';
import { bookingDateLabel, bookingTimeLabel } from '@/app/_lib/bookingDisplay';
import { BookingStatusBadge } from '@/app/_components/BookingStatusBadge';
import { requestAgeLabel } from '../_lib/adminBookingDisplay';

type Props = {
  rows: AdminFacilityBookingSummary[];
  onSelect: (bookingId: number) => void;
};

/**
 * 승인 큐 그리드 테이블(개편 스펙 §2) — 번호·신청 시각·경과를 한 줄에 담아 검토 판단 정보를 목록에서 끝낸다.
 * 행 전체 클릭 = 검토 진입, '검토' 버튼은 발견성·키보드 접근용 동일 동작.
 */
export function AdminBookingQueueTable({ rows, onSelect }: Props) {
  const now = new Date();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] text-left text-sm">
        <thead>
          <tr className="bg-graysoft text-[11.5px] font-bold tracking-[0.03em] text-charcoal-3">
            <th className="px-[18px] py-2.5 font-bold">신청번호</th>
            <th className="py-2.5 pr-3.5 font-bold">동아리 · 목적</th>
            <th className="py-2.5 pr-3.5 font-bold">시설</th>
            <th className="py-2.5 pr-3.5 font-bold">이용 일시</th>
            <th className="py-2.5 pr-3.5 font-bold">상태</th>
            <th className="py-2.5 pr-[18px] text-right font-bold">처리</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const ageLabel = requestAgeLabel(row.createdAt, now);
            return (
              <tr
                key={row.bookingId}
                onClick={() => onSelect(row.bookingId)}
                className={`cursor-pointer border-b border-line align-middle last:border-b-0 motion-safe:transition-colors ${
                  row.status === 'CONFLICT' ? 'bg-[#FDF1EC] hover:bg-[#FCE9E1]' : 'hover:bg-graysoft/50'
                }`}
              >
                <td className="whitespace-nowrap px-[18px] py-[13px] tabular-nums text-xs font-bold text-ink-deep">
                  #{row.bookingId}
                </td>
                <td className="py-[13px] pr-3.5">
                  <p className="text-sm font-bold text-ink-deep">{row.clubName}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-charcoal-3">
                    <span className="max-w-[14rem] truncate">{row.purpose}</span>
                    {row.attendeeCount !== undefined && (
                      <span className="whitespace-nowrap">· {row.attendeeCount}명</span>
                    )}
                    {row.conflictSuspected && <span className="pill pill-coral !px-2 !py-0.5">충돌 의심</span>}
                    {row.partiallyMatched && <span className="pill pill-warm !px-2 !py-0.5">부분 반영</span>}
                  </p>
                </td>
                <td className="whitespace-nowrap py-[13px] pr-3.5 text-[13px] font-semibold text-charcoal-2">
                  {row.roomName}
                </td>
                <td className="py-[13px] pr-3.5">
                  <p className="whitespace-nowrap tabular-nums text-[12.5px] text-charcoal">
                    {bookingDateLabel(row.date)} {bookingTimeLabel(row.startTime, row.endTime)}
                  </p>
                  <p className="mt-0.5 whitespace-nowrap text-[11px] text-charcoal-3">
                    신청 {formatDateTimeKst(row.createdAt)}
                    {/* APPROVED 는 경과 대신 학교 반영 대기 에이징을 이어 붙인다(7일↑ 경고색 현행 유지). */}
                    {row.approvedWaitingDays !== undefined ? (
                      <>
                        {' · '}
                        <span className={row.approvedWaitingDays >= 7 ? 'font-bold text-coral' : ''}>
                          학교 반영 대기 D+{row.approvedWaitingDays}
                        </span>
                      </>
                    ) : (
                      ageLabel !== '' && ` · ${ageLabel}`
                    )}
                  </p>
                </td>
                <td className="py-[13px] pr-3.5">
                  <BookingStatusBadge status={row.status} />
                </td>
                <td className="py-[13px] pr-[18px] text-right">
                  <button
                    type="button"
                    className={`btn btn-primary btn-sm ${
                      row.status === 'CONFLICT' ? 'bg-coral hover:bg-coral/90' : 'bg-ink-deep hover:bg-ink'
                    }`}
                    aria-label={`#${row.bookingId} 검토`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(row.bookingId);
                    }}
                  >
                    검토
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
