import { describe, expect, it } from 'vitest';
import type { CalEvent, EventKind } from '@duing/types';

import { buildUpcoming } from '@/app/calendar/_lib/upcoming';
import { toUpcomingView } from '@/app/calendar/_lib/upcomingView';

const ALL_KINDS = new Set<EventKind>(['system', 'deadline', 'event']);

function makeEvent(overrides: Partial<CalEvent> & { date: string }): CalEvent {
  return {
    id: `e-${overrides.date}-${overrides.sourceId ?? 1}`,
    kind: 'system',
    sourceType: 'global',
    sourceId: 1,
    title: '테스트 일정',
    time: '10:00',
    place: '학생회관',
    club: null,
    accent: 'warm',
    ...overrides,
  };
}

describe('buildUpcoming', () => {
  const today = '2026-08-03';

  it('오늘과 30일째는 포함하고 31일째와 어제는 제외한다', () => {
    const events = [
      makeEvent({ date: '2026-08-02', sourceId: 1 }),
      makeEvent({ date: today, sourceId: 2 }),
      makeEvent({ date: '2026-09-02', sourceId: 3 }),
      makeEvent({ date: '2026-09-03', sourceId: 4 }),
    ];
    expect(buildUpcoming(events, today, ALL_KINDS).map((event) => event.sourceId)).toEqual([2, 3]);
  });

  it('필터에서 빠진 종류는 제외한다', () => {
    const events = [
      makeEvent({ date: today, sourceId: 1, kind: 'deadline' }),
      makeEvent({ date: today, sourceId: 2, kind: 'event' }),
    ];
    const onlyDeadline = new Set<EventKind>(['deadline']);
    expect(buildUpcoming(events, today, onlyDeadline).map((event) => event.sourceId)).toEqual([1]);
  });

  it('다일 이벤트의 fan-out 은 가장 이른 날짜 하나로 합친다', () => {
    const events = [
      makeEvent({ date: '2026-08-10', sourceId: 7, id: 'g-7-d0' }),
      makeEvent({ date: '2026-08-11', sourceId: 7, id: 'g-7-d1' }),
      makeEvent({ date: '2026-08-12', sourceId: 7, id: 'g-7-d2' }),
    ];
    const result = buildUpcoming(events, today, ALL_KINDS);
    expect(result).toHaveLength(1);
    expect(result[0]?.date).toBe('2026-08-10');
  });

  it('sourceType 이 다르면 sourceId 가 같아도 별개로 센다', () => {
    const events = [
      makeEvent({ date: '2026-08-10', sourceId: 5, sourceType: 'global' }),
      makeEvent({ date: '2026-08-11', sourceId: 5, sourceType: 'recruitment' }),
    ];
    expect(buildUpcoming(events, today, ALL_KINDS)).toHaveLength(2);
  });

  it('날짜 → 시각 오름차순으로 정렬하고 6개로 자른다', () => {
    const events = Array.from({ length: 8 }, (_, index) =>
      makeEvent({ date: `2026-08-${String(20 - index).padStart(2, '0')}`, sourceId: index + 1 }),
    );
    events.push(makeEvent({ date: '2026-08-13', sourceId: 99, time: '09:00' }));
    events.push(makeEvent({ date: '2026-08-13', sourceId: 98, time: '08:00' }));

    const result = buildUpcoming(events, today, ALL_KINDS);
    expect(result).toHaveLength(6);
    expect(result[0]?.sourceId).toBe(98); // 같은 날이면 이른 시각이 먼저
    expect(result[1]?.sourceId).toBe(99);
    const dates = result.map((event) => event.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('창 밖 이벤트가 섞여 들어와도(달 전체 조회) 걸러낸다', () => {
    // 훅은 월 단위로 조회하므로 창 밖 날짜가 반드시 섞여 온다.
    const events = [
      makeEvent({ date: '2026-08-01', sourceId: 1 }),
      makeEvent({ date: '2026-09-30', sourceId: 2 }),
      makeEvent({ date: '2026-08-15', sourceId: 3 }),
    ];
    expect(buildUpcoming(events, today, ALL_KINDS).map((event) => event.sourceId)).toEqual([3]);
  });
});

describe('toUpcomingView', () => {
  const today = '2026-08-03';

  it('오늘은 D-DAY, 이후는 D-N 으로 표기한다', () => {
    expect(toUpcomingView(makeEvent({ date: today }), today).dday).toBe('D-DAY');
    expect(toUpcomingView(makeEvent({ date: '2026-08-10' }), today).dday).toBe('D-7');
    expect(toUpcomingView(makeEvent({ date: '2026-09-02' }), today).dday).toBe('D-30');
  });

  it('날짜·요일 라벨과 장소·동아리 라벨을 만든다', () => {
    const view = toUpcomingView(
      makeEvent({ date: '2026-08-31', place: '지원폼', club: 'FLYING' }),
      today,
    );
    expect(view.dateLabel).toBe('08.31');
    expect(view.weekdayLabel).toBe('월');
    expect(view.placeLabel).toBe('지원폼 · FLYING');
  });

  it('동아리가 없으면 장소만 남긴다', () => {
    const view = toUpcomingView(makeEvent({ date: '2026-08-31', place: '학생회관', club: null }), today);
    expect(view.placeLabel).toBe('학생회관');
  });

  it('다일 이벤트만 기간 라벨을 갖는다', () => {
    expect(toUpcomingView(makeEvent({ date: '2026-08-10', span: 3 }), today).periodLabel).toBe(
      '8/10 ~ 8/12',
    );
    expect(toUpcomingView(makeEvent({ date: '2026-08-10' }), today).periodLabel).toBeNull();
  });

  it('종류 라벨과 시각을 그대로 넘긴다', () => {
    const view = toUpcomingView(makeEvent({ date: '2026-08-31', kind: 'deadline', time: '23:59' }), today);
    expect(view.kindLabel).toBe('모집 마감');
    expect(view.timeLabel).toBe('23:59');
  });
});
