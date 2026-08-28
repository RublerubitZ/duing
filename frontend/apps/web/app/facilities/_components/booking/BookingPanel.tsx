'use client';

import type { BookingDayAvailability, CreateFacilityBookingResult } from '@duing/types';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { rangeContainsPendingHold, rangeLabel } from '../../_lib/bookingCalendar';
import { BookingForm } from './BookingForm';
import { BookingSuccess } from './BookingSuccess';
import { DayBookingOverview } from './DayBookingOverview';
import { DaySlotList } from './DaySlotList';
import { PanelStepIndicator } from './PanelStepIndicator';

export type PanelStep = 'slots' | 'form' | 'success';

// 주간 전용 사이드바의 일간 콘텐츠(§5) — 뷰 전환은 공용 헤더(BookingViewHeader)·주간 그리드는
// 본문(WeekTimetable)이 담당하므로 패널은 선택일의 요약·현황·시간 선택·신청 스텝만 렌더한다.
type Props = {
  facility: { id: number; roomName: string };
  day: BookingDayAvailability;
  selection: SlotRange | null;
  onToggleSlot: (slotStart: string) => void;
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
  facility, day, selection, onToggleSlot,
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
      <div className="mb-2">
        <h3 className="text-base text-ink-deep">{facility.roomName} · {dateLabel}</h3>
      </div>

      <div className="mb-3">
        <PanelStepIndicator step={step} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <div className="space-y-3">
          <DayBookingOverview day={day} />
          <DaySlotList day={day} selection={selection} onToggleSlot={onToggleSlot} />
        </div>
      </div>

      {/* 모바일(<md)은 아래 액션 바가 fixed 로 플로우를 떠나므로 자리 스페이서(BottomNav 전례). */}
      <div aria-hidden className="h-36 md:hidden" />
      {/* bg-inherit 은 transparent 로 풀려 스크롤 중 뒤 슬롯이 비친다 — 패널·시트 공통 흰 계열로 고정.
          모바일(<md)은 sticky 가 BottomNav(fixed z-40, 3.5rem+safe-area)에 가려진다 — 탭바 위에 fixed 로 띄워
          주간 화면 안에서 시간 선택→신청이 이어지는 상시 노출 액션 바로 동작한다(§모바일 주간). */}
      <div
        data-bottom-bar
        className="sticky bottom-0 bg-paper pt-2 max-md:fixed max-md:inset-x-0 max-md:bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] max-md:z-40 max-md:border-t max-md:border-line max-md:px-4 max-md:pb-2">
        {selection && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-sage-mist px-3 py-2">
            <span className="tabular-nums text-base font-bold text-ink-deep">{rangeLabel(selection)}</span>
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
