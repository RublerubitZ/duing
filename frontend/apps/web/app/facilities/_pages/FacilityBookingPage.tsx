'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  useBookingWindowQuery,
  useFacilityAvailabilityQuery,
  useFacilityUsageQuery,
} from '@duing/hooks';
import type { BookingDayAvailability, CreateFacilityBookingResult } from '@duing/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { FacilityUpdateBanner } from '../_components/FacilityUpdateBanner';
import { FacilityOverviewTimeline } from '../_components/FacilityOverviewTimeline';
import { FacilityUsageGuide } from '../_components/FacilityUsageGuide';
import { seoulDateIso, shiftYearMonth } from '../_lib/facilityTimeline';
import { windowRangeLabel } from '../_lib/bookingHome';
import type { SlotRange } from '../_lib/bookingCalendar';
import { isSelectableSlot, isWithinBookable, slotInRange, toggleSlotSelection } from '../_lib/bookingCalendar';
import { BookingCalendar } from '../_components/booking/BookingCalendar';
import { BookingHomeSkeleton, CalendarGridSkeleton } from '../_components/booking/BookingHomeSkeleton';
import { BookingPanel, type PanelStep, type PanelView } from '../_components/booking/BookingPanel';
import { FacilityContextBar } from '../_components/booking/FacilityContextBar';
import { FacilityHomeCard } from '../_components/booking/FacilityHomeCard';
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
  const [selection, setSelection] = useState<SlotRange | null>(null);
  const [step, setStep] = useState<PanelStep>('slots');
  const [view, setView] = useState<PanelView>('day');
  const [submittedResult, setSubmittedResult] = useState<CreateFacilityBookingResult | null>(null);
  const [submittedClubId, setSubmittedClubId] = useState<number | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const { addToast } = useToast();
  const isMobileViewport = useIsMobileViewport();
  const usageQuery = useFacilityUsageQuery();
  const windowQuery = useBookingWindowQuery();
  const windowLabel = windowQuery.data ? windowRangeLabel(windowQuery.data) : null;

  // 기본 월 = 창 월(반월 정책상 bookableFrom 월). 딥링크 날짜가 있으면 그 월로 진입하고,
  // 이후 사용자의 월 이동/날짜 선택은 override 로만 갱신한다(창 로딩 전에도 currentMonth 로 폴백).
  const windowMonth = windowQuery.data?.bookableFrom.slice(0, 7) ?? null;
  const [yearMonthOverride, setYearMonthOverride] = useState<string | null>(() => {
    // 딥링크 date 의 월은 당월/익월(반월 창 범위)일 때만 채용한다. 과거·원거리 월을 그대로
    // 채용하면 availability 가 무효 월로 400 을 내고 회복이 안 되므로, 범위 밖이면 null(창 월 폴백).
    if (selectedDate === null) return null;
    const deepLinkMonth = selectedDate.slice(0, 7);
    return deepLinkMonth === currentMonth || deepLinkMonth === shiftYearMonth(currentMonth, 1)
      ? deepLinkMonth
      : null;
  });
  const yearMonth = yearMonthOverride ?? windowMonth ?? currentMonth;

  const contextFacilities = useMemo(
    () =>
      (usageQuery.data?.facilities ?? []).map((facility) => ({
        id: facility.id,
        roomName: facility.roomName,
        location: facility.location,
      })),
    [usageQuery.data],
  );
  // 자동 첫 시설 선택 없음 — 미선택(undefined)이면 홈 뷰(카드 그리드), 선택되면 캘린더 뷰.
  const effectiveFacilityId = facilityId ?? undefined;
  const availabilityQuery = useFacilityAvailabilityQuery(effectiveFacilityId, yearMonth);
  const availability = availabilityQuery.data;

  const daysByIso = useMemo(() => {
    const map = new Map<string, BookingDayAvailability>();
    for (const day of availability?.days ?? []) map.set(day.date, day);
    return map;
  }, [availability]);
  const selectedDay = selectedDate !== null ? daysByIso.get(selectedDate) : undefined;
  const selectedFacility = contextFacilities.find((candidate) => candidate.id === effectiveFacilityId);

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

  // 딥링크로 들어온 date 가 예약 창(반월) 밖이면 선택을 정리하고 안내한다(selectionInvalid 전례와 동일 패턴).
  // 셀 게이팅은 availability 메타로 두되, 창 판정만 windowQuery 로 단일화한다.
  // 성공 화면은 이미 접수된 신청의 확인이므로 보존한다(selectionInvalid 전례 동일).
  const selectedDateOutOfWindow =
    step !== 'success' &&
    selectedDate !== null &&
    windowQuery.data !== undefined &&
    !isWithinBookable(selectedDate, windowQuery.data.bookableFrom, windowQuery.data.bookableUntil);
  useEffect(() => {
    if (!selectedDateOutOfWindow) return;
    setSelectedDate(null);
    setSelection(null);
    setStep('slots');
    syncUrl(effectiveFacilityId ?? null, null); // 스테일 date 파라미터 제거 — 새로고침 시 재발 방지.
    addToast(`현재 예약 가능한 기간이 아니에요${windowLabel ? ` (${windowLabel})` : ''}`, { variant: 'error' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateOutOfWindow]);

  const closePanel = () => {
    setSelectedDate(null);
    setSelection(null);
    setStep('slots');
    setSubmittedResult(null);
    setSubmittedClubId(null);
    setSubmittedAt(null);
    syncUrl(effectiveFacilityId ?? null, null);
  };

  const selectFacility = (nextId: number) => {
    setFacilityId(nextId);
    setYearMonthOverride(null); // 다음 진입 기본 월 = 창 월 계약 복원
    closePanel();
    syncUrl(nextId, null);
  };

  // 홈(시설 선택) 복귀 — closePanel 은 effectiveFacilityId 로 syncUrl 을 다시 세팅하므로 여기서는
  // closePanel 을 거치지 않고 상태를 직접 리셋한 뒤 URL 을 비운다.
  const goHome = () => {
    setFacilityId(null);
    setYearMonthOverride(null); // 다음 진입 기본 월 = 창 월 계약 복원
    setSelectedDate(null);
    setSelection(null);
    setStep('slots');
    setSubmittedResult(null);
    setSubmittedClubId(null);
    setSubmittedAt(null);
    syncUrl(null, null);
  };

  const selectDate = (iso: string) => {
    if (iso.slice(0, 7) !== yearMonth) setYearMonthOverride(iso.slice(0, 7));
    setSelectedDate(iso);
    setSelection(null);
    setStep('slots');
    setSubmittedResult(null);
    setSubmittedClubId(null);
    setSubmittedAt(null);
    syncUrl(effectiveFacilityId ?? null, iso);
  };

  // 창 밖 미래 셀 탭 — 선택은 열지 않고 안내만 한다(동일 문구는 토스트 dedup 으로 1회).
  const handleOutOfWindowSelect = () =>
    addToast(`현재 예약 가능한 기간이 아니에요${windowLabel ? ` (${windowLabel})` : ''}`, { variant: 'error' });

  const toggleSlot = (slotStart: string) => {
    if (!selectedDay) return;
    const tapped = selectedDay.slots.find((slot) => slot.start === slotStart);
    if (!tapped) return;
    setSelection((current) => toggleSlotSelection(current, tapped, selectedDay.slots));
  };

  const changeMonth = (delta: 1 | -1) => {
    // override 가 null 이어도 파생 yearMonth(창 월 폴백) 를 기준으로 이동한다.
    setYearMonthOverride(shiftYearMonth(yearMonth, delta));
    setSelectedDate(null);
    setSelection(null);
    setStep('slots');
    syncUrl(effectiveFacilityId ?? null, null);
  };

  const panelOpen = selectedDay !== undefined && selectedFacility !== undefined;
  // availability 는 selectedDay(=daysByIso.get) 가 존재하면 항상 non-null 이지만, 주간 헤더 창 게이팅에
  // bookableFrom/Until 을 넘기려면 TS 상 명시 narrowing 이 필요하다(panelOpen && availability).
  const panel = panelOpen && availability ? (
    <BookingPanel
      facility={selectedFacility}
      day={selectedDay}
      daysByIso={daysByIso}
      bookableFrom={availability.bookableFrom}
      bookableUntil={availability.bookableUntil}
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
      submittedAt={submittedAt}
      onSubmitted={(result, clubId) => {
        const now = new Date();
        setSubmittedAt(
          `${now.getMonth() + 1}월 ${now.getDate()}일 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        );
        setSubmittedResult(result);
        setSubmittedClubId(clubId);
        setStep('success');
      }}
      onExploreOther={goHome}
      onClose={closePanel}
    />
  ) : null;

  return (
    <main className="mx-auto max-w-layout px-4 pb-16 pt-8 sm:px-6 md:px-10">
      {usageQuery.isLoading && <BookingHomeSkeleton />}
      {usageQuery.isError && (
        <p role="alert" className="text-sm text-charcoal-2">시설 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
      )}

      {usageQuery.isSuccess && (
        <div className="space-y-4">
          {effectiveFacilityId === undefined || usageQuery.data.facilities.length === 0 ? (
            // ── 홈 뷰: 시설 선택 카드 그리드 ── (딥링크가 있어도 시설 0개면 홈 빈 문구)
            <>
              <header>
                <p className="text-xs font-medium tracking-widest text-charcoal-3">RESERVE · 시설 예약</p>
                <h1 className="mt-1 font-display text-2xl text-ink-deep">예약할 시설을 골라보세요</h1>
                <p className="mt-1.5 text-sm text-charcoal-2">
                  학교 예약 현황을 반영해요. 비어 있는 시간만 신청할 수 있어요.
                </p>
                {windowLabel && (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-xs text-charcoal-2">
                    예약 가능 기간 <span className="font-bold text-ink">{windowLabel}</span>
                  </p>
                )}
              </header>
              <MyBookingsChip />
              {usageQuery.data.facilities.length === 0 ? (
                <p className="text-sm text-charcoal-2">표시할 시설이 없어요.</p>
              ) : (
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {usageQuery.data.facilities.map((facility) => (
                    <li key={facility.id}>
                      <FacilityHomeCard facility={facility} windowLabel={windowLabel} onSelect={selectFacility} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            // ── 캘린더 뷰: 선택 시설 예약 ──
            <>
              <div>
                <p className="text-xs font-medium tracking-widest text-charcoal-3">FACILITY · 시설 예약</p>
                <h1 className="mb-3 mt-1 font-display text-2xl text-ink-deep">{selectedFacility?.roomName ?? '시설'} 예약</h1>
                <FacilityContextBar
                  facilities={contextFacilities}
                  selectedId={effectiveFacilityId}
                  onSelect={selectFacility}
                  onGoHome={goHome}
                />
              </div>
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
                      onOutOfWindowSelect={handleOutOfWindowSelect}
                      windowLabel={windowLabel}
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
