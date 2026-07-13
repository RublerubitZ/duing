'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFacilityAvailabilityQuery, useFacilityUsageQuery } from '@duing/hooks';
import type { BookingDayAvailability, CreateFacilityBookingResult } from '@duing/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FacilityUpdateBanner } from '../_components/FacilityUpdateBanner';
import { FacilityOverviewTimeline } from '../_components/FacilityOverviewTimeline';
import { FacilityUsageGuide } from '../_components/FacilityUsageGuide';
import { seoulDateIso, shiftYearMonth } from '../_lib/facilityTimeline';
import type { SlotRange } from '../_lib/bookingCalendar';
import { isSelectableSlot, slotInRange, toggleSlotSelection } from '../_lib/bookingCalendar';
import { BookingCalendar } from '../_components/booking/BookingCalendar';
import { BookingHomeSkeleton, CalendarGridSkeleton } from '../_components/booking/BookingHomeSkeleton';
import { BookingPanel, type PanelStep, type PanelView } from '../_components/booking/BookingPanel';
import { FacilityChips } from '../_components/booking/FacilityChips';
import { MyBookingsChip } from '../_components/booking/MyBookingsChip';

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

const MOBILE_QUERY = '(max-width: 767px)'; // Tailwind md 미만

function subscribeToViewport(onChange: () => void) {
  const mediaQueryList = window.matchMedia(MOBILE_QUERY);
  mediaQueryList.addEventListener('change', onChange);
  return () => mediaQueryList.removeEventListener('change', onChange);
}

function useIsMobileViewport(): boolean {
  return useSyncExternalStore(
    subscribeToViewport,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false, // SSR: 데스크탑 기본 — 하이드레이션 후 구독으로 보정
  );
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
  const [submittedClubId, setSubmittedClubId] = useState<number | null>(null);

  const isMobileViewport = useIsMobileViewport();
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

  // §9.8 경합 실패 재조회 후 선택 무효화 — 갱신 데이터에서 선택 범위에 선택 불가 슬롯이 생기면
  // 선택을 비우고 폼이면 슬롯 화면으로 되돌린다. 성공 화면은 이미 접수된 신청의 확인이므로 보존.
  const selectionInvalid =
    step !== 'success' &&
    selection !== null &&
    selectedDay !== undefined &&
    selectedDay.slots.some((slot) => slotInRange(slot, selection) && !isSelectableSlot(slot));

  useEffect(() => {
    if (!selectionInvalid) return;
    setSelection(null);
    setStep((current) => (current === 'form' ? 'slots' : current));
  }, [selectionInvalid]);

  const closePanel = () => {
    setSelectedDate(null);
    setSelection(null);
    setStep('slots');
    setSubmittedResult(null);
    setSubmittedClubId(null);
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
    setSubmittedClubId(null);
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
    syncUrl(effectiveFacilityId ?? null, null);
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
      submittedClubId={submittedClubId}
      onSubmitted={(result, clubId) => {
        setSubmittedResult(result);
        setSubmittedClubId(clubId);
        setStep('success');
      }}
      onClose={closePanel}
    />
  ) : null;

  return (
    <main className="mx-auto max-w-layout px-4 pb-16 pt-8 sm:px-6 md:px-10">
      <p className="text-xs font-medium tracking-widest text-charcoal-3">FACILITY · 시설 예약</p>
      <div className="mb-4 mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-display text-2xl text-ink-deep">시설 예약</h1>
        <MyBookingsChip />
      </div>

      {usageQuery.isLoading && <BookingHomeSkeleton />}
      {usageQuery.isError && (
        <p role="alert" className="text-sm text-charcoal-2">시설 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
      )}

      {usageQuery.isSuccess && (
        <div className="space-y-4">
          {chipFacilities.length === 0 ? (
            <p className="text-sm text-charcoal-2">표시할 시설이 없어요.</p>
          ) : (
            <>
              <FacilityChips facilities={chipFacilities} selectedId={effectiveFacilityId ?? null} onSelect={selectFacility} />
              {availability && (
                <FacilityUpdateBanner lastUpdatedAt={availability.lastUpdatedAt ?? null} stale={availability.stale} />
              )}

              <div className={panelOpen ? 'md:grid md:grid-cols-[minmax(0,1fr)_380px] md:gap-5' : undefined}>
                <div>
                  {availabilityQuery.isLoading && <CalendarGridSkeleton />}
                  {availabilityQuery.isError && (
                    <div role="alert" className="rounded-lg border border-line bg-paper p-6 text-center text-sm text-charcoal-2">
                      <p>가용성 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
                      <div className="mt-3 flex justify-center gap-2">
                        {yearMonth !== currentMonth && (
                          <button type="button" className="btn btn-secondary" onClick={() => changeMonth(-1)}>
                            이번 달로 돌아가기
                          </button>
                        )}
                        <button type="button" className="btn btn-primary" onClick={() => void availabilityQuery.refetch()}>
                          다시 시도
                        </button>
                      </div>
                    </div>
                  )}
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
                {/* 데스크탑 인라인 우측 패널 — 모바일에선 아래 Sheet 가 담당(단일 제어 상태 공유).
                    뷰포트로 마운트를 게이트해 시트와의 이중 마운트(폼 id 중복)를 방지한다. */}
                {panelOpen && !isMobileViewport && (
                  <aside className="hidden rounded-lg border border-line bg-paper p-4 md:block">
                    {panel}
                  </aside>
                )}
              </div>
            </>
          )}

          <details className="rounded-lg border border-line bg-paper px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-ink-deep">오늘 이용 현황</summary>
            <div className="pt-3">
              <FacilityOverviewTimeline facilities={usageQuery.data.facilities} onSelectFacility={selectFacility} />
            </div>
          </details>
          <FacilityUsageGuide />
        </div>
      )}

      {/* 모바일 Bottom Sheet — md 미만 전용. 포털이라 .duing 스코프 재부여(bg-cream 함정 → bg-transparent) */}
      <Sheet open={panelOpen && isMobileViewport} onOpenChange={(open) => !open && closePanel()}>
        <SheetContent side="bottom" hideClose className="md:hidden">
          <div className="duing bg-transparent px-5 pb-6 pt-2.5">
            <div aria-hidden className="mx-auto mb-3.5 h-[4.5px] w-10 rounded-full bg-line" />
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
