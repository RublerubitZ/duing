'use client';

import type { BookingDayAvailability, CreateFacilityBookingResult } from '@duing/types';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { rangeContainsPendingHold, rangeLabel } from '../../_lib/bookingCalendar';
import { BookingForm } from './BookingForm';
import { BookingSuccess } from './BookingSuccess';
import { DayBookingOverview } from './DayBookingOverview';
import { DaySlotList } from './DaySlotList';
import { PanelStepIndicator } from './PanelStepIndicator';
import { PanelSummaryCard } from './PanelSummaryCard';
import { WeekTimetable } from './WeekTimetable';

export type PanelStep = 'slots' | 'form' | 'success';
export type PanelView = 'day' | 'week';

type Props = {
  facility: { id: number; roomName: string };
  day: BookingDayAvailability;
  daysByIso: Map<string, BookingDayAvailability>;
  bookableFrom: string;
  bookableUntil: string;
  view: PanelView;
  onChangeView: (view: PanelView) => void;
  selection: SlotRange | null;
  onToggleSlot: (slotStart: string) => void;
  onSelectDate: (iso: string) => void;
  step: PanelStep;
  onProceedToForm: () => void;
  onBackToSlots: () => void;
  submittedResult: CreateFacilityBookingResult | null;
  submittedClubId: number | null;
  submittedAt: string | null;
  onSubmitted: (result: CreateFacilityBookingResult, clubId: number) => void;
  onExploreOther: () => void;
  onClose: () => void;
};

export function BookingPanel({
  facility, day, daysByIso, bookableFrom, bookableUntil, view, onChangeView, selection, onToggleSlot, onSelectDate,
  step, onProceedToForm, onBackToSlots, submittedResult, submittedClubId, submittedAt,
  onSubmitted, onExploreOther, onClose,
}: Props) {
  const dateLabel = `${Number(day.date.slice(5, 7))}월 ${Number(day.date.slice(8, 10))}일`;

  if (step === 'success' && selection && submittedAt !== null) {
    return (
      <div>
        <div className="mb-3">
          <PanelStepIndicator step={step} />
        </div>
        <BookingSuccess
          facilityName={facility.roomName}
          date={day.date}
          range={selection}
          overlappingPendingCount={submittedResult?.overlappingPendingCount ?? 0}
          submittedAt={submittedAt}
          manageHref={
            submittedClubId !== null
              ? `/manage/clubs/${submittedClubId}/facility-bookings`
              : undefined
          }
          onExploreOther={onExploreOther}
          onClose={onClose}
        />
      </div>
    );
  }

  if (step === 'form' && selection) {
    return (
      <div>
        <div className="mb-3">
          <PanelStepIndicator step={step} />
        </div>
        <BookingForm
          facilityId={facility.id}
          facilityName={facility.roomName}
          date={day.date}
          range={selection}
          hasPendingHold={rangeContainsPendingHold(day.slots, selection)}
          onSubmitted={onSubmitted}
          onBack={onBackToSlots}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-base text-ink-deep">{facility.roomName} · {dateLabel}</h3>
        <div className="flex rounded-full border border-line bg-paper p-0.5 text-xs" role="tablist" aria-label="보기 전환">
          {(['day', 'week'] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={view === candidate}
              onClick={() => onChangeView(candidate)}
              className={`rounded-full px-2.5 py-1 motion-safe:transition-colors ${
                view === candidate ? 'bg-ink text-cream' : 'text-charcoal-3'
              }`}
            >
              {candidate === 'day' ? '일간' : '주간'}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <PanelStepIndicator step={step} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {view === 'day' ? (
          <div className="space-y-3">
            <PanelSummaryCard day={day} />
            <DayBookingOverview day={day} />
            <DaySlotList day={day} selection={selection} onToggleSlot={onToggleSlot} />
          </div>
        ) : (
          <WeekTimetable
            selectedDate={day.date}
            daysByIso={daysByIso}
            bookableFrom={bookableFrom}
            bookableUntil={bookableUntil}
            selection={selection}
            onSelectDate={onSelectDate}
          />
        )}
      </div>

      {/* bg-inherit 은 transparent 로 풀려 스크롤 중 뒤 슬롯이 비친다 — 패널·시트 공통 흰 계열로 고정 */}
      <div className="sticky bottom-0 bg-paper pt-2">
        {selection && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-sage-mist px-3 py-2">
            <span className="font-mono text-base font-bold text-ink-deep">{rangeLabel(selection)}</span>
            <span className="ml-auto rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-cream">
              {Number(selection.end.slice(0, 2)) - Number(selection.start.slice(0, 2))}시간
            </span>
          </div>
        )}
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={!selection}
          onClick={onProceedToForm}
        >
          {selection ? `${rangeLabel(selection)} 예약 신청` : '시간을 선택해주세요'}
        </button>
        <p className="mt-2 text-center text-[11px] text-charcoal-3">신청 후 관리자 승인을 거쳐 확정돼요.</p>
      </div>
    </div>
  );
}
