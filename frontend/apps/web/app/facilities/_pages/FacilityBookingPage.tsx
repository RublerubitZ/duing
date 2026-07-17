'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  useBookingWindowQuery,
  useFacilityAvailabilityQuery,
  useFacilityUsageQuery,
} from '@duing/hooks';
import type { BookingDayAvailability, CreateFacilityBookingResult } from '@duing/types';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { FacilityUpdateBanner } from '../_components/FacilityUpdateBanner';
import { FacilityOverviewTimeline } from '../_components/FacilityOverviewTimeline';
import { FacilityUsageGuide } from '../_components/FacilityUsageGuide';
import { seoulDateIso, shiftYearMonth, yearMonthLabel } from '../_lib/facilityTimeline';
import { windowRangeLabel } from '../_lib/bookingHome';
import type { SlotRange } from '../_lib/bookingCalendar';
import {
  adjacentMonthToFetch,
  isSelectableSlot,
  isWithinBookable,
  shiftDateByDays,
  slotInRange,
  toggleSlotSelection,
  weekDatesOf,
  weekRangeLabel,
} from '../_lib/bookingCalendar';
import { BookingCalendar } from '../_components/booking/BookingCalendar';
import { BookingHomeSkeleton, CalendarGridSkeleton } from '../_components/booking/BookingHomeSkeleton';
import { BookingPanel, type PanelStep } from '../_components/booking/BookingPanel';
import { BookingViewHeader, type CalendarView } from '../_components/booking/BookingViewHeader';
import { WeekTimetable } from '../_components/booking/WeekTimetable';
import { WeekBlockSheet, type WeekBlockDetail } from '../_components/booking/WeekBlockSheet';
import { MobileDaySheet } from '../_components/booking/MobileDaySheet';
import { useIsMobileViewport } from '../_lib/useIsMobileViewport';
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

