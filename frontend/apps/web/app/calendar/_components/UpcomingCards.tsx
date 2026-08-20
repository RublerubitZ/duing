'use client';

import type { CalEvent } from '../_types';
import { toUpcomingView } from '../_lib/upcomingView';
import { Icon } from './CalendarIcons';

type Props = {
  events: CalEvent[];
  todayIso: string;
};

// 데스크탑 Upcoming 카드 — CalendarPage 에 있던 마크업을 그대로 옮겼다(시각적 변화 없음).
// 날짜·D-Day·기간 표기는 toUpcomingView 결과를 쓰므로 모바일 타임라인과 어긋날 수 없다.
// 모바일에서는 globals.css 가 이 그리드를 숨기고 타임라인을 대신 노출한다.
export function UpcomingCards({ events, todayIso }: Props) {
  return (
    <div className="cal-upcoming" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
      {events.map((event) => {
        const view = toUpcomingView(event, todayIso);
        return (
          <article key={event.id} style={{
            background: 'var(--paper)', border: '1px solid var(--gray-line)',
            borderRadius: 20, padding: '20px 22px',
            position: 'relative', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            {/* Top: date block + Dday */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{
                width: 64, height: 70, borderRadius: 14,
                background: view.accent.bg, color: view.accent.fg,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', opacity: 0.7 }}>{view.monthNumber}월</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
                  {view.dayNumber}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.75, marginTop: 2 }}>{view.weekdayLabel}요일</div>
              </div>
              <span style={{
                padding: '5px 10px', borderRadius: 999,
                background: view.daysLeft === 0 ? 'var(--ink)' : 'var(--gray-soft)',
                color: view.daysLeft === 0 ? '#fff' : 'var(--charcoal-2)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
              }}>{view.dday}</span>
            </div>

            {/* Body */}
            <div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 8px', borderRadius: 999,
                background: view.accent.bg, color: view.accent.fg,
                fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
                marginBottom: 8,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: view.accent.dot }} />
                {view.kindLabel}
              </div>
              <h3 style={{ fontSize: 17, fontFamily: 'var(--font-body)', fontWeight: 700, color: 'var(--ink-deep)', lineHeight: 1.3, marginBottom: 6 }}>
                {view.title}
              </h3>
              {view.periodLabel !== null && (
                <p style={{
                  fontSize: 12, color: 'var(--charcoal-3)',
                  fontFamily: 'var(--font-mono)', marginBottom: 6,
                }}>
                  {view.periodLabel}
                </p>
              )}
              {/* 장소·동아리는 구분점 여백(4px)이 시각에 남아 있어 문자열 결합(placeLabel) 대신 원래 구조를 유지한다. */}
              <p style={{ fontSize: 12.5, color: 'var(--charcoal-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon.pin style={{ width: 12, height: 12 }} /> {event.place}
                {event.club && <><span style={{ margin: '0 4px' }}>·</span><span>{event.club}</span></>}
              </p>
            </div>

            {/* Footer */}
            <div style={{
              paddingTop: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: 12, color: 'var(--charcoal-3)',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{view.timeLabel}</span>
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
  );
}
