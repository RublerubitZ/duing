'use client';

import { useEffect, useRef, useState } from 'react';

import { SparkleFull } from '../../_components/Sparkle';
import { AddEventModal } from '../_components/AddEventModal';
import { DeleteConfirmModal } from '../_components/DeleteConfirmModal';
import { EventDetailModal } from '../_components/EventDetailModal';
import { EventEditModal } from '../_components/EventEditModal';

import type { NewEventCategory, NewEventInput } from '../_components/AddEventModal';
import type { AccentKey, AccentStyle, CalEvent, EventKind } from '../_types';

type MonthCell = {
  iso: string;
  d: number;
  inMonth: boolean;
  dow: number;
};

/* ------------------------------------------------------------------ */
/* Data                                                                 */
/* ------------------------------------------------------------------ */

const CAL_EVENTS_INITIAL: CalEvent[] = [
  /* — 공지 — */
  { id: 'n1',  date: '2026-05-10', kind: 'notice',    title: '동아리방 배정 신청 시작',       time: '10:00',       place: '총학생회 사이트', club: null,            accent: 'ink',   description: '2025-2학기 동아리방 배정 신청이 시작됩니다. 총학생회 사이트에서 신청서를 제출해 주세요.', contact: '총학생회 동아리국' },
  { id: 'n2',  date: '2026-05-15', kind: 'notice',    title: '2025-2학기 박람회 안내문 게시', time: '09:00',       place: '두잉 공지',       club: null,            accent: 'ink',   description: '가을 동아리 박람회(9/25~9/27) 일정, 부스 배치, 참가 동아리 목록이 공지됩니다.' },

  /* — 모집 마감 — */
  { id: 'd1',  date: '2026-05-22', kind: 'deadline',  title: 'STAT 통계학회 모집 마감',       time: '23:59',       place: '지원폼',          club: 'STAT 통계학회', accent: 'coral', description: '통계학 및 데이터 분석에 관심 있는 학생을 모집합니다. 전공 무관 지원 가능.' },
  { id: 'd2',  date: '2026-05-23', kind: 'deadline',  title: '스텝업 · K-pop 댄스 마감',      time: '23:59',       place: '지원폼',          club: '스텝업',        accent: 'coral' },
  { id: 'd3',  date: '2026-05-23', kind: 'deadline',  title: '렌즈클럽 모집 마감',            time: '23:59',       place: '지원폼',          club: '렌즈클럽',      accent: 'coral' },
  { id: 'd4',  date: '2026-05-24', kind: 'deadline',  title: '트레몰로 · 어쿠스틱 마감',      time: '23:59',       place: '지원폼',          club: '트레몰로',      accent: 'coral' },
  { id: 'd5',  date: '2026-05-24', kind: 'deadline',  title: '한모금 와인모임 마감',          time: '23:59',       place: '지원폼',          club: '한모금',        accent: 'coral' },
  { id: 'd6',  date: '2026-05-25', kind: 'deadline',  title: '씨네두잉 모집 마감',            time: '23:59',       place: '지원폼',          club: '씨네두잉',      accent: 'coral' },
  { id: 'd7',  date: '2026-05-25', kind: 'deadline',  title: '보이스라운지 모집 마감',        time: '23:59',       place: '지원폼',          club: '보이스라운지',  accent: 'coral' },
  { id: 'd8',  date: '2026-05-26', kind: 'deadline',  title: '스파크 · IR 모임 마감',         time: '23:59',       place: '지원폼',          club: '스파크',        accent: 'coral', description: '창업·IR 발표에 관심 있는 학생을 모집합니다. 매주 모임을 통해 스타트업 아이디어를 발전시킵니다.', contact: '스파크 운영진' },
  { id: 'd9',  date: '2026-05-26', kind: 'deadline',  title: '철학하는밤 모집 마감',          time: '23:59',       place: '지원폼',          club: '철학하는밤',    accent: 'coral', description: '인문학·철학에 관심 있는 누구나 환영합니다. 매달 주제를 정해 자유롭게 토론합니다.', contact: '철학하는밤 운영진' },
  { id: 'd10', date: '2026-05-27', kind: 'deadline',  title: '두잉코드 모집 마감',            time: '23:59',       place: '지원폼',          club: '두잉코드',      accent: 'coral' },
  { id: 'd11', date: '2026-05-28', kind: 'deadline',  title: '함께해요 멘토링 마감',          time: '23:59',       place: '지원폼',          club: '함께해요',      accent: 'coral' },
  { id: 'd12', date: '2026-05-28', kind: 'deadline',  title: '붓터치 회화 동아리 마감',       time: '23:59',       place: '지원폼',          club: '붓터치',        accent: 'coral' },
  { id: 'd13', date: '2026-05-29', kind: 'deadline',  title: '픽셀팩토리 모집 마감',          time: '23:59',       place: '지원폼',          club: '픽셀팩토리',    accent: 'coral' },
  { id: 'd14', date: '2026-05-30', kind: 'deadline',  title: '북클럽 두잉 모집 마감',         time: '23:59',       place: '지원폼',          club: '북클럽 두잉',   accent: 'coral' },

  /* — 박람회 (3-day, 9.25–9.27) — */
  { id: 'f1',  date: '2026-05-25', kind: 'fair',      title: '가을 동아리 박람회 D1',         time: '11:00–18:00', place: '중앙광장',        club: null, span: 3,   accent: 'warm',  description: '동아리 홍보 부스 운영 및 체험 프로그램 진행. 참여 대상: 대구대학교 재학생 전체.', contact: '학생지원팀 (053-850-5114)' },
  { id: 'f2',  date: '2026-05-26', kind: 'fair',      title: '가을 동아리 박람회 D2',         time: '11:00–18:00', place: '중앙광장',        club: null,            accent: 'warm',  description: '동아리 홍보 부스 운영 및 체험 프로그램 진행. 참여 대상: 대구대학교 재학생 전체.', contact: '학생지원팀 (053-850-5114)' },
  { id: 'f3',  date: '2026-05-27', kind: 'fair',      title: '가을 동아리 박람회 D3',         time: '11:00–17:00', place: '학생회관 1F',     club: null,            accent: 'warm',  description: '박람회 마지막 날. 오후 5시 폐막식 진행.', contact: '학생지원팀 (053-850-5114)' },

  /* — 공연 · 전시 — */
  { id: 's1',  date: '2026-05-13', kind: 'show',      title: '두드림 가을 쇼케이스',          time: '19:30',       place: '소극장',          club: '두드림',        accent: 'berry', description: '밴드 동아리 두드림의 2025년 가을 정기 공연. 입장 무료, 선착순 100석.' },
  { id: 's2',  date: '2026-05-21', kind: 'show',      title: '씨네두잉 상영회 — 〈Past Lives〉', time: '19:00',     place: '인문관 305',      club: '씨네두잉',      accent: 'berry', description: '셀린 송 감독의 2023년 작품 〈Past Lives〉 상영 및 영화 토론. 음료 제공.' },
  { id: 's3',  date: '2026-05-19', kind: 'show',      title: '붓터치 9월 전시 오프닝',        time: '17:00',       place: '디자인관 로비',   club: '붓터치',        accent: 'berry', description: '회원 작품 20점 전시. 9월 19일 ~ 9월 30일 상시 관람 가능.' },

  /* — 정기 모임 (every-week) — */
  { id: 'm1',  date: '2026-05-16', kind: 'meet',      title: '트레몰로 합주',                 time: '19:00',       place: '동아리방 B',      club: '트레몰로',      accent: 'sage'  },
  { id: 'm2',  date: '2026-05-23', kind: 'meet',      title: '트레몰로 합주',                 time: '19:00',       place: '동아리방 B',      club: '트레몰로',      accent: 'sage'  },
  { id: 'm3',  date: '2026-05-30', kind: 'meet',      title: '트레몰로 합주',                 time: '19:00',       place: '동아리방 B',      club: '트레몰로',      accent: 'sage'  },
  { id: 'm4',  date: '2026-05-17', kind: 'meet',      title: '두잉코드 스터디',               time: '20:00',       place: '공학관 412',      club: '두잉코드',      accent: 'sage'  },
  { id: 'm5',  date: '2026-05-24', kind: 'meet',      title: '두잉코드 스터디',               time: '20:00',       place: '공학관 412',      club: '두잉코드',      accent: 'sage'  },
  { id: 'm6',  date: '2026-05-18', kind: 'meet',      title: '북클럽 두잉 — 9월 모임',        time: '19:00',       place: '도서관 토론실',   club: '북클럽 두잉',   accent: 'sage'  },
  { id: 'm7',  date: '2026-05-20', kind: 'meet',      title: 'STAT 데이터 워크샵',            time: '14:00',       place: '사회과학관 211',  club: 'STAT 통계학회', accent: 'sage'  },

  /* — 봉사 — */
  { id: 'v1',  date: '2026-05-20', kind: 'volunteer', title: '함께해요 멘토링 OT',            time: '10:00',       place: '지역아동센터',    club: '함께해요',      accent: 'sky',   description: '지역 아동센터 학습 멘토링 오리엔테이션. 참여 전 필수 출석.' },
];

