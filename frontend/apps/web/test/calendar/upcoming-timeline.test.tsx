import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CalEvent } from '@duing/types';

import { UpcomingTimeline } from '@/app/calendar/_components/UpcomingTimeline';

const event: CalEvent = {
  id: 'g-1-d0',
  date: '2026-08-31',
  kind: 'deadline',
  sourceType: 'recruitment',
  sourceId: 1,
  title: 'FLYING 모집 마감',
  time: '23:59',
  place: '지원폼',
  club: 'FLYING',
  accent: 'coral',
};

describe('UpcomingTimeline', () => {
  it('행 전체가 버튼이고 탭하면 해당 일정을 넘겨준다', () => {
    const onSelect = vi.fn();
    render(<UpcomingTimeline events={[event]} todayIso="2026-08-03" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: /FLYING 모집 마감/ }));

    expect(onSelect).toHaveBeenCalledWith(event);
  });

  it('날짜·요일·D-Day·장소를 보여준다', () => {
    render(<UpcomingTimeline events={[event]} todayIso="2026-08-03" onSelect={() => undefined} />);
    expect(screen.getByText('08.31')).toBeInTheDocument();
    expect(screen.getByText('월')).toBeInTheDocument();
    expect(screen.getByText('D-28')).toBeInTheDocument();
    expect(screen.getByText('지원폼 · FLYING')).toBeInTheDocument();
  });

  it('행에 합성된 접근성 이름이 붙는다', () => {
    render(<UpcomingTimeline events={[event]} todayIso="2026-08-03" onSelect={() => undefined} />);
    // 날짜·요일·제목·장소·D-Day 가 한 문장으로 읽혀야 한다('08.31' 을 그대로 읽히면 "공팔월" 이 된다).
    expect(
      screen.getByRole('button', { name: '8월 31일 월요일, FLYING 모집 마감, 지원폼 · FLYING, D-28' }),
    ).toBeInTheDocument();
  });

  it('목록 시맨틱을 유지한다', () => {
    render(<UpcomingTimeline events={[event]} todayIso="2026-08-03" onSelect={() => undefined} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('데스크탑 전용 요소(자세히·시각·카테고리 칩)는 렌더하지 않는다', () => {
    render(<UpcomingTimeline events={[event]} todayIso="2026-08-03" onSelect={() => undefined} />);
    expect(screen.queryByText(/자세히/)).toBeNull();
    expect(screen.queryByText('23:59')).toBeNull();
    expect(screen.queryByText('모집 마감')).toBeNull();
  });

  it('다일 이벤트는 장소 대신 기간을 보여준다', () => {
    const multiDay: CalEvent = { ...event, date: '2026-08-10', span: 3, title: '동아리 박람회' };
    render(<UpcomingTimeline events={[multiDay]} todayIso="2026-08-03" onSelect={() => undefined} />);
    expect(screen.getByText('8/10 ~ 8/12')).toBeInTheDocument();
  });
});
