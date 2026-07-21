import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedClub } from '@duing/types';

const pushSpy = vi.fn();
vi.mock('@/app/_lib/useGuardedRouter', () => ({
  useGuardedRouter: () => ({ push: pushSpy, replace: vi.fn() }),
}));

import { ClubSwitcher } from '@/app/manage/_components/ClubSwitcher';

const CLUBS: ManagedClub[] = [
  { clubId: 1, clubName: 'AI 동아리', logoUrl: null, myRole: 'LEADER', centralClub: true, activeRecruitmentCount: 2 },
  { clubId: 2, clubName: '컴공 동아리', logoUrl: null, myRole: 'OFFICER', centralClub: true, activeRecruitmentCount: 0 },
];

describe('ClubSwitcher', () => {
  beforeEach(() => {
    pushSpy.mockReset();
  });

  it('트리거에 현재 클럽명·역할 배지·모집 상태 칩이 표시된다', () => {
    render(<ClubSwitcher managedClubs={CLUBS} currentClubId={1} />);

    const trigger = screen.getByRole('button', { name: /동아리 전환/ });
    expect(trigger).toHaveTextContent('AI 동아리');
    expect(trigger).toHaveTextContent('회장');
    expect(trigger).toHaveTextContent('모집중');
  });

  it('모집이 없는 클럽은 모집종료 칩이 항상 표시된다', () => {
    render(<ClubSwitcher managedClubs={CLUBS} currentClubId={2} />);

    const trigger = screen.getByRole('button', { name: /동아리 전환/ });
    expect(trigger).toHaveTextContent('운영진');
    expect(trigger).toHaveTextContent('모집종료');
  });

  it('드롭다운에 내 동아리 목록이 역할·모집 상태와 함께 뜨고, 현재 클럽에 체크가 표시된다', async () => {
    const user = userEvent.setup();
    render(<ClubSwitcher managedClubs={CLUBS} currentClubId={1} />);

    await user.click(screen.getByRole('button', { name: /동아리 전환/ }));
    const menuItems = await screen.findAllByRole('menuitem');

    expect(menuItems).toHaveLength(2);
    expect(menuItems[0]).toHaveTextContent('AI 동아리');
    expect(menuItems[0]).toHaveTextContent('회장 · 모집중');
    expect(menuItems[1]).toHaveTextContent('컴공 동아리');
    expect(menuItems[1]).toHaveTextContent('운영진 · 모집종료');
    expect(within(menuItems[0]!).getByText('현재 선택됨')).toBeInTheDocument();
    expect(within(menuItems[1]!).queryByText('현재 선택됨')).not.toBeInTheDocument();
  });

  it('다른 클럽 선택 시 해당 클럽 관리로 이동하고 onNavigate 를 호출한다', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<ClubSwitcher managedClubs={CLUBS} currentClubId={1} onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: /동아리 전환/ }));
    await user.click(await screen.findByRole('menuitem', { name: /컴공 동아리/ }));

    expect(pushSpy).toHaveBeenCalledWith('/manage/clubs/2');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('현재 클럽을 다시 선택하면 라우팅 없이 onNavigate 만 호출한다', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<ClubSwitcher managedClubs={CLUBS} currentClubId={1} onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: /동아리 전환/ }));
    await user.click(await screen.findByRole('menuitem', { name: /AI 동아리/ }));

    expect(pushSpy).not.toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