/* Accent palette */
const ACCENT: Record<AccentKey, AccentStyle> = {
  ink:    { dot: 'var(--ink)',      bg: 'var(--sage-mist)', fg: 'var(--ink-deep)' },
  coral:  { dot: '#D97757',         bg: '#FCE2D9',          fg: '#9A3F23'         },
  warm:   { dot: '#E8B968',         bg: '#FBEFD7',          fg: '#8E6620'         },
  berry:  { dot: '#B65672',         bg: '#F6DCE3',          fg: '#7E2A45'         },
  sage:   { dot: 'var(--sage)',     bg: 'var(--sage-tint)', fg: 'var(--ink-deep)' },
  sky:    { dot: '#6A95B8',         bg: '#DDE8F1',          fg: '#2F557A'         },
};

const KIND_LABEL: Record<EventKind, string> = {
  notice:    '공지',
  deadline:  '모집 마감',
  fair:      '박람회',
  show:      '공연·전시',
  meet:      '정기 모임',
  volunteer: '봉사',
};

const KIND_ORDER: EventKind[] = ['fair', 'deadline', 'show', 'meet', 'volunteer', 'notice'];

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const TODAY = '2026-05-26';

const fmt = (y: number, m: number, d: number): string =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const dateKR = (iso: string): string => {
  const [, m, d] = iso.split('-').map(Number);
  return `${m}월 ${d}일`;
};

