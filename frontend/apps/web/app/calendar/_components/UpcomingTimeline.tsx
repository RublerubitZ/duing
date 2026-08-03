'use client';

import type { CalEvent } from '../_types';
import { ACCENT, KIND_ACCENT } from '../_lib/calendarDisplay';
import { toUpcomingView } from '../_lib/upcomingView';

type Props = {
  events: CalEvent[];
  todayIso: string;
  onSelect: (event: CalEvent) => void;
};

// 모바일 전용 Upcoming — 카드(250px)를 행(68px)으로 접어 한 화면에서 6건을 훑게 한다.
// 데스크탑에서 노출하는 카테고리 칩·시각·"자세히"는 덜어낸다(칩은 레일 도트 색이 대신하고,
// 시각은 상세 모달에서 확인한다 — 마감은 대부분 23:59 라 목록에서의 정보량이 낮다).
// 뷰포트 분기는 globals.css 가 한다(JS 분기는 SSR 첫 프레임 깜빡임을 만든다).
export function UpcomingTimeline({ events, todayIso, onSelect }: Props) {
  return (
    <ul className="cal-upcoming-timeline">
      {events.map((event, index) => {
        const view = toUpcomingView(event, todayIso);
        const dotColor = ACCENT[KIND_ACCENT[event.kind]].dot;
        const isLast = index === events.length - 1;
        // 시각 배치를 그대로 읽으면 파편적이라 한 문장으로 합성한다. aria-label 은 내부 텍스트를
        // 대체하므로 장소·기간까지 담는다. '08.31' 을 그대로 읽히면 "공팔월" 이 되어 숫자로 되돌린다.
        const [monthPart = '', dayPart = ''] = view.dateLabel.split('.');
        const rowLabel = [
          `${Number(monthPart)}월 ${Number(dayPart)}일 ${view.weekdayLabel}요일`,
          view.title,
          view.periodLabel ?? view.placeLabel,
          view.dday,
        ].join(', ');

        return (
          <li key={event.id}>
            <button
              type="button"
              onClick={() => onSelect(event)}
              aria-label={rowLabel}
              className="cal-upcoming-row"
            >
              <span className="cal-upcoming-rail">
                <span className="cal-upcoming-date">{view.dateLabel}</span>
                <span className="cal-upcoming-weekday">{view.weekdayLabel}</span>
              </span>
              <span className="cal-upcoming-marker" aria-hidden>
                <span className="cal-upcoming-dot" style={{ background: dotColor }} />
                {!isLast && <span className="cal-upcoming-line" />}
              </span>
              <span className="cal-upcoming-body">
                <span className="cal-upcoming-title">{view.title}</span>
                <span className="cal-upcoming-place">{view.periodLabel ?? view.placeLabel}</span>
              </span>
              <span className="cal-upcoming-dday">{view.dday}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
