'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFacilityAvailabilityQuery, useFacilityUsageQuery } from '@duing/hooks';
import type { BookingDayAvailability, CreateFacilityBookingResult } from '@duing/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FacilityUpdateBanner } from '../_components/FacilityUpdateBanner';
import { FacilityOverviewTimeline } from '../_components/FacilityOverviewTimeline';
import { FacilityUsageGuide } from '../_components/FacilityUsageGuide';
import { seoulDateIso, shiftYearMonth } from '../_lib/facilityTimeline';
import type { SlotRange } from '../_lib/bookingCalendar';
import { toggleSlotSelection } from '../_lib/bookingCalendar';
import { BookingCalendar } from '../_components/booking/BookingCalendar';
import { BookingHomeSkeleton } from '../_components/booking/BookingHomeSkeleton';
import { BookingPanel, type PanelStep, type PanelView } from '../_components/booking/BookingPanel';
import { FacilityChips } from '../_components/booking/FacilityChips';

/** URL 은 딥링크 전용 — 상태 변경은 리렌더 없는 replaceState 로만 반영한다(App Router replace 는 RSC 왕복). */
function syncUrl(facilityId: number | null, date: string | null) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (facilityId !== null) params.set('facilityId', String(facilityId));
  else params.delete('facilityId');
  if (date !== null) params.set('date', date);
  else params.delete('date');
  const query = params.toString();
  window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

