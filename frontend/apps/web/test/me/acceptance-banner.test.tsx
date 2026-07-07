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
  status: 'ACTIVE',
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

  it('비 ACTIVE(INACTIVE) 동아리는 배너 후보에서 제외되고 다른 ACTIVE 동아리가 노출된다', () => {
    const older = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const newer = new Date().toISOString();
    render(
      <AcceptanceBanner
        myClubs={[
          make({ clubId: 1, clubName: '활동동', status: 'ACTIVE', joinedAt: older }),
          make({ clubId: 2, clubName: '중단동', status: 'INACTIVE', joinedAt: newer }),
        ]}
      />,
    );
    expect(screen.queryByText(/중단동/)).not.toBeInTheDocument();
    expect(screen.getByText(/활동동/)).toBeInTheDocument();
  });

  it('비 ACTIVE 동아리만 있으면 배너를 노출하지 않는다', () => {
    render(
      <AcceptanceBanner myClubs={[make({ clubName: '대기동', status: 'PENDING_APPROVAL' })]} />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('status 필드가 없는 구 백엔드 응답에서는 기존처럼 배너를 노출한다 (배포 전환기 fail-open)', () => {
    // BE #591 배포 전 전환기 페이로드 재현 — status 부재를 타입 체계 밖에서 주입해야 하므로 예외적으로 이중 단언 사용
    const legacyClub = { ...make({ clubName: '레거시동' }), status: undefined } as unknown as MyClubSummary;
    render(<AcceptanceBanner myClubs={[legacyClub]} />);
    expect(screen.getByText(/레거시동/)).toBeInTheDocument();
  });
});
