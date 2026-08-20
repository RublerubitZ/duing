import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EventKind, RecruitmentSummary } from '@duing/types';

import { EventDetailModal } from '@/app/calendar/_components/EventDetailModal';
import { toCalEvent_recruitment } from '@/app/calendar/_lib/calendarMappers';
import { buildUpcoming } from '@/app/calendar/_lib/upcoming';

// 공개 캘린더는 마감된 모집도 "지난 일정"으로 계속 보여준다. 다만 지원 동선은 끊어야 한다 —
// 그대로 두면 학생이 지원을 눌렀을 때 에러 화면을 만난다.

const base: RecruitmentSummary = {
  id: 34,
  clubId: 12,
  clubName: '두잉동아리',
  title: '신입 부원 모집',
  startDate: '2026-06-01',
  endDate: '2026-06-30',
  capacity: 20,
  status: 'OPEN',
  displayStatus: 'OPEN',
  effectivelyOpen: true,
  applicationMode: 'SELF',
  externalFormUrl: null,
  useInterview: false,
  targetRole: 'MEMBER',
  closedAt: null,
};

describe('캘린더 모집 이벤트 — 마감 반영', () => {
  it('진행 중인 모집은 강조색으로 남고 지원 페이지를 가리킨다', () => {
    const event = toCalEvent_recruitment(base);

    expect(event).not.toBeNull();
    expect(event?.accent).toBe('coral');
    expect(event?.sourceClosed).toBe(false);
  });

  it('마감된 모집은 일정으로 남되 회색으로 눕는다', () => {
    const event = toCalEvent_recruitment({ ...base, status: 'CLOSED', displayStatus: 'CLOSED' });

    expect(event).not.toBeNull();
    expect(event?.date).toBe('2026-06-30');
    expect(event?.accent).toBe('muted');
    expect(event?.sourceClosed).toBe(true);
  });

  it('강제 마감돼 종료일이 아직 미래인 모집도 마감으로 다룬다', () => {
    // 표기 축(displayStatus)으로 판정하므로 endDate 가 남아 있어도 지원 동선에서 빠진다.
    const event = toCalEvent_recruitment({
      ...base,
      status: 'CLOSED',
      displayStatus: 'CLOSED',
      endDate: '2099-12-31',
    });

    expect(event?.sourceClosed).toBe(true);
    expect(event?.accent).toBe('muted');
  });

  it('마감 표시가 색뿐 아니라 제목에도 남는다', () => {
    // 회색만으로는 색약·흑백·스크린리더 환경에서 신호가 0이다 — 제목은 그리드·목록·모달·aria-label
    // 이 모두 공유하므로 여기 한 곳이 전 표면을 덮는다.
    const closed = toCalEvent_recruitment({ ...base, status: 'CLOSED', displayStatus: 'CLOSED' });
    const open = toCalEvent_recruitment(base);

    expect(closed?.title).toContain('종료');
    expect(open?.title).not.toContain('종료');
  });

  it('끝난 모집은 "다가오는 일정" 목록에서 빠진다', () => {
    // 그리드에는 남기지만 이 목록은 행동을 권하는 자리다 — 종료된 모집에 D-day 를 붙이면 안 된다.
    // 두 이벤트의 id 를 갈라 둔다 — 같은 id 면 dedup 키가 겹쳐 필터가 없어도 결과가 같아진다.
    const closed = toCalEvent_recruitment({
      ...base,
      id: 99,
      status: 'CLOSED',
      displayStatus: 'CLOSED',
      endDate: '2026-06-10',
    })!;
    const open = toCalEvent_recruitment({ ...base, endDate: '2026-06-12' })!;

    const upcoming = buildUpcoming([closed, open], '2026-06-01', new Set<EventKind>(['deadline']));

    expect(upcoming.map((event) => event.sourceId)).toEqual([open.sourceId]);
  });

  it('상시모집은 마감일이 없어 캘린더에 올리지 않는다', () => {
    expect(toCalEvent_recruitment({ ...base, endDate: null })).toBeNull();
  });

  it('상세 모달은 진행 중인 모집을 지원 페이지로 보낸다', () => {
    const event = toCalEvent_recruitment(base);

    render(<EventDetailModal event={event!} open onClose={vi.fn()} isAdmin={false} />);

    expect(screen.getByRole('link', { name: '원본 보기' })).toHaveAttribute(
      'href',
      expect.stringContaining('/apply/34'),
    );
  });

  it('상세 모달은 마감된 모집을 지원 페이지 대신 동아리 소개로 보낸다', () => {
    const event = toCalEvent_recruitment({ ...base, status: 'CLOSED', displayStatus: 'CLOSED' });

    render(<EventDetailModal event={event!} open onClose={vi.fn()} isAdmin={false} />);

    const link = screen.getByRole('link', { name: '원본 보기' });
    expect(link).toHaveAttribute('href', expect.stringContaining('/clubs/12'));
    expect(link.getAttribute('href')).not.toContain('/apply/');
  });

  // 수제 오버레이였던 상세 모달을 Radix Dialog 재사용으로 교체한 변경을 고정한다.
  // 교체로 ESC·포커스 트랩·스크롤 잠금·aria-labelledby 가 함께 들어왔다.
  it('ESC 로 상세 모달을 닫을 수 있다', async () => {
    const event = toCalEvent_recruitment(base);
    const onClose = vi.fn();

    render(<EventDetailModal event={event!} open onClose={onClose} isAdmin={false} />);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
