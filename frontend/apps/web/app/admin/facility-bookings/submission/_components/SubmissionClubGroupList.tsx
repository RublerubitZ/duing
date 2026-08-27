'use client';

import { useState } from 'react';
import { formatDateKst } from '@duing/hooks';
import type { SubmissionCandidateBooking } from '@duing/types';
import { SUBMISSION_STATUS_LABELS, submissionBlockVisual } from '../_lib/submissionTimetable';
import { buildClubSections } from '../_lib/submissionSections';
import { bookingTimeLabel, slotTimeLabel } from '@/app/_lib/bookingDisplay';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/** '2026-08-01' → '08-01(토)' — 로컬 자정 파싱(타임존 어긋남 방지). */
function formatDateWithWeekday(dateIso: string): string {
  const weekday = WEEKDAY_LABELS[new Date(`${dateIso}T00:00:00`).getDay()];
  return `${dateIso.slice(5)}(${weekday})`;
}

type Props = {
  bookings: SubmissionCandidateBooking[];
  selection: ReadonlySet<number>;
  onToggleSelect: (bookingId: number) => void;
  onToggleMany: (bookingIds: number[], nextSelected: boolean) => void;
  onShowDetail: (booking: SubmissionCandidateBooking) => void;
};

/**
 * 동아리 최상위 목록(동아리 중심 보기 스펙 §1) — 동아리 → 시설 → 날짜/시간.
 * 그룹 헤더: 접기/펼치기(기본 펼침) + 동아리 단위 일괄 선택. 행: selectable 만 체크 가능.
 */
export function SubmissionClubGroupList({ bookings, selection, onToggleSelect, onToggleMany, onShowDetail }: Props) {
  const [collapsedClubIds, setCollapsedClubIds] = useState<ReadonlySet<number>>(new Set());
  const sections = buildClubSections(bookings);

  const toggleCollapsed = (clubId: number) =>
    setCollapsedClubIds((previous) => {
      const next = new Set(previous);
      if (next.has(clubId)) next.delete(clubId);
      else next.add(clubId);
      return next;
    });

  return (
    <ul className="space-y-2">
      {sections.map((section) => {
        const clubLabel = section.clubName ?? `동아리 ${section.clubId}`;
        const clubBookings = section.facilityGroups.flatMap((facilityGroup) => facilityGroup.bookings);
        const selectableIds = clubBookings
          .filter((booking) => booking.selectable)
          .map((booking) => booking.bookingId);
        const selectedCount = selectableIds.filter((bookingId) => selection.has(bookingId)).length;
        const allSelected = selectableIds.length > 0 && selectedCount === selectableIds.length;
        const expanded = !collapsedClubIds.has(section.clubId);
        return (
          <li key={section.clubId} role="group" aria-label={clubLabel} className="rounded-xl border border-line bg-paper">
            <div className="flex items-center gap-2 px-3 py-2">
              <input
                type="checkbox"
                aria-label={`${clubLabel} 전체 선택`}
                disabled={selectableIds.length === 0}
                checked={allSelected}
                ref={(element) => {
                  if (element !== null) element.indeterminate = selectedCount > 0 && !allSelected;
                }}
                onChange={() => onToggleMany(selectableIds, !allSelected)}
              />
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => toggleCollapsed(section.clubId)}
                className="flex flex-1 items-center gap-2 text-left"
              >
                <span aria-hidden className="text-xs text-charcoal-3">{expanded ? '▼' : '▶'}</span>
                <span className="font-medium text-ink-deep">{clubLabel}</span>
                <span className="text-xs text-charcoal-3">
                  시설 {section.facilityGroups.length}곳 · {clubBookings.length}건
                  {selectedCount > 0 ? ` · 선택 ${selectedCount}` : ''}
                </span>
              </button>
            </div>
            {expanded &&
              section.facilityGroups.map((facilityGroup) => (
                <div key={facilityGroup.facilityId}>
                  {/* 시설 서브헤더 — 같은 시설의 여러 날짜를 하나의 블록으로 묶는 시각 단위(스펙 §1). */}
                  <p className="flex items-center gap-2 border-t border-line/40 bg-graysoft/50 px-3 py-1.5 text-xs font-bold text-charcoal">
                    {facilityGroup.facilityName}
                    <span className="font-normal text-charcoal-3">{facilityGroup.bookings.length}건</span>
                  </p>
                  <ul>
                    {facilityGroup.bookings.map((booking) => {
                      const visual = submissionBlockVisual(booking);
                      return (
                        <li key={booking.bookingId} className="flex flex-wrap items-center gap-2 border-b border-line/40 px-3 py-2 text-sm last:border-b-0">
                          <input
                            type="checkbox"
                            aria-label={`${clubLabel} ${booking.reservationDate} ${slotTimeLabel(booking.startTime)} 선택`}
                            disabled={!booking.selectable}
                            checked={selection.has(booking.bookingId)}
                            onChange={() => onToggleSelect(booking.bookingId)}
                          />
                          <span className="font-mono text-xs text-charcoal">{formatDateWithWeekday(booking.reservationDate)}</span>
                          <span className="font-mono text-xs text-charcoal">{bookingTimeLabel(booking.startTime, booking.endTime)}</span>
                          <span className="max-w-40 truncate text-charcoal-2">{booking.purpose}</span>
                          <span className="tabular-nums text-xs text-charcoal-3">
                            {booking.attendeeCount !== null ? `${booking.attendeeCount}명` : '-'}
                          </span>
                          <span className="font-mono text-[10px] text-charcoal-3">
                            승인 {booking.decidedAt !== null ? formatDateKst(booking.decidedAt) : '-'}
                          </span>
                          <span className={`ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${visual.container}`}>
                            {/* 상태 우선순위(취소>충돌>등록완료>제출 대기)는 visual.badge 가 이미 반영한다 —
                                제출 목록에 담긴 승인 예약은 '제출 대기'로, 그 외에는 실제 상태 라벨로 표기한다. */}
                            <span className={visual.nameClass}>
                              {visual.badge ?? SUBMISSION_STATUS_LABELS[booking.status]}
                            </span>
                          </span>
                          {booking.submitted && booking.submissionNo !== null && (
                            <span className="font-mono text-[10px] text-charcoal-3">{booking.submissionNo}</span>
                          )}
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onShowDetail(booking)}>
                            상세
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
          </li>
        );
      })}
    </ul>
  );
}
