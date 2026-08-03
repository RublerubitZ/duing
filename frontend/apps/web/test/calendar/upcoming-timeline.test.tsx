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
    // 화면에서 덜어낸 종류(모집 마감)까지 포함해 한 문장으로 읽혀야 한다 —
    // 시각 사용자용 축약이 스크린리더 사용자에게 정보 소실이 되면 안 된다.
    // ('08.31' 을 그대로 읽히면 "공팔월" 이 되므로 숫자로 되돌린다.)
    expect(
      screen.getByRole('button', {
        name: '8월 31일 월요일, 모집 마감, FLYING 모집 마감, 지원폼 · FLYING, D-28',
      }),
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

  it('다일 이벤트는 화면에 기간을 보여주되, 접근성 이름에는 장소도 함께 담는다', () => {
    const multiDay: CalEvent = { ...event, date: '2026-08-10', span: 3, title: '동아리 박람회' };
    render(<UpcomingTimeline events={[multiDay]} todayIso="2026-08-03" onSelect={() => undefined} />);

    expect(screen.getByText('8/10 ~ 8/12')).toBeInTheDocument();
    const label = screen.getByRole('button').getAttribute('aria-label') ?? '';
    expect(label).toContain('8/10 ~ 8/12');
    expect(label).toContain('지원폼 · FLYING');
  });

  it('장소가 비어 있어도 접근성 이름에 빈 조각이 끼지 않는다', () => {
    const noPlace: CalEvent = { ...event, place: '', club: null, title: '개강총회' };
    render(<UpcomingTimeline events={[noPlace]} todayIso="2026-08-03" onSelect={() => undefined} />);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      '8월 31일 월요일, 모집 마감, 개강총회, D-28',
    );
  });
});
