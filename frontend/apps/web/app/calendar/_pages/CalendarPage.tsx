'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDaysIso,
  monthsInRange,
  useCalendarMonthQuery,
  useCalendarMonthsQuery,
  useManagedClubsQuery,
  useMeQuery,
} from '@duing/hooks';

import { useBackDismiss } from '@/app/_lib/backDismiss';
import { useHydrated } from '@/app/_lib/useHydrated';
import { SparkleFull } from '../../_components/Sparkle';
import { AddEventDispatcher } from '../_components/AddEventDispatcher';
import { EventDetailModal } from '../_components/EventDetailModal';
import { Icon } from '../_components/CalendarIcons';
import { UpcomingCards } from '../_components/UpcomingCards';
import { UpcomingTimeline } from '../_components/UpcomingTimeline';
import {
  toCalEvent_clubEvent,
  toCalEvent_global,
  toCalEvent_recruitment,
} from '../_lib/calendarMappers';
import { ACCENT, KIND_ACCENT, KIND_LABEL, KIND_ORDER } from '../_lib/calendarDisplay';
import { buildUpcoming, resolveUpcomingEmptyState, UPCOMING_WINDOW_DAYS } from '../_lib/upcoming';

import type { CalEvent, EventKind } from '../_types';

type MonthCell = {
  iso: string;
  d: number;
  inMonth: boolean;
  dow: number;
};

/* ------------------------------------------------------------------ */
/* Accent / label                                                       */
/* ------------------------------------------------------------------ */

// 필터 원인 판정용 — 매 렌더 새 Set 을 만들면 useMemo 가 무의미해진다.
const ALL_KINDS = new Set(KIND_ORDER);

const KR_MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const fmt = (year: number, monthIndex: number, day: number): string =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const dayOfWeekKR = (iso: string): string => {
  const parts = iso.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const weekday = new Date(year, month - 1, day).getDay();
  return ['일', '월', '화', '수', '목', '금', '토'][weekday] ?? '';
};

