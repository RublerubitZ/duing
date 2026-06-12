import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ManagedClub } from '@duing/types';

const pushSpy = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

type MockQueryResult = {
  data: ManagedClub[] | undefined;
  isLoading: boolean;
};

let mockQueryResult: MockQueryResult = { data: undefined, isLoading: true };

vi.mock('@duing/hooks', () => ({
  useManagedClubsQuery: () => mockQueryResult,
}));

import ManagePage from '@/app/manage/page';

describe('ManagePage', () => {
  beforeEach(() => {
    pushSpy.mockReset();
    mockQueryResult = { data: undefined, isLoading: true };
  });

  it('로딩 중이면 "불러오는 중…" 을 렌더하고 push 를 호출하지 않는다', () => {
    mockQueryResult = { data: undefined, isLoading: true };
    render(<ManagePage />);
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('동아리가 없으면 "관리하는 동아리가 없습니다." 를 렌더하고 push 를 호출하지 않는다', () => {
    mockQueryResult = { data: [], isLoading: false };
    render(<ManagePage />);
    expect(screen.getByText('관리하는 동아리가 없습니다.')).toBeInTheDocument();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('동아리가 있으면 첫 번째 동아리 경로로 push 한다', async () => {
    mockQueryResult = {
      data: [
        {
          clubId: 10,
          clubName: '두잉',
          logoUrl: null,
          myRole: 'LEADER',
          activeRecruitmentCount: 1,
        },
      ],
      isLoading: false,
    };
    render(<ManagePage />);
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/manage/clubs/10'));
  });
});