const dayOfWeekKR = (iso: string): string => {
  const parts = iso.split('-').map(Number);
  const y = parts[0] ?? 0, m = parts[1] ?? 1, d = parts[2] ?? 1;
  const wd = new Date(y, m - 1, d).getDay();
  return (['일', '월', '화', '수', '목', '금', '토'][wd]) ?? '';
};

/* Build May 2026 month grid (6 rows × 7 cols, Sun-start) */
const buildMonth = (year: number, month: number): MonthCell[] => {
  const first = new Date(year, month, 1);
  const startCol = first.getDay();         // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const offset = i - startCol;
    let d: number, m: number, y: number, inMonth: boolean;
    if (offset < 0) {
      d = prevDays + offset + 1; m = month - 1; y = year; inMonth = false;
    } else if (offset >= daysInMonth) {
      d = offset - daysInMonth + 1; m = month + 1; y = year; inMonth = false;
    } else {
      d = offset + 1; m = month; y = year; inMonth = true;
    }
    if (m < 0)  { m = 11; y -= 1; }
    if (m > 11) { m = 0;  y += 1; }
    cells.push({ iso: fmt(y, m, d), d, inMonth, dow: i % 7 });
  }
  return cells;
};

/* ------------------------------------------------------------------ */
/* Icons                                                                */
/* ------------------------------------------------------------------ */