export function FacilityBookingPage() {
  const searchParams = useSearchParams();
  const todayIso = seoulDateIso(new Date());
  const currentMonth = todayIso.slice(0, 7);

  const [facilityId, setFacilityId] = useState<number | null>(() => {
    const raw = searchParams.get('facilityId');
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    const raw = searchParams.get('date');
    return raw !== null && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  });
  const [yearMonth, setYearMonth] = useState(() =>
    selectedDate !== null && selectedDate.slice(0, 7) !== currentMonth
      ? shiftYearMonth(currentMonth, 1)
      : currentMonth,
  );
  const [selection, setSelection] = useState<SlotRange | null>(null);
  const [step, setStep] = useState<PanelStep>('slots');
  const [view, setView] = useState<PanelView>('day');
  const [submittedResult, setSubmittedResult] = useState<CreateFacilityBookingResult | null>(null);

  const usageQuery = useFacilityUsageQuery();
  const chipFacilities = useMemo(
    () =>
      (usageQuery.data?.facilities ?? []).map((facility) => ({
        id: facility.id,
        roomName: facility.roomName,
        isUsingNow: facility.isUsingNow,
      })),
    [usageQuery.data],
  );
  const effectiveFacilityId = facilityId ?? chipFacilities[0]?.id ?? undefined;
  const availabilityQuery = useFacilityAvailabilityQuery(effectiveFacilityId, yearMonth);
  const availability = availabilityQuery.data;

  const daysByIso = useMemo(() => {
    const map = new Map<string, BookingDayAvailability>();
    for (const day of availability?.days ?? []) map.set(day.date, day);
    return map;
  }, [availability]);
  const selectedDay = selectedDate !== null ? daysByIso.get(selectedDate) : undefined;
  const selectedFacility = chipFacilities.find((candidate) => candidate.id === effectiveFacilityId);

  const closePanel = () => {
    setSelectedDate(null);
    setSelection(null);
    setStep('slots');
    setSubmittedResult(null);
    syncUrl(effectiveFacilityId ?? null, null);
  };

  const selectFacility = (nextId: number) => {
    setFacilityId(nextId);
    closePanel();
    syncUrl(nextId, null);
  };

  const selectDate = (iso: string) => {
    if (iso.slice(0, 7) !== yearMonth) setYearMonth(iso.slice(0, 7));
    setSelectedDate(iso);
    setSelection(null);
    setStep('slots');
    setSubmittedResult(null);
    syncUrl(effectiveFacilityId ?? null, iso);
  };

  const toggleSlot = (slotStart: string) => {
    if (!selectedDay) return;
    const tapped = selectedDay.slots.find((slot) => slot.start === slotStart);
    if (!tapped) return;
    setSelection((current) => toggleSlotSelection(current, tapped, selectedDay.slots));
  };

  const changeMonth = (delta: 1 | -1) => {
    setYearMonth((current) => shiftYearMonth(current, delta));
    setSelectedDate(null);
    setSelection(null);
    setStep('slots');
  };

  const panelOpen = selectedDay !== undefined && selectedFacility !== undefined;
  const panel = panelOpen ? (
    <BookingPanel
      facility={selectedFacility}
      day={selectedDay}
      daysByIso={daysByIso}
      view={view}
      onChangeView={setView}
      selection={selection}
      onToggleSlot={toggleSlot}
      onSelectDate={selectDate}
      step={step}
      onProceedToForm={() => setStep('form')}
      onBackToSlots={() => setStep('slots')}
      submittedResult={submittedResult}
      onSubmitted={(result) => {
        setSubmittedResult(result);
        setStep('success');
      }}
      onClose={closePanel}
    />
  ) : null;

  return (
    <main className="mx-auto max-w-layout px-4 pb-16 pt-8 sm:px-6 md:px-10">
      <p className="text-xs font-medium tracking-widest text-charcoal-3">FACILITY · 시설 예약</p>
      <h1 className="mb-4 mt-1 font-display text-2xl text-ink-deep">시설 예약</h1>

      {usageQuery.isLoading && <BookingHomeSkeleton />}
      {usageQuery.isError && (
        <p role="alert" className="text-sm text-charcoal-2">시설 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
      )}

      {usageQuery.isSuccess && (
        <div className="space-y-4">
          <FacilityChips facilities={chipFacilities} selectedId={effectiveFacilityId ?? null} onSelect={selectFacility} />
          {availability && (
            <FacilityUpdateBanner lastUpdatedAt={availability.lastUpdatedAt ?? null} stale={availability.stale} />
          )}

          <div className={panelOpen ? 'md:grid md:grid-cols-[minmax(0,1fr)_380px] md:gap-5' : undefined}>
            <div>
              {availabilityQuery.isLoading && <BookingHomeSkeleton />}
              {availability && (
                <BookingCalendar
                  yearMonth={yearMonth}
                  daysByIso={daysByIso}
                  bookableFrom={availability.bookableFrom}
                  bookableUntil={availability.bookableUntil}
                  todayIso={todayIso}
                  selectedDate={selectedDate}
                  onSelectDate={selectDate}
                  onPrevMonth={() => changeMonth(-1)}
                  onNextMonth={() => changeMonth(1)}
                  canPrev={yearMonth !== currentMonth}
                  canNext={yearMonth === currentMonth}
                />
              )}
            </div>
            {/* 데스크탑 인라인 우측 패널 — 모바일에선 아래 Sheet 가 담당(단일 제어 상태 공유) */}
            {panelOpen && (
              <aside className="hidden rounded-lg border border-line bg-paper p-4 md:block">
                {panel}
              </aside>
            )}
          </div>

          <details className="rounded-lg border border-line bg-paper px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-ink-deep">오늘 이용 현황</summary>
            <div className="pt-3">
              <FacilityOverviewTimeline facilities={usageQuery.data.facilities} />
            </div>
          </details>
          <FacilityUsageGuide />
        </div>
      )}

      {/* 모바일 Bottom Sheet — md 미만 전용. 포털이라 .duing 스코프 재부여(bg-cream 함정 → bg-transparent) */}
      <Sheet open={panelOpen} onOpenChange={(open) => !open && closePanel()}>
        <SheetContent side="bottom" hideClose className="md:hidden">
          <div className="duing bg-transparent">
            <SheetHeader className="mb-2">
              <SheetTitle className="text-left font-display text-base text-ink-deep">
                {selectedFacility?.roomName}
              </SheetTitle>
            </SheetHeader>
            {panel}
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