/* Build a 6×7 month grid (Sun-start). */
const buildMonth = (year: number, monthIndex: number): MonthCell[] => {
  const first = new Date(year, monthIndex, 1);
  const startCol = first.getDay();         // 0=Sun
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const prevDays = new Date(year, monthIndex, 0).getDate();
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const offset = i - startCol;
    let day: number, month: number, year2: number, inMonth: boolean;
    if (offset < 0) {
      day = prevDays + offset + 1; month = monthIndex - 1; year2 = year; inMonth = false;
    } else if (offset >= daysInMonth) {
      day = offset - daysInMonth + 1; month = monthIndex + 1; year2 = year; inMonth = false;
    } else {
      day = offset + 1; month = monthIndex; year2 = year; inMonth = true;
    }
    if (month < 0)  { month = 11; year2 -= 1; }
    if (month > 11) { month = 0;  year2 += 1; }
    cells.push({ iso: fmt(year2, month, day), d: day, inMonth, dow: i % 7 });
  }
  return cells;
};

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export function CalendarPage() {
  const today = new Date();
  const todayIso = fmt(today.getFullYear(), today.getMonth(), today.getDate());

  const [viewYear, setViewYear] = useState<number>(today.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(today.getMonth()); // 0-indexed
  const [activeKinds, setActiveKinds] = useState<Set<EventKind>>(new Set(KIND_ORDER));
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [detailOpen, setDetailOpen] = useState<boolean>(false);
  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [eventDetailOpen, setEventDetailOpen] = useState<boolean>(false);

  // 비로그인 배너는 하이드레이션 이후에만 그린다 — 조건의 meQuery.isLoading 이 하이드레이션 안정적이지 않다.
  // 서버에는 me 쿼리 fetch 가 없어 항상 fetchStatus='idle'(isLoading=false) 인데, 클라이언트는 부팅 복원
  // (providers 모듈 스코프의 startBootSessionRestore 가 하이드레이션 전에 요청을 띄우고
  // AuthSessionBootstrap 이 그걸 me 키에 등록한다)으로 'fetching'(isLoading=true) 인 채로 첫 렌더를 맞는다.
  // 그래서 서버는 배너를 그리고 클라이언트 첫 렌더는 빼면서 불일치가 났다. 로그인 유도 힌트라 SSR 프레임에 없어도 된다.
  const hydrated = useHydrated();

  // 모바일에서는 바텀시트, 데스크톱에서는 사이드 패널 — 뷰포트 분기 없이 뒤로가기로 닫는다.
  useBackDismiss(detailOpen, () => setDetailOpen(false));

  const calendarCardRef = useRef<HTMLDivElement>(null);
  // ResizeObserver 첫 콜백 전에는 null — 그 동안에는 minHeight fallback 으로 첫 프레임 깜빡임 방지.
  const [calendarCardHeight, setCalendarCardHeight] = useState<number | null>(null);

  useEffect(() => {
    const calendarCard = calendarCardRef.current;
    if (!calendarCard) return;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setCalendarCardHeight(Math.round(entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height));
      }
    });
    resizeObserver.observe(calendarCard);
    return () => resizeObserver.disconnect();
  }, []);

  const yearMonth = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;

  const meQuery = useMeQuery();
  const isAuthenticated = !!meQuery.data;
  // 총동연은 어느 동아리의 멤버도 아니라 동아리별 조회로는 아무것도 못 본다 —
  // 전 동아리 집계 1건으로 대체한다. role 확정 전에는 false 라 학생 경로로 시작하지만,
  // 그동안 myClubs 가 비어 per-club 요청이 나가지 않으므로 낭비되는 요청은 없다.
  const isAdmin = meQuery.data?.role === 'ADMIN';
  // '내 일정 추가' 노출 조건 — AddEventDispatcher 의 권한 기준(운영진 보유 or ADMIN)과 동일.
  // 비로그인 시 managed 호출 skip(401 노이즈 방지)도 디스패처와 같은 패턴.
  const managedClubsQuery = useManagedClubsQuery({ enabled: isAuthenticated });
  const canAddEvent = isAdmin || (managedClubsQuery.data ?? []).length > 0;

  // mapper 안정화 — 모듈 스코프 함수이므로 deps 비어있어도 stable.
  const calendarMappers = useMemo(
    () => ({
      toGlobal: toCalEvent_global,
      toRecruitment: toCalEvent_recruitment,
      toClubEvent: toCalEvent_clubEvent,
    }),
    [],
  );

  const calendar = useCalendarMonthQuery(yearMonth, {
    isAuthenticated,
    isAdmin,
    mappers: calendarMappers,
  });
  const { events } = calendar;

  const filteredEvents = events.filter((event) => activeKinds.has(event.kind));
  const eventsByDate = filteredEvents.reduce<Record<string, CalEvent[]>>((acc, event) => {
    (acc[event.date] = acc[event.date] || []).push(event);
    return acc;
  }, {});

  const monthCells = buildMonth(viewYear, viewMonth);
  const viewMonthPrefix = yearMonth;
  const inMonth = (iso: string) => iso.startsWith(viewMonthPrefix);

  const stats = {
    total:    events.filter((event) => inMonth(event.date)).length,
    system:   events.filter((event) => inMonth(event.date) && event.kind === 'system').length,
    deadline: events.filter((event) => inMonth(event.date) && event.kind === 'deadline').length,
    event:    events.filter((event) => inMonth(event.date) && event.kind === 'event').length,
  };

  const dayEvents = (eventsByDate[selectedDate] || []).slice().sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  );

  // Upcoming 은 보고 있는 달과 무관하게 "오늘부터 30일" 을 본다(달을 넘겨도 목록이 그대로다).
  // 창이 걸치는 달은 1~3개 — 2월이 짧아 1월 말에는 3월까지 들어간다. 쿼리 키가 월 단위라
  // 이번 달을 보고 있는 동안 겹치는 달은 캐시 히트로 추가 요청이 없다.
  const upcomingMonths = useMemo(
    () => monthsInRange(todayIso, addDaysIso(todayIso, UPCOMING_WINDOW_DAYS)),
    [todayIso],
  );
  const upcomingCalendar = useCalendarMonthsQuery(upcomingMonths, {
    isAuthenticated,
    isAdmin,
    mappers: calendarMappers,
  });
  const upcoming = useMemo(
    () => buildUpcoming(upcomingCalendar.events, todayIso, activeKinds),
    [upcomingCalendar.events, todayIso, activeKinds],
  );
  // 필터가 원인인지 판정하려면 "모두 켠 결과" 와 비교해야 한다 — 칩이 일부 꺼졌다는 사실만으로는
  // 원래 0건인 경우까지 "필터를 켜면 볼 수 있어요" 라는 거짓 안내를 하게 된다.
  const upcomingUnfiltered = useMemo(
    () => buildUpcoming(upcomingCalendar.events, todayIso, ALL_KINDS),
    [upcomingCalendar.events, todayIso],
  );
  const upcomingEmptyState = resolveUpcomingEmptyState({
    visibleCount: upcoming.length,
    unfilteredCount: upcomingUnfiltered.length,
    // 동아리 일정 쿼리는 인증이 확정된 뒤에야 시작한다 — meQuery 로딩을 빼면 로그인 사용자에게
    // "일정이 없어요" 가 잠깐 떴다가 목록으로 바뀐다.
    isLoading: upcomingCalendar.isLoading || meQuery.isLoading,
  });

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((prev) => prev - 1);
      setViewMonth(11);
    } else {
      setViewMonth((prev) => prev - 1);
    }
    setDetailOpen(false);
  };
  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((prev) => prev + 1);
      setViewMonth(0);
    } else {
      setViewMonth((prev) => prev + 1);
    }
    setDetailOpen(false);
  };

  const handleEventClick = (event: CalEvent) => {
    setSelectedEvent(event);
    setEventDetailOpen(true);
  };

  const toggleKind = (kind: EventKind) => {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  return (
    <div className="duing" style={{ background: 'var(--cream)', minHeight: '100%' }}>

      {/* ===== 비로그인 배너 ===== */}
      {hydrated && !isAuthenticated && !meQuery.isLoading && (
        <div className="bg-coral/10 text-[13px] text-coral px-6 py-2 text-center">
          내 동아리 일정을 보려면 로그인해주세요.
        </div>
      )}

      {/* ===== 부분 도메인 에러 배너 ===== */}
      {(calendar.isError || upcomingCalendar.isError) && (
        <div className="bg-coral/10 text-[13px] text-coral px-6 py-2 text-center">
          일부 일정을 불러오지 못했습니다.
        </div>
      )}

      {/* ===== Header ===== */}
      <section className="cal-section cal-header" style={{ padding: 'var(--page-top) 40px 28px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div className="cal-header-row" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32, marginBottom: 28 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', letterSpacing: '0.08em', marginBottom: 10 }}>
                CAMPUS CALENDAR · 캠퍼스 캘린더
              </div>
              {/* keep-all — 모바일에서 접힐 때 어절 단위로만 줄바꿈. 스파클은 마지막 어절과
                  nowrap 으로 묶어 단독 줄바꿈(장식만 다음 줄로 떨어지는 현상)을 막는다. */}
              <h1 className="cal-h1" style={{ fontSize: 56, lineHeight: 1.05, wordBreak: 'keep-all' }}>
                이번 달 캠퍼스 일정{' '}
                <span style={{ whiteSpace: 'nowrap' }}>
                  한눈에
                  <SparkleFull size={28} color="var(--sage)" style={{ display: 'inline-block', margin: '0 0 0 12px', verticalAlign: 'middle' }} />
                </span>
              </h1>
            </div>

            {/* 권한(운영진/ADMIN) 없는 사용자에게는 버튼 자체를 렌더하지 않는다 — 디스패처 권한 기준과 동일. */}
            {canAddEvent && (
              <button
                type="button"
                className="cal-add-btn"
                onClick={() => setAddModalOpen(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '14px 22px', borderRadius: 999,
                  background: 'var(--ink)', border: 'none',
                  color: '#fff', fontFamily: 'inherit',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 8px 20px rgba(31,74,54,0.18)',
                  flexShrink: 0,
                }}
              >
                <Icon.plus style={{ width: 16, height: 16 }} />
                내 일정 추가
              </button>
            )}
          </div>

          {/* Stats row */}
          <div className="cal-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: '이번 달 전체 일정', num: stats.total,    color: 'var(--ink)',      dot: 'var(--sage)' },
              { label: '행사·일정',         num: stats.system,   color: '#8E6620',         dot: '#E8B968'     },
              { label: '모집 마감',         num: stats.deadline, color: '#9A3F23',         dot: '#D97757'     },
              // 총동연은 전 동아리 일정을 보므로 '내' 가 붙으면 거짓이 된다.
              { label: isAdmin ? '동아리 일정' : '내 동아리 일정', num: stats.event, color: 'var(--ink-deep)', dot: 'var(--sage)' },
            ].map((card) => (
              <div key={card.label} style={{
                background: 'var(--paper)', border: '1px solid var(--gray-line)',
                borderRadius: 16, padding: '18px 20px',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--charcoal-3)', marginBottom: 6, fontWeight: 600 }}>
                    {card.label}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700,
                    color: card.color, lineHeight: 1,
                  }}>
                    {card.num}<span style={{ fontSize: 14, color: 'var(--charcoal-3)', marginLeft: 4, fontWeight: 500 }}>건</span>
                  </div>
                </div>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: card.dot, marginBottom: 6 }} />
              </div>
            ))}
          </div>

          {/* Filter chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--charcoal-3)', letterSpacing: '0.04em', marginRight: 4 }}>
              필터 ·
            </span>
            {KIND_ORDER.map((kind) => {
              const accent = ACCENT[KIND_ACCENT[kind]];
              const active = activeKinds.has(kind);
              return (
                <button key={kind} onClick={() => toggleKind(kind)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', borderRadius: 999,
                  background: active ? accent.bg : 'var(--paper)',
                  border: `1px solid ${active ? accent.bg : 'var(--gray-line)'}`,
                  color: active ? accent.fg : 'var(--charcoal-3)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  opacity: active ? 1 : 0.7,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: accent.dot }} />
                  {KIND_LABEL[kind]}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== Main: month grid + day panel ===== */}
      <section className="cal-section" style={{ padding: '32px 40px 0' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                onClick={handlePrevMonth}
                style={{
                  width: 36, height: 36, borderRadius: 12, border: '1px solid var(--gray-line)',
                  background: 'var(--paper)', color: 'var(--charcoal-2)',
                  display: 'grid', placeItems: 'center', cursor: 'pointer',
                }}
              ><Icon.arrowLeft style={{ width: 16, height: 16 }} /></button>
              <h2 style={{ fontSize: 28, lineHeight: 1 }}>
                {viewYear}<span style={{ color: 'var(--charcoal-3)', fontWeight: 500, margin: '0 8px' }}>·</span>{KR_MONTHS[viewMonth] ?? ''}
              </h2>
              <button
                onClick={handleNextMonth}
                style={{
                  width: 36, height: 36, borderRadius: 12, border: '1px solid var(--gray-line)',
                  background: 'var(--paper)', color: 'var(--charcoal-2)',
                  display: 'grid', placeItems: 'center', cursor: 'pointer',
                }}
              ><Icon.arrowRight style={{ width: 16, height: 16 }} /></button>
            </div>
            <div className="cal-monthnav-hint" style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '7px 12px', borderRadius: 999,
              background: 'rgba(157,182,160,0.12)',
              border: '1px solid var(--gray-line)',
              color: 'var(--charcoal-3)',
              fontSize: 12.5, fontWeight: 600,
              whiteSpace: 'nowrap',
            }}>
              <span style={{
                display: 'inline-grid', placeItems: 'center',
                width: 16, height: 16, borderRadius: 999,
                background: 'var(--sage-mist)',
                color: 'var(--ink)',
                fontSize: 10, fontWeight: 800,
              }}>i</span>
              날짜를 클릭해 상세 일정을 확인하세요
            </div>
          </div>

          {/* Calendar grid + slide-in day panel */}
          <div className="cal-main-grid" style={{
            display: 'grid',
            gridTemplateColumns: detailOpen ? 'minmax(0, 1fr) 28px 360px' : 'minmax(0, 1120px) 0px 0px',
            columnGap: detailOpen ? 10 : 0,
            rowGap: 0,
            justifyContent: 'center',
            alignItems: 'stretch',
            ...(detailOpen && calendarCardHeight !== null
              ? { height: calendarCardHeight }
              : { minHeight: 790 }),
            overflow: 'hidden',
            transition: 'grid-template-columns .42s cubic-bezier(.22,.61,.36,1), gap .42s cubic-bezier(.22,.61,.36,1)',
          }}>
            <div style={{
              width: '100%',
              minWidth: 0,
              transform: detailOpen ? 'translateX(0)' : 'translateX(0)',
              transition: 'transform .42s cubic-bezier(.22,.61,.36,1)',
            }}>
            {/* —— Month grid —— */}
            <div ref={calendarCardRef} style={{
              background: 'var(--paper)', border: '1px solid var(--gray-line)',
              borderRadius: 24, overflow: 'hidden',
            }}>
              {/* Day-of-week header */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                borderBottom: '1px solid var(--gray-line)',
                background: 'var(--cream-2)',
              }}>
                {['일', '월', '화', '수', '목', '금', '토'].map((label, i) => (
                  <div key={label} className="cal-weekhead" style={{
                    padding: detailOpen ? '10px 10px' : '12px 16px',
                    fontSize: detailOpen ? 11.5 : 12, fontWeight: 700, letterSpacing: '0.06em',
                    color: i === 0 ? '#9A3F23' : i === 6 ? '#2F557A' : 'var(--charcoal-2)',
                  }}>{label}</div>
                ))}
              </div>

              {/* Cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {monthCells.map((cell, i) => {
                  const cellEvents = (eventsByDate[cell.iso] || []).slice().sort(
                    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
                  );
                  const isToday    = cell.iso === todayIso;
                  const isSelected = detailOpen && cell.iso === selectedDate;
                  const isSun      = cell.dow === 0;
                  const isSat      = cell.dow === 6;
                  const rowIdx     = Math.floor(i / 7);

                  return (
                    <button key={i} className="cal-cell" onClick={() => { setSelectedDate(cell.iso); setDetailOpen(true); }} style={{
                      minHeight: detailOpen ? 102 : 120,
                      padding: detailOpen ? 7 : 10,
                      border: 'none', background: 'transparent',
                      borderRight: cell.dow < 6 ? '1px solid var(--gray-line)' : 'none',
                      borderTop: rowIdx > 0 ? '1px solid var(--gray-line)' : 'none',
                      textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                      position: 'relative',
                      backgroundColor: isSelected ? 'var(--sage-tint)' : isToday ? 'rgba(157,182,160,0.10)' : 'transparent',
                      opacity: cell.inMonth ? 1 : 0.35,
                      display: 'flex', flexDirection: 'column', gap: 6,
                      minWidth: 0,
                      overflow: 'hidden',
                    }}>
                      {/* Day number */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="cal-daynum" style={{
                          display: 'inline-grid', placeItems: 'center',
                          minWidth: 26, height: 26,
                          padding: isToday ? '0 8px' : 0,
                          borderRadius: 999,
                          background: isToday ? 'var(--ink)' : 'transparent',
                          color: isToday ? '#fff' :
                            isSun ? '#9A3F23' : isSat ? '#2F557A' : 'var(--charcoal)',
                          fontWeight: 700,
                          fontSize: detailOpen ? 12.5 : 13.5,
                          fontFamily: 'var(--font-mono)',
                        }}>{cell.d}</span>
                        {cellEvents.length > 3 && (
                          <span style={{
                            fontSize: 10.5, fontWeight: 700, color: 'var(--charcoal-3)',
                            fontFamily: 'var(--font-mono)',
                          }}>+{cellEvents.length - 2}</span>
                        )}
                      </div>

                      {/* Event pills (max 3, summarize rest) */}
                      <div className="cal-chips" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {cellEvents.slice(0, cellEvents.length > 3 ? 2 : 3).map((event) => {
                          const accent = ACCENT[event.accent];
                          return (
                            <div key={event.id} className="cal-chip" style={{
                              fontSize: detailOpen ? 9.2 : 10.5,
                              lineHeight: 1.22, fontWeight: 600,
                              padding: detailOpen ? '3px 4px 3px 6px' : '3px 6px 3px 8px',
                              borderRadius: 5,
                              background: accent.bg,
                              color: accent.fg,
                              borderLeft: `2px solid ${accent.dot}`,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              minWidth: 0,
                            }} title={event.title}>{event.title}</div>
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            </div>

            {/* —— Center rail: detail panel toggle —— */}
            <div className="cal-center-rail" style={{
              width: detailOpen ? 28 : 0,
              minWidth: 0,
              height: '100%',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: detailOpen ? 1 : 0,
              pointerEvents: detailOpen ? 'auto' : 'none',
              transition: 'width .42s cubic-bezier(.22,.61,.36,1), opacity .24s ease',
            }}>
              <div style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: '50%',
                width: 1,
                background: 'var(--gray-line)',
                transform: 'translateX(-50%)',
              }} />
              <button
                onClick={() => setDetailOpen(false)}
                aria-label="상세 일정 접기"
                title="상세 일정 접기"
                style={{
                  position: 'sticky',
                  top: 280,
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: '1px solid var(--sage-soft)',
                  background: 'var(--paper)',
                  color: 'var(--ink)',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 20,
                  fontWeight: 700,
                  lineHeight: 1,
                  boxShadow: '0 8px 18px rgba(31,74,54,0.10)',
                  zIndex: 2,
                }}
              >
                ›
              </button>
            </div>

            {/* —— Right rail: selected day —— */}
            <aside className="cal-detail" data-open={detailOpen} style={{
              width: 360,
              minWidth: 0,
              minHeight: 0,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              transform: detailOpen ? 'translateX(0)' : 'translateX(32px)',
              opacity: detailOpen ? 1 : 0,
              pointerEvents: detailOpen ? 'auto' : 'none',
              transition: 'transform .42s cubic-bezier(.22,.61,.36,1), opacity .28s ease',
            }}>
              <div className="cal-sheet-handle" aria-hidden />
              {/* Day header card */}
              <div style={{
                background: 'var(--ink)', color: '#fff',
                borderRadius: 24, padding: '24px 24px 22px',
                position: 'relative', overflow: 'hidden',
              }}>
                <SparkleFull size={36} color="var(--sage)" style={{ position: 'absolute', top: 18, right: 22, opacity: 0.9 }} />
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10 }}>
                  {selectedDate === todayIso ? 'TODAY · 오늘' : 'SELECTED · 선택한 날짜'}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 700, lineHeight: 1, color: '#fff' }}>
                    {parseInt(selectedDate.slice(8), 10)}
                  </span>
                  <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                    {parseInt(selectedDate.split('-')[1] ?? '0', 10)}월 · {dayOfWeekKR(selectedDate)}요일
                  </span>
                </div>
                <div style={{
                  marginTop: 14, paddingTop: 12,
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 12, color: 'rgba(255,255,255,0.6)',
                }}>
                  <span>{dayEvents.length}건의 일정</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedDate}</span>
                </div>
              </div>

              {/* Day events list */}
              <div style={{
                background: 'var(--paper)', border: '1px solid var(--gray-line)',
                borderRadius: 24, padding: '8px 0', flex: 1,
                overflowY: 'auto', minHeight: 0,
              }}>
                {dayEvents.length === 0 && (
                  <div style={{
                    padding: '32px 24px', textAlign: 'center',
                    color: 'var(--charcoal-3)', fontSize: 13,
                  }}>
                    이 날엔 등록된 일정이 없어요.
                  </div>
                )}
                {dayEvents.map((event, i) => {
                  const accent = ACCENT[event.accent];
                  return (
                    <div
                      key={event.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleEventClick(event)}
                      onKeyDown={(keyboardEvent) => { if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') { keyboardEvent.preventDefault(); handleEventClick(event); } }}
                      style={{
                        padding: '16px 20px',
                        borderBottom: i < dayEvents.length - 1 ? '1px solid var(--gray-line)' : 'none',
                        display: 'flex', gap: 14, alignItems: 'flex-start',
                        cursor: 'pointer',
                        transition: 'background .14s ease',
                      }}
                      onMouseEnter={(mouseEvent) => { mouseEvent.currentTarget.style.background = 'var(--sage-tint)'; }}
                      onMouseLeave={(mouseEvent) => { mouseEvent.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{
                        minWidth: 60, paddingTop: 2,
                        fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700,
                        color: 'var(--charcoal-2)',
                      }}>{event.time}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '2px 8px', borderRadius: 999,
                            background: accent.bg, color: accent.fg,
                            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
                          }}>
                            <span style={{ width: 5, height: 5, borderRadius: 999, background: accent.dot }} />
                            {KIND_LABEL[event.kind]}
                          </span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-deep)', lineHeight: 1.35, marginBottom: 4 }}>
                          {event.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--charcoal-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Icon.pin style={{ width: 12, height: 12 }} />
                          {event.place}
                          {event.club && <><span>·</span><span>{event.club}</span></>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* ===== Upcoming timeline ===== */}
      <section className="cal-section" style={{ padding: '48px 40px 32px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', letterSpacing: '0.08em', marginBottom: 6 }}>
                UPCOMING · 다가오는 일정
              </div>
              <h2 style={{ fontSize: 28, lineHeight: 1.1 }}>
                앞으로 한 달, 놓치면 아쉬워요
              </h2>
            </div>
          </div>

          {upcoming.length === 0 ? (
            upcomingEmptyState !== 'hidden' && (
              <p style={{ padding: '28px 4px', fontSize: 14, color: 'var(--charcoal-3)' }}>
                {upcomingEmptyState === 'filtered-out'
                  ? '필터를 켜면 다가오는 일정을 볼 수 있어요'
                  : '앞으로 한 달간 예정된 일정이 없어요'}
              </p>
            )
          ) : (
            <>
              {/* 데스크탑 카드와 모바일 타임라인을 함께 렌더하고 CSS 로 전환한다.
                  JS 미디어쿼리 분기는 SSR 에서 첫 프레임 깜빡임·하이드레이션 불일치를 만든다. */}
              <UpcomingCards events={upcoming} todayIso={todayIso} />
              <UpcomingTimeline events={upcoming} todayIso={todayIso} onSelect={handleEventClick} />
            </>
          )}
        </div>
      </section>

      {/* 모바일 바텀시트 백드롭 — 상세 패널(cal-detail)이 모바일 시트로 뜰 때 뒤를 덮고 탭하면 닫는다. */}
      {detailOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/45 md:hidden"
          onClick={() => setDetailOpen(false)}
          aria-hidden
        />
      )}

      {/* ===== 모달 ===== */}
      <AddEventDispatcher open={addModalOpen} onClose={() => setAddModalOpen(false)} />

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          isAdmin={isAdmin}
          open={eventDetailOpen}
          onClose={() => {
            setEventDetailOpen(false);
            setSelectedEvent(null);
          }}
        />
      )}

    </div>
  );
}
