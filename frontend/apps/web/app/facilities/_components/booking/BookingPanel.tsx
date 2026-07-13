'use client';

import type { BookingDayAvailability, CreateFacilityBookingResult } from '@duing/types';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { rangeContainsPendingHold, rangeLabel } from '../../_lib/bookingCalendar';
import { BookingForm } from './BookingForm';
import { BookingSuccess } from './BookingSuccess';
import { DaySlotList } from './DaySlotList';
import { WeekTimetable } from './WeekTimetable';

export type PanelStep = 'slots' | 'form' | 'success';
export type PanelView = 'day' | 'week';

type Props = {
  facility: { id: number; roomName: string };
  day: BookingDayAvailability;
  daysByIso: Map<string, BookingDayAvailability>;
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
  onSubmitted: (result: CreateFacilityBookingResult, clubId: number) => void;
  onClose: () => void;
};

export function BookingPanel({
  facility, day, daysByIso, view, onChangeView, selection, onToggleSlot, onSelectDate,
  step, onProceedToForm, onBackToSlots, submittedResult, submittedClubId, onSubmitted, onClose,
}: Props) {
  const dateLabel = `${Number(day.date.slice(5, 7))}월 ${Number(day.date.slice(8, 10))}일`;

  if (step === 'success' && selection) {
    return (
      <BookingSuccess
        facilityName={facility.roomName}
        date={day.date}
        range={selection}
        overlappingPendingCount={submittedResult?.overlappingPendingCount ?? 0}
        manageHref={
          submittedClubId !== null
            ? `/manage/clubs/${submittedClubId}/facility-bookings`
            : undefined
        }
        onClose={onClose}
      />
    );
  }

  if (step === 'form' && selection) {
    return (
      <BookingForm
        facilityId={facility.id}
        facilityName={facility.roomName}
        date={day.date}
        range={selection}
        hasPendingHold={rangeContainsPendingHold(day.slots, selection)}
        onSubmitted={onSubmitted}
        onBack={onBackToSlots}
      />
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

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {view === 'day' ? (
          <DaySlotList day={day} selection={selection} onToggleSlot={onToggleSlot} />
        ) : (
          <WeekTimetable
            selectedDate={day.date}
            daysByIso={daysByIso}
            selection={selection}
            onSelectDate={onSelectDate}
          />
        )}
      </div>

      <div className="sticky bottom-0 bg-inherit pt-2">
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={!selection}
          onClick={onProceedToForm}
        >
          {selection ? `${rangeLabel(selection)} 예약 신청` : '시간을 선택해주세요'}
        </button>
      </div>
    </div>
  );
}
