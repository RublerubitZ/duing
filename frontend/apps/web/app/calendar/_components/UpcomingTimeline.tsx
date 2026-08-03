'use client';

import type { CalEvent } from '../_types';
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
        // 도트 색은 카드와 같은 출처(뷰모델)를 쓴다 — 종류 매핑을 여기서 다시 하면 갈라진다.
        const dotColor = view.accent.dot;
        const isLast = index === events.length - 1;
        // 시각 배치를 그대로 읽으면 파편적이라 한 문장으로 합성한다. aria-label 은 내부 텍스트를
        // 대체하므로 화면에서 덜어낸 정보(종류)와 기간·장소를 모두 담는다 — 시각 사용자용 축약이
        // 스크린리더 사용자에게는 정보 소실이 되면 안 된다. 빈 조각은 걸러 쉼표가 겹치지 않게 한다.
        const rowLabel = [
          `${view.monthNumber}월 ${view.dayNumber}일 ${view.weekdayLabel}요일`,
          view.kindLabel,
          view.title,
          view.periodLabel,
          view.placeLabel,
          view.dday,
        ]
          .filter(Boolean)
          .join(', ');

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
