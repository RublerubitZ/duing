import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyClubSummary } from '@duing/types';

import { AcceptanceBanner } from '../../app/me/_components/AcceptanceBanner';

vi.mock('next/link', () => ({
  default: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>{children}</a>
  ),
}));

const make = (overrides: Partial<MyClubSummary> = {}): MyClubSummary => ({
  clubId: 1,
  clubName: '두잉',
  logoUrl: null,
  myRole: 'MEMBER',
  activeRecruitmentCount: 0,
  joinedAt: new Date().toISOString(),
  ...overrides,
});

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe('AcceptanceBanner', () => {
  it('30일 이내 가입 + ack 없음 → 배너 표시', () => {
    render(<AcceptanceBanner myClubs={[make({ clubName: '환영동' })]} />);
    expect(screen.getByText(/환영동/)).toBeInTheDocument();
  });

  it('30일을 초과한 가입이면 표시되지 않는다', () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    render(<AcceptanceBanner myClubs={[make({ joinedAt: old })]} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('이미 ack 한 clubId 는 표시되지 않는다', () => {
    window.localStorage.setItem('duing.acceptedAck.1', '12345');
    render(<AcceptanceBanner myClubs={[make({ clubId: 1 })]} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('닫기 누르면 사라지고 localStorage 에 ack 저장된다', () => {
    render(<AcceptanceBanner myClubs={[make({ clubId: 7 })]} />);
    fireEvent.click(screen.getByRole('button', { name: /합격 배너 닫기/ }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('duing.acceptedAck.7')).not.toBeNull();
  });

  it('여러 합격이 있으면 가장 최근 1개만 노출한다', () => {
    const older = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const newer = new Date().toISOString();
    render(
      <AcceptanceBanner
        myClubs={[
          make({ clubId: 1, clubName: '오래된합격', joinedAt: older }),
          make({ clubId: 2, clubName: '최근합격', joinedAt: newer }),
        ]}
      />,
    );
    expect(screen.getByText(/최근합격/)).toBeInTheDocument();
    expect(screen.queryByText(/오래된합격/)).not.toBeInTheDocument();
  });
});
