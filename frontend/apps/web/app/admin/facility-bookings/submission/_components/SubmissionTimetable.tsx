'use client';

import type { SubmissionCandidateBooking } from '@duing/types';
import {
  SUBMISSION_HOURS,
  SUBMISSION_STATUS_LABELS,
  buildSubmissionRows,
  submissionBlockVisual,
} from '../_lib/submissionTimetable';

const pad2 = (value: number) => String(value).padStart(2, '0');

type Props = {
  bookings: SubmissionCandidateBooking[];
  facilityName: string;
  selection: ReadonlySet<number>;
  onToggleSelect: (bookingId: number) => void;
  onShowDetail: (booking: SubmissionCandidateBooking) => void;
};

/**
 * 학교 제출 시간표(스펙 v2 §7.1 — 보조 뷰) — 세로=날짜·가로=시간(09~22 13칸), 예약=colSpan 병합 블록.
 * 용도: 시설 충돌·특정 날짜 집중 예약 확인. selectable 블록 클릭=선택 토글(상세는 hover 툴팁),
 * 그 외 블록 클릭=우측 Sheet 상세. 모바일은 가로 스크롤 + 날짜 열 sticky.
 */
export function SubmissionTimetable({ bookings, facilityName, selection, onToggleSelect, onShowDetail }: Props) {
  const rows = buildSubmissionRows(bookings);

  if (rows.length === 0) {
    return <p className="text-sm text-charcoal-3">이 기간에 표시할 예약이 없어요.</p>;
  }

  return (
    // pb-24: 스크롤 클립 박스 안에 툴팁(아래 표시, 약 6rem) 자리를 예약 — overflow-x-auto 는 y 클리핑도
    // 강제하므로 위/아래로 벗어나는 툴팁은 잘린다(실브라우저 QA 실측). 아래 고정 + 하단 패딩이 전 행 커버.
    <div className="overflow-x-auto pb-24">
      <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-0 text-center">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-16 bg-cream" aria-hidden />
            {SUBMISSION_HOURS.map((hour) => (
              <th key={hour} className="p-1 font-mono text-[10px] font-medium text-charcoal-3">
                {pad2(hour)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.dateIso}>
              <td className="sticky left-0 z-10 bg-cream pr-1.5 text-right align-middle">
                <span className="font-mono text-[11px] font-bold text-charcoal">
                  {row.dateIso.slice(5).replace('-', '/')}
                </span>
              </td>
              {row.entries.map((entry, columnIndex) => {
                if (entry.type === 'covered') return null;
                if (entry.type === 'empty') {
                  return (
                    <td key={columnIndex} className="p-[2px]">
                      <div aria-hidden className="h-12 rounded-[5px] border border-line/40" />
                    </td>
                  );
                }
                const { booking, colSpan } = entry;
                const visual = submissionBlockVisual(booking);
                const selected = selection.has(booking.bookingId);
                const subText =
                  booking.attendeeCount !== null ? `${booking.attendeeCount}명` : booking.purpose;
                return (
                  <td key={columnIndex} colSpan={colSpan} className="relative p-[2px]">
                    {/* group: hover 툴팁 트리거 — 라이브러리 없이 CSS 로만(경량 커스텀 툴팁, 스펙 §7.1). */}
                    <div className="group relative">
                      <button
                        type="button"
                        aria-pressed={booking.selectable ? selected : undefined}
                        aria-label={`${row.dateIso} ${booking.startTime}~${booking.endTime} ${booking.clubName ?? '동아리'}${selected ? ' · 선택됨' : ''} · ${SUBMISSION_STATUS_LABELS[booking.status]}`}
                        onClick={
                          booking.selectable
                            ? () => onToggleSelect(booking.bookingId)
                            : () => onShowDetail(booking)
                        }
                        className={`flex h-12 w-full flex-col justify-center gap-0.5 overflow-hidden rounded-[5px] border px-1.5 py-1 text-left leading-tight motion-safe:transition-colors ${
                          selected ? 'border-sage bg-ink text-cream shadow-sm' : visual.container
                        }`}
                      >
                        <span className={`flex items-center gap-1 truncate text-[11px] font-bold ${selected ? 'text-cream' : visual.nameClass}`}>
                          <span className="truncate">{booking.clubName ?? '동아리'}</span>
                          {visual.badge !== null && (
                            <span className="shrink-0 rounded-sm border border-current px-0.5 text-[9px] font-medium">
                              {visual.badge}
                            </span>
                          )}
                        </span>
                        <span className={`truncate font-mono text-[10px] ${selected ? 'text-cream/80' : 'text-charcoal-3'}`}>
                          {booking.startTime}~{booking.endTime} · {subText}
                        </span>
                      </button>
                      {/* hover 툴팁 — jsdom 은 hover 를 못 내므로 내용 존재만 테스트(실브라우저 QA 로 위치 검증). */}
                      <div
                        role="presentation"
                        className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-56 rounded-md border border-line bg-paper p-2 text-left text-[11px] leading-relaxed text-charcoal shadow-md group-hover:block"
                      >
                        {/* 블록에 이미 보이는 동아리명·시간·목적은 생략하고, 툴팁은 추가 정보(신청자·연락처·승인)만 — 스펙 §7.1. */}
                        <p className="font-bold text-ink-deep">{facilityName} · {booking.reservationDate}</p>
                        <p>신청자 {booking.applicantName ?? '-'} · {booking.contactPhone ?? '-'}</p>
                        {booking.attendeeCount !== null && <p>목적 {booking.purpose}</p>}
                        <p>승인 {booking.decidedByName ?? '-'}{booking.decidedAt !== null ? ` · ${booking.decidedAt.slice(0, 10)}` : ''}</p>
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