/* Icon.* 는 프로젝트에 전역 객체로 존재하지 않으므로 동일한 모양의 인라인 SVG로 대체 */
function IconArrowLeft(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function IconArrowRight(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function IconPin(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconPlus(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

const Icon = {
  arrowLeft: IconArrowLeft,
  arrowRight: IconArrowRight,
  pin: IconPin,
  plus: IconPlus,
};

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

const CATEGORY_TO_ACCENT: Record<NewEventCategory, { kind: EventKind; accent: AccentKey }> = {
  meet:      { kind: 'meet',      accent: 'sage'  },
  deadline:  { kind: 'deadline',  accent: 'coral' },
  show:      { kind: 'show',      accent: 'berry' },
  volunteer: { kind: 'volunteer', accent: 'sky'   },
  notice:    { kind: 'notice',    accent: 'ink'   },
  etc:       { kind: 'notice',    accent: 'ink'   },
};

const addDays = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const base = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
  base.setDate(base.getDate() + days);
  return fmt(base.getFullYear(), base.getMonth(), base.getDate());
};

const addMonths = (iso: string, months: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const base = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
  base.setMonth(base.getMonth() + months);
  return fmt(base.getFullYear(), base.getMonth(), base.getDate());
};

const expandRepeat = (input: NewEventInput): string[] => {
  const { repeat, date } = input;
  if (repeat.freq === 'none') return [date];
  const dates: string[] = [];
  for (let i = 0; i < repeat.count; i++) {
    if (repeat.freq === 'weekly') dates.push(addDays(date, i * 7));
    else dates.push(addMonths(date, i));
  }
  return dates;
};

const KR_MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

export function CalendarPage() {
  const [viewMonth, setViewMonth] = useState<number>(4); // 0-indexed, 4 = May
  const [activeKinds, setActiveKinds] = useState<Set<EventKind>>(new Set(KIND_ORDER));
  const [selectedDate, setSelectedDate] = useState<string>(TODAY);
  const [detailOpen, setDetailOpen] = useState<boolean>(false);
  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
  const [events, setEvents] = useState<CalEvent[]>([...CAL_EVENTS_INITIAL]);

  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);

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
  const [eventDetailOpen, setEventDetailOpen] = useState<boolean>(false);
  const [eventEditOpen, setEventEditOpen] = useState<boolean>(false);
  const [eventDeleteConfirmOpen, setEventDeleteConfirmOpen] = useState<boolean>(false);

  const handlePrevMonth = () => { setViewMonth(prev => prev - 1); setDetailOpen(false); };
  const handleNextMonth = () => { setViewMonth(prev => prev + 1); setDetailOpen(false); };

  const handleAddEvent = (input: NewEventInput) => {
    const mapping = CATEGORY_TO_ACCENT[input.category];
    const timeLabel = input.startTime
      ? input.endTime && input.endTime !== input.startTime
        ? `${input.startTime}–${input.endTime}`
        : input.startTime
      : '';
    const dates = expandRepeat(input);
    const baseId = `u${Date.now()}`;
    const newEvents: CalEvent[] = dates.map((d, i) => ({
      id: `${baseId}-${i}`,
      date: d,
      kind: mapping.kind,
      title: input.title,
      time: timeLabel,
      place: input.place || '장소 미정',
      club: null,
      accent: mapping.accent,
      description: input.memo || undefined,
    }));
    setEvents((prev) => [...prev, ...newEvents]);
    setAddModalOpen(false);
    setSelectedDate(dates[0] ?? input.date);
    setDetailOpen(true);
  };

  const handleEventClick = (ev: CalEvent) => {
    setSelectedEvent(ev);
    setEventDetailOpen(true);
  };

  const handleEventEdit = () => {
    setEventDetailOpen(false);
    setEventEditOpen(true);
  };

  const handleEventDelete = () => {
    setEventDetailOpen(false);
    setEventDeleteConfirmOpen(true);
  };

  const handleEventSave = (updated: CalEvent) => {
    setEvents((prev) => prev.map((ev) => ev.id === updated.id ? updated : ev));
    setSelectedEvent(updated);
    setEventEditOpen(false);
    setEventDetailOpen(true);
  };

  const handleEventDeleteConfirm = () => {
    if (selectedEvent) {
      setEvents((prev) => prev.filter((ev) => ev.id !== selectedEvent.id));
    }
    setEventDeleteConfirmOpen(false);
    setSelectedEvent(null);
  };

  const toggleKind = (k: EventKind) => {
    setActiveKinds(prev => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const allEvents = events;
  const filteredEvents = allEvents.filter(e => activeKinds.has(e.kind));
  const eventsByDate = filteredEvents.reduce<Record<string, CalEvent[]>>((acc, e) => {
    (acc[e.date] = acc[e.date] || []).push(e);
    return acc;
  }, {});

  const monthCells = buildMonth(2026, viewMonth);

  const viewMonthPrefix = `2026-${String(viewMonth + 1).padStart(2, '0')}`;

  /* Stats */
  const inMonth = (iso: string) => iso.startsWith(viewMonthPrefix);
  const stats = {
    total:    allEvents.filter(e => inMonth(e.date)).length,
    deadline: allEvents.filter(e => inMonth(e.date) && e.kind === 'deadline').length,
    fair:     allEvents.filter(e => inMonth(e.date) && e.kind === 'fair').length,
    meet:     allEvents.filter(e => inMonth(e.date) && e.kind === 'meet').length,
  };

  /* Day-detail events */
  const dayEvents = (eventsByDate[selectedDate] || []).slice().sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
  );

  /* Upcoming — next 6 events after today */
  const upcoming = filteredEvents
    .filter(e => e.date >= TODAY)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .slice(0, 6);

  return (
    <div className="duing" style={{ background: 'var(--cream)', minHeight: '100%' }}>

      {/* ===== Header ===== */}
      <section style={{ padding: '48px 40px 28px', borderBottom: '1px solid var(--gray-line)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32, marginBottom: 28 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', letterSpacing: '0.08em', marginBottom: 10 }}>
                CAMPUS CALENDAR · 캠퍼스 캘린더
              </div>
              <h1 style={{ fontSize: 56, marginBottom: 12, lineHeight: 1.05 }}>
                이번 달, 캠퍼스에는
                <SparkleFull size={28} color="var(--sage)" style={{ display: 'inline-block', margin: '0 6px 0 12px', verticalAlign: 'middle' }} />
                <br />
                무슨 일이 있을까?
              </h1>
              <p style={{ fontSize: 15.5, color: 'var(--charcoal-2)', maxWidth: 640 }}>
                동아리 모집 마감, 면접일, 정기 모임까지 — 나의 동아리 일정을 한 화면에서.
                <br />
                동아리 일정은 자동으로 표시되고 캘린더에 추가할 수 있습니다.
              </p>
            </div>

            <button
              type="button"
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
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: '이번 달 전체 일정',  num: stats.total,    color: 'var(--ink)',      dot: 'var(--sage)' },
              { label: '모집 마감',           num: stats.deadline, color: '#9A3F23',         dot: '#D97757'     },
              { label: '박람회 · 행사',       num: stats.fair,     color: '#8E6620',         dot: '#E8B968'     },
              { label: '내 동아리 정기 모임', num: stats.meet,     color: 'var(--ink-deep)', dot: 'var(--sage)' },
            ].map((s) => (
              <div key={s.label} style={{
                background: 'var(--paper)', border: '1px solid var(--gray-line)',
                borderRadius: 16, padding: '18px 20px',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--charcoal-3)', marginBottom: 6, fontWeight: 600 }}>
                    {s.label}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700,
                    color: s.color, lineHeight: 1,
                  }}>
                    {s.num}<span style={{ fontSize: 14, color: 'var(--charcoal-3)', marginLeft: 4, fontWeight: 500 }}>건</span>
                  </div>
                </div>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: s.dot, marginBottom: 6 }} />
              </div>
            ))}
          </div>

          {/* Filter chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--charcoal-3)', letterSpacing: '0.04em', marginRight: 4 }}>
              필터 ·
            </span>
            {KIND_ORDER.map(k => {
              const a = ACCENT[k === 'fair' ? 'warm' : k === 'deadline' ? 'coral' : k === 'show' ? 'berry' : k === 'meet' ? 'sage' : k === 'volunteer' ? 'sky' : 'ink'];
              const active = activeKinds.has(k);
              return (
                <button key={k} onClick={() => toggleKind(k)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', borderRadius: 999,
                  background: active ? a.bg : 'var(--paper)',
                  border: `1px solid ${active ? a.bg : 'var(--gray-line)'}`,
                  color: active ? a.fg : 'var(--charcoal-3)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  opacity: active ? 1 : 0.7,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: a.dot }} />
                  {KIND_LABEL[k]}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== Main: month grid + day panel ===== */}
      <section style={{ padding: '32px 40px 0' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                onClick={handlePrevMonth}
                disabled={viewMonth === 0}
                style={{
                  width: 36, height: 36, borderRadius: 12, border: '1px solid var(--gray-line)',
                  background: 'var(--paper)', color: viewMonth === 0 ? 'var(--charcoal-3)' : 'var(--charcoal-2)',
                  display: 'grid', placeItems: 'center', cursor: viewMonth === 0 ? 'not-allowed' : 'pointer',
                  opacity: viewMonth === 0 ? 0.4 : 1,
                }}
              ><Icon.arrowLeft style={{ width: 16, height: 16 }} /></button>
              <h2 style={{ fontSize: 28, lineHeight: 1 }}>
                2026<span style={{ color: 'var(--charcoal-3)', fontWeight: 500, margin: '0 8px' }}>·</span>{KR_MONTHS[viewMonth] ?? ''}
              </h2>
              <button
                onClick={handleNextMonth}
                disabled={viewMonth === 11}
                style={{
                  width: 36, height: 36, borderRadius: 12, border: '1px solid var(--gray-line)',
                  background: 'var(--paper)', color: viewMonth === 11 ? 'var(--charcoal-3)' : 'var(--charcoal-2)',
                  display: 'grid', placeItems: 'center', cursor: viewMonth === 11 ? 'not-allowed' : 'pointer',
                  opacity: viewMonth === 11 ? 0.4 : 1,
                }}
              ><Icon.arrowRight style={{ width: 16, height: 16 }} /></button>
            </div>
            <div style={{
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
          <div style={{
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
                {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                  <div key={d} style={{
                    padding: detailOpen ? '10px 10px' : '12px 16px',
                    fontSize: detailOpen ? 11.5 : 12, fontWeight: 700, letterSpacing: '0.06em',
                    color: i === 0 ? '#9A3F23' : i === 6 ? '#2F557A' : 'var(--charcoal-2)',
                  }}>{d}</div>
                ))}
              </div>

              {/* Cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {monthCells.map((cell, i) => {
                  const evs = (eventsByDate[cell.iso] || []).slice().sort(
                    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
                  );
                  const isToday    = cell.iso === TODAY;
                  const isSelected = detailOpen && cell.iso === selectedDate;
                  const isSun      = cell.dow === 0;
                  const isSat      = cell.dow === 6;
                  const rowIdx     = Math.floor(i / 7);

                  return (
                    <button key={i} onClick={() => { setSelectedDate(cell.iso); setDetailOpen(true); }} style={{
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
                        <span style={{
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
                        {evs.length > 3 && (
                          <span style={{
                            fontSize: 10.5, fontWeight: 700, color: 'var(--charcoal-3)',
                            fontFamily: 'var(--font-mono)',
                          }}>+{evs.length - 2}</span>
                        )}
                      </div>

                      {/* Event pills (max 3, summarize rest) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {evs.slice(0, evs.length > 3 ? 2 : 3).map(ev => {
                          const a = ACCENT[ev.accent];
                          return (
                            <div key={ev.id} style={{
                              fontSize: detailOpen ? 9.2 : 10.5,
                              lineHeight: 1.22, fontWeight: 600,
                              padding: detailOpen ? '3px 4px 3px 6px' : '3px 6px 3px 8px',
                              borderRadius: 5,
                              background: a.bg,
                              color: a.fg,
                              borderLeft: `2px solid ${a.dot}`,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              minWidth: 0,
                            }} title={ev.title}>{ev.title}</div>
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
            <div style={{
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
            <aside style={{
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
              {/* Day header card */}
              <div style={{
                background: 'var(--ink)', color: '#fff',
                borderRadius: 24, padding: '24px 24px 22px',
                position: 'relative', overflow: 'hidden',
              }}>
                <SparkleFull size={36} color="var(--sage)" style={{ position: 'absolute', top: 18, right: 22, opacity: 0.9 }} />
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10 }}>
                  {selectedDate === TODAY ? 'TODAY · 오늘' : 'SELECTED · 선택한 날짜'}
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
                  borderTop: '1px dashed rgba(255,255,255,0.18)',
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
                {dayEvents.map((ev, i) => {
                  const a = ACCENT[ev.accent];
                  return (
                    <div
                      key={ev.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleEventClick(ev)}
                      onKeyDown={(keyboardEvent) => { if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') { keyboardEvent.preventDefault(); handleEventClick(ev); } }}
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
                      }}>{ev.time}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '2px 8px', borderRadius: 999,
                            background: a.bg, color: a.fg,
                            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
                          }}>
                            <span style={{ width: 5, height: 5, borderRadius: 999, background: a.dot }} />
                            {KIND_LABEL[ev.kind]}
                          </span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-deep)', lineHeight: 1.35, marginBottom: 4 }}>
                          {ev.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--charcoal-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Icon.pin style={{ width: 12, height: 12 }} />
                          {ev.place}
                          {ev.club && <><span>·</span><span>{ev.club}</span></>}
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
      <section style={{ padding: '48px 40px 32px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', letterSpacing: '0.08em', marginBottom: 6 }}>
                UPCOMING · 다가오는 일정
              </div>
              <h2 style={{ fontSize: 28, lineHeight: 1.1 }}>
                이번 주, 놓치면 아쉬워요
              </h2>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {upcoming.map((ev) => {
              const a = ACCENT[ev.accent];
              const dleft = (() => {
                const evParts = ev.date.split('-').map(Number);
                const todayParts = TODAY.split('-').map(Number);
                const y = evParts[0] ?? 0, m = evParts[1] ?? 1, d = evParts[2] ?? 1;
                const ty = todayParts[0] ?? 0, tm = todayParts[1] ?? 1, td = todayParts[2] ?? 1;
                const diff = Math.round((new Date(y, m - 1, d).getTime() - new Date(ty, tm - 1, td).getTime()) / 86400000);
                return diff === 0 ? 'D-DAY' : `D-${diff}`;
              })();
              return (
                <article key={ev.id} style={{
                  background: 'var(--paper)', border: '1px solid var(--gray-line)',
                  borderRadius: 20, padding: '20px 22px',
                  position: 'relative', overflow: 'hidden',
                  display: 'flex', flexDirection: 'column', gap: 14,
                }}>
                  {/* Top: date block + Dday */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{
                      width: 64, height: 70, borderRadius: 14,
                      background: a.bg, color: a.fg,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', opacity: 0.7 }}>{parseInt(ev.date.split('-')[1] ?? '0', 10)}월</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
                        {parseInt(ev.date.slice(8), 10)}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.75, marginTop: 2 }}>{dayOfWeekKR(ev.date)}요일</div>
                    </div>
                    <span style={{
                      padding: '5px 10px', borderRadius: 999,
                      background: dleft === 'D-DAY' ? 'var(--ink)' : 'var(--gray-soft)',
                      color: dleft === 'D-DAY' ? '#fff' : 'var(--charcoal-2)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                    }}>{dleft}</span>
                  </div>

                  {/* Body */}
                  <div>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '2px 8px', borderRadius: 999,
                      background: a.bg, color: a.fg,
                      fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
                      marginBottom: 8,
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: 999, background: a.dot }} />
                      {KIND_LABEL[ev.kind]}
                    </div>
                    <h3 style={{ fontSize: 17, fontFamily: 'var(--font-body)', fontWeight: 700, color: 'var(--ink-deep)', lineHeight: 1.3, marginBottom: 6 }}>
                      {ev.title}
                    </h3>
                    <p style={{ fontSize: 12.5, color: 'var(--charcoal-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon.pin style={{ width: 12, height: 12 }} /> {ev.place}
                      {ev.club && <><span style={{ margin: '0 4px' }}>·</span><span>{ev.club}</span></>}
                    </p>
                  </div>

                  {/* Footer */}
                  <div style={{
                    paddingTop: 12,
                    borderTop: '1px dashed var(--gray-line)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontSize: 12, color: 'var(--charcoal-3)',
                  }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{ev.time}</span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      color: 'var(--ink)', fontWeight: 700,
                    }}>
                      자세히 <Icon.arrowRight style={{ width: 12, height: 12 }} />
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <AddEventModal
        open={addModalOpen}
        defaultDate={selectedDate || TODAY}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddEvent}
      />

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          open={eventDetailOpen}
          onClose={() => { setEventDetailOpen(false); setSelectedEvent(null); }}
          onEdit={handleEventEdit}
          onDelete={handleEventDelete}
        />
      )}

      {selectedEvent && (
        <EventEditModal
          event={selectedEvent}
          open={eventEditOpen}
          onClose={() => setEventEditOpen(false)}
          onSave={handleEventSave}
        />
      )}

      <DeleteConfirmModal
        open={eventDeleteConfirmOpen}
        onClose={() => setEventDeleteConfirmOpen(false)}
        onConfirm={handleEventDeleteConfirm}
      />

    </div>
  );
}