// 주 시작(월요일 ISO) — weekDatesOf 는 항상 7개 반환, [0]=월요일(noUncheckedIndexedAccess 폴백).
function mondayOf(iso: string): string {
  return weekDatesOf(iso)[0] ?? iso;
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
  // 뷰 상태 머신(§1): 기본 월간. 딥링크 date 가 있으면 주간으로 진입한다(URL 엔 view 를 쓰지 않는다).
  const [calendarView, setCalendarView] = useState<CalendarView>(() => {
    const raw = searchParams.get('date');
    return raw !== null && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? 'week' : 'month';
  });
  // 랜딩 = 캘린더(첫 시설 자동 선택). 홈 카드 그리드는 명시적 요청("전체 보기"·홈 복귀)일 때만 노출한다.
  const [homeView, setHomeView] = useState(false);
  const [selection, setSelection] = useState<SlotRange | null>(null);
  const [step, setStep] = useState<PanelStep>('slots');
  // 모바일 주간 블록 상세 시트(§9.3) — 확정/대기 블록 탭 시 열린다. 뷰포트 훅으로 블록 인터랙션을 게이트한다.
  const isMobileViewport = useIsMobileViewport();
  const [sheetBlock, setSheetBlock] = useState<WeekBlockDetail | null>(null);
  // 모바일 빠른 예약 시트(§11.1) — 월간 날짜 탭 시 주간 전환 대신 열린다(월간 유지). 열림은 항상 월간 상태이며
  // 주간 사이드바(showSidebar)는 주간에서만 렌더되므로 BookingForm id 이중 마운트가 없다.
  const [daySheetOpen, setDaySheetOpen] = useState(false);
  // 딥링크(주간 진입)를 모바일에서 월간+시트로 승계하는 1회성 가드(§11.1) — 최초 모바일 감지 시에만 동작.
  const deepLinkSheetHandledRef = useRef(false);
  const [submittedResult, setSubmittedResult] = useState<CreateFacilityBookingResult | null>(null);
  const [submittedClubId, setSubmittedClubId] = useState<number | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const { addToast } = useToast();
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
  // 랜딩 = 캘린더: 딥링크 facilityId 우선, 없으면 첫 시설 자동 선택. 단 homeView(명시적 홈 요청)면
  // 자동 선택을 끄고 홈 카드 그리드를 보여준다. 자동 선택은 URL 을 건드리지 않는다(사용자 상호작용만 syncUrl).
  const effectiveFacilityId = facilityId ?? (homeView ? undefined : usageQuery.data?.facilities[0]?.id);
  const availabilityQuery = useFacilityAvailabilityQuery(effectiveFacilityId, yearMonth);
  const availability = availabilityQuery.data;

  // 주간 이월(§12.1) — 표시 주가 두 달에 걸치면 조회 월(yearMonth) 밖의 인접월 가용성도 함께 조회해 병합한다.
  // 인접월은 availability 가 허용하는 {당월, 익월} 안일 때만(밖이면 창 밖이라 불필요 — 400 방지). 주간이 아니거나
  // 이월이 아니면 undefined → 훅에 facilityId undefined 를 넘겨 비활성화(기존 관례). 같은 queryKey 라 캐시 공유.
  const secondMonth =
    calendarView === 'week' && selectedDate !== null
      ? adjacentMonthToFetch(selectedDate, yearMonth, [currentMonth, shiftYearMonth(currentMonth, 1)])
      : undefined;
  const secondAvailabilityQuery = useFacilityAvailabilityQuery(
    secondMonth !== undefined ? effectiveFacilityId : undefined,
    secondMonth,
  );
  const secondAvailability = secondAvailabilityQuery.data;

  const daysByIso = useMemo(() => {
    const map = new Map<string, BookingDayAvailability>();
    for (const day of availability?.days ?? []) map.set(day.date, day);
    // 인접월 응답 병합 — 월이 달라 날짜 키 충돌은 없다(§12.1). 사이드바·현황·시트·주간 블록은 이 맵을 그대로 소비.
    for (const day of secondAvailability?.days ?? []) map.set(day.date, day);
    return map;
  }, [availability, secondAvailability]);
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

  // 딥링크로 들어온 date 가 예약 창(반월) 밖이면 선택을 정리하고 월간으로 복귀하며 안내한다.
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
    setCalendarView('month'); // 무효 딥링크는 주간을 열지 않고 월간 탐색으로 되돌린다(§1).
    setDaySheetOpen(false); // 무효 딥링크 정리 시 빠른 예약 시트도 닫는다(§11.1).
    // 스테일 date 파라미터 제거(새로고침 재발 방지). 자동 선택 시설은 URL에 기록하지 않는다 —
    // 명시적으로 고른 facilityId(state)만 보존.
    syncUrl(facilityId, null);
    addToast(`현재 예약 가능한 기간이 아니에요${windowLabel ? ` (${windowLabel})` : ''}`, { variant: 'error' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateOutOfWindow]);

  // 뷰포트가 sm 경계(640px)를 넘으면(PC 전환) 시트를 닫는다 — PC 는 시트 미사용. 블록 상세 시트(§9.3)는 그냥
  // 닫고, 빠른 예약 시트(§11.1)는 열려 있었다면 PC 동선(주간)으로 승계한다(선택 유지 — WeekBlockSheet 전례 확장).
  useEffect(() => {
    if (isMobileViewport) return;
    setSheetBlock(null);
    if (daySheetOpen) {
      setDaySheetOpen(false);
      setCalendarView('week');
    }
  }, [isMobileViewport, daySheetOpen]);

  // 딥링크 date 는 초기 뷰가 주간이지만(§1), 모바일이면 월간+빠른 예약 시트로 승계한다(§11.1). 최초 모바일 감지 시
  // 1회만 동작하고, 사용자가 이미 만진 선택(비-pristine)은 건드리지 않는다.
  useEffect(() => {
    if (deepLinkSheetHandledRef.current || !isMobileViewport) return;
    deepLinkSheetHandledRef.current = true;
    if (calendarView === 'week' && selectedDate !== null && selection === null && step === 'slots') {
      setCalendarView('month');
      setDaySheetOpen(true);
    }
  }, [isMobileViewport, calendarView, selectedDate, selection, step]);

  const resetSelectionFlow = () => {
    setSelection(null);
    setStep('slots');
    setSubmittedResult(null);
    setSubmittedClubId(null);
    setSubmittedAt(null);
    setSheetBlock(null); // 화면 전환 시 열려 있던 블록 상세 시트를 닫는다(스테일 방지).
    setDaySheetOpen(false); // 빠른 예약 시트도 함께 닫는다(§11.1) — 시트를 여는 경로는 이 호출 뒤 다시 연다.
  };

  const closePanel = () => {
    setSelectedDate(null);
    setCalendarView('month'); // 신청/선택을 닫으면 월간 탐색으로 되돌린다.
    resetSelectionFlow();
    syncUrl(effectiveFacilityId ?? null, null);
  };

  const selectFacility = (nextId: number) => {
    setFacilityId(nextId);
    setHomeView(false); // 시설 선택 시 캘린더 뷰로
    setYearMonthOverride(null); // 다음 진입 기본 월 = 창 월 계약 복원
    closePanel();
    syncUrl(nextId, null);
  };

  // 홈(시설 선택) 복귀 — closePanel 은 effectiveFacilityId 로 syncUrl 을 다시 세팅하므로 여기서는
  // closePanel 을 거치지 않고 상태를 직접 리셋한 뒤 URL 을 비운다.
  const goHome = () => {
    setFacilityId(null);
    setHomeView(true); // 명시적 홈 요청 — 자동 첫 시설 선택을 끄고 카드 그리드 노출
    setYearMonthOverride(null); // 다음 진입 기본 월 = 창 월 계약 복원
    setSelectedDate(null);
    setCalendarView('month');
    resetSelectionFlow();
    syncUrl(null, null);
  };

  // 월간 날짜 탭 → 선택일 설정 + 주간 자동 전환(§1 핵심 플로우). 주간에서 다른 날 선택도 동일 경로.
  const selectDate = (iso: string) => {
    if (iso.slice(0, 7) !== yearMonth) setYearMonthOverride(iso.slice(0, 7));
    setSelectedDate(iso);
    setCalendarView('week');
    resetSelectionFlow();
    syncUrl(effectiveFacilityId ?? null, iso);
  };

  // 월간 그리드의 날짜 탭 진입점(§11.1) — 모바일은 주간 전환 대신 월간 유지 + 빠른 예약 시트, PC 는 기존 주간 전환.
  const selectDateFromMonth = (iso: string) => {
    if (!isMobileViewport) {
      selectDate(iso);
      return;
    }
    // 모바일: selectedDate·syncUrl 은 기존과 동일하되 월간 뷰를 유지하고 시트를 연다.
    if (iso.slice(0, 7) !== yearMonth) setYearMonthOverride(iso.slice(0, 7));
    setSelectedDate(iso);
    resetSelectionFlow(); // 이전 선택/제출/시트 정리 후
    setDaySheetOpen(true); // 빠른 예약 시트 오픈(뒤 호출이 이긴다).
    syncUrl(effectiveFacilityId ?? null, iso);
  };

  // 시트의 "시간표로 보기"(§11.1) — 시트를 닫고 주간으로 전환한다. 선택·selectedDate 는 유지해 주간에서 이어간다.
  const openTimetableFromSheet = () => {
    setDaySheetOpen(false);
    setCalendarView('week');
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
    // 주간 뷰에서도 도달 가능(availability 에러 박스의 "이번 달로 돌아가기") —
    // selectedDate 가 null 이 되므로 월간으로 복귀하지 않으면 빈 주간 화면이 남는다.
    setCalendarView('month');
    resetSelectionFlow();
    syncUrl(effectiveFacilityId ?? null, null);
  };

  // 주 이동(§1·§4) — selectedDate ±7일. 창 경계로 클램프해 선택일(사이드바 기준)이 항상 창 안에 있게 하고
  // (§5), 새 선택일의 월로 조회 월을 스위칭한다(selectDate 경로 재사용 — availability 당월·익월 캡 안).
  const changeWeek = (delta: 1 | -1) => {
    if (selectedDate === null || windowQuery.data === undefined) return;
    const shifted = shiftDateByDays(selectedDate, delta * 7);
    const clamped =
      shifted < windowQuery.data.bookableFrom
        ? windowQuery.data.bookableFrom
        : shifted > windowQuery.data.bookableUntil
          ? windowQuery.data.bookableUntil
          : shifted;
    selectDate(clamped);
  };

  // [주] 탭(§1): 선택일 있으면 그 주로, 없으면 기준일(오늘이 창 내면 오늘, 아니면 bookableFrom)을 고른다.
  const showWeekView = () => {
    if (selectedDate !== null) {
      setCalendarView('week');
      return;
    }
    const base = windowQuery.data
      ? isWithinBookable(todayIso, windowQuery.data.bookableFrom, windowQuery.data.bookableUntil)
        ? todayIso
        : windowQuery.data.bookableFrom
      : todayIso;
    selectDate(base);
  };

  const changeCalendarView = (nextView: CalendarView) => {
    if (nextView === 'week') showWeekView();
    else {
      setCalendarView('month'); // [월] 복귀 — 선택일·선택은 유지(Google Calendar 동작, §1).
      setSheetBlock(null); // 주간을 떠나면 블록 상세 시트를 닫는다.
    }
  };

  // 주간 셀 탭(§9.5·§4) — 같은 선택일이면 토글, 다른 날이면 그 날로 전환 후 단일 선택.
  // WeekTimetable 의 onTapSlot 으로 연결된다(선택일 컬럼=toggleSlot, 타 요일=selectDate 후 단일 선택).
  const tapWeekSlot = (iso: string, slotStart: string) => {
    if (iso === selectedDate && step === 'slots') {
      toggleSlot(slotStart);
      return;
    }
    // 타 요일 탭 또는 폼/성공 스텝 중 탭 = 새 신청 시작. 성공 화면의 확정 범위(selection)를
    // 라이브로 변조하지 않도록 스텝·제출 상태를 리셋한 뒤 탭한 슬롯 단일 선택으로 연다.
    if (iso === selectedDate) resetSelectionFlow();
    else selectDate(iso);
    const endLabel = `${String(Number(slotStart.slice(0, 2)) + 1).padStart(2, '0')}:${slotStart.slice(3, 5)}`;
    setSelection({ start: slotStart, end: endLabel });
  };

  // 주간 이동 캡(§2) — 주 월요일이 [창 시작 주 ~ 창 끝 주] 밖이면 비활성. 창 판정은 windowQuery 로 단일화.
  const weekMonday = selectedDate !== null ? mondayOf(selectedDate) : null;
  const windowFromMonday = windowQuery.data ? mondayOf(windowQuery.data.bookableFrom) : null;
  const windowUntilMonday = windowQuery.data ? mondayOf(windowQuery.data.bookableUntil) : null;
  const canPrevWeek =
    weekMonday !== null && windowFromMonday !== null && shiftDateByDays(weekMonday, -7) >= windowFromMonday;
  const canNextWeek =
    weekMonday !== null && windowUntilMonday !== null && shiftDateByDays(weekMonday, 7) <= windowUntilMonday;

  const periodLabel =
    calendarView === 'week' && weekMonday !== null ? weekRangeLabel(weekMonday) : yearMonthLabel(yearMonth);

  // 신청 성공 처리 — 제출 시각 캡처 + 성공 스텝 전환. 주간 사이드바 패널·모바일 빠른 예약 시트가 공유한다.
  const handleSubmitted = (result: CreateFacilityBookingResult, clubId: number) => {
    const now = new Date();
    setSubmittedAt(
      `${now.getMonth() + 1}월 ${now.getDate()}일 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    );
    setSubmittedResult(result);
    setSubmittedClubId(clubId);
    setStep('success');
  };

  const panel =
    selectedDay !== undefined && selectedFacility !== undefined ? (
      <BookingPanel
        facility={selectedFacility}
        day={selectedDay}
        selection={selection}
        onToggleSlot={toggleSlot}
        step={step}
        onProceedToForm={() => setStep('form')}
        onBackToSlots={() => setStep('slots')}
        submittedResult={submittedResult}
        submittedClubId={submittedClubId}
        submittedAt={submittedAt}
        onSubmitted={handleSubmitted}
        onExploreOther={goHome}
        onClose={closePanel}
      />
    ) : null;

  const showSidebar = calendarView === 'week' && panel !== null;

  return (
    <main className="mx-auto max-w-layout px-4 pb-16 pt-8 sm:px-6 md:px-10">
      {usageQuery.isLoading && <BookingHomeSkeleton />}
      {usageQuery.isError && (
        <p role="alert" className="text-sm text-charcoal-2">시설 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
      )}

      {usageQuery.isSuccess && (
        <div className="space-y-4">
          {homeView || effectiveFacilityId === undefined || usageQuery.data.facilities.length === 0 ? (
            // ── 홈 뷰: 시설 선택 카드 그리드 ── (명시적 홈 요청 또는 시설 0개)
            // effectiveFacilityId === undefined 는 시설 0개일 때만 참(시설 있으면 첫 시설 자동 선택) —
            // 여기 넣어 캘린더 분기에서 effectiveFacilityId 를 number 로 좁힌다.
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
            // ── 캘린더 뷰: 선택 시설 예약(월↔주 전환) ──
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

              <div className={showSidebar ? 'md:grid md:grid-cols-[minmax(0,1fr)_380px] md:gap-5' : undefined}>
                {/* 공용 캘린더 카드 — 상단 헤더(월↔주 토글·기간·화살표·범례) + 월간/주간 본문(§2·§3·§4). */}
                <section className="rounded-lg border border-line bg-paper p-4 sm:p-5" aria-label="예약 캘린더">
                  <BookingViewHeader
                    view={calendarView}
                    onChangeView={changeCalendarView}
                    periodLabel={periodLabel}
                    onPrev={calendarView === 'month' ? () => changeMonth(-1) : () => changeWeek(-1)}
                    onNext={calendarView === 'month' ? () => changeMonth(1) : () => changeWeek(1)}
                    canPrev={calendarView === 'month' ? yearMonth !== currentMonth : canPrevWeek}
                    canNext={calendarView === 'month' ? yearMonth === currentMonth : canNextWeek}
                  />
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
                  {availability && calendarView === 'month' && (
                    <BookingCalendar
                      yearMonth={yearMonth}
                      daysByIso={daysByIso}
                      bookableFrom={availability.bookableFrom}
                      bookableUntil={availability.bookableUntil}
                      todayIso={todayIso}
                      selectedDate={selectedDate}
                      onSelectDate={selectDateFromMonth}
                      onOutOfWindowSelect={handleOutOfWindowSelect}
                      windowLabel={windowLabel}
                      ranges={windowQuery.data?.availableBookingRanges ?? null}
                    />
                  )}
                  {availability && calendarView === 'week' && selectedDate !== null && (
                    <WeekTimetable
                      selectedDate={selectedDate}
                      daysByIso={daysByIso}
                      bookableFrom={availability.bookableFrom}
                      bookableUntil={availability.bookableUntil}
                      todayIso={todayIso}
                      selection={selection}
                      onSelectDate={selectDate}
                      onTapSlot={tapWeekSlot}
                      blocksInteractive={isMobileViewport}
                      onTapBlock={setSheetBlock}
                    />
                  )}
                </section>
                {/* 주간 전용 사이드바(§5) — 데스크탑 우측 sticky, 모바일 그리드 아래 세로 스택(시트 제거). */}
                {showSidebar && (
                  <aside className="mt-4 rounded-lg border border-line bg-paper p-4 md:mt-0 md:sticky md:top-4 md:self-start">
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

      {/* 모바일 주간 블록 상세 바텀시트(§9.3) — 포털 렌더라 위치 무관, 열림은 block!==null 로 제어. */}
      <WeekBlockSheet block={sheetBlock} onClose={() => setSheetBlock(null)} />

      {/* 모바일 빠른 예약 바텀시트(§11.1) — 월간 날짜 탭 시 열린다(월간 유지). 열림은 daySheetOpen 으로 제어하고,
          열려 있는 동안 calendarView 는 항상 'month' 라 주간 사이드바 폼과 이중 마운트가 없다. */}
      <MobileDaySheet
        open={daySheetOpen}
        dateIso={selectedDate}
        facility={selectedFacility ?? null}
        day={selectedDay ?? null}
        selection={selection}
        onToggleSlot={toggleSlot}
        step={step}
        onProceedToForm={() => setStep('form')}
        onBackToSlots={() => setStep('slots')}
        submittedResult={submittedResult}
        submittedClubId={submittedClubId}
        submittedAt={submittedAt}
        onSubmitted={handleSubmitted}
        onExploreOther={goHome}
        onClose={closePanel}
        onViewTimetable={openTimetableFromSheet}
      />
    </main>
  );
}
