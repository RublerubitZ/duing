import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockUseAuthStore = vi.fn();
const mockLogout = vi.fn().mockResolvedValue(undefined);
const mockRefresh = vi.fn();

vi.mock('@duing/stores', () => ({
  useAuthStore: (selector: (state: { status: string }) => unknown) => mockUseAuthStore(selector),
}));
vi.mock('@duing/hooks', () => ({
  useMeQuery: () => ({ data: { name: '홍길동' } }),
  useLogout: () => mockLogout,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { UserMenu } from '../../components/UserMenu';

function setStatus(status: string) {
  mockUseAuthStore.mockImplementation((selector: (state: { status: string }) => unknown) =>
    selector({ status }),
  );
}

describe('UserMenu', () => {
  beforeEach(() => {
    mockLogout.mockClear();
    mockRefresh.mockClear();
  });

  it('미인증 상태면 아무것도 렌더링하지 않는다', () => {
    setStatus('unauthenticated');
    const { container } = render(<UserMenu />);
    expect(container.firstChild).toBeNull();
  });

  it('인증 상태면 트리거에 사용자 이름이 표시된다', () => {
    setStatus('authenticated');
    render(<UserMenu />);
    expect(screen.getByRole('button', { name: /홍길동님/ })).toBeInTheDocument();
  });

  it('메뉴를 열면 항목이 menuitem 으로 노출되고 로그아웃 시 logout + router.refresh 가 호출된다', async () => {
    setStatus('authenticated');
    const user = userEvent.setup();
    render(<UserMenu />);

    await user.click(screen.getByRole('button', { name: /홍길동님/ }));

    expect(screen.getByRole('menuitem', { name: '마이페이지' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '설정' })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: '로그아웃' }));

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it('Esc 키로 열린 메뉴가 닫힌다', async () => {
    setStatus('authenticated');
    const user = userEvent.setup();
    render(<UserMenu />);

    await user.click(screen.getByRole('button', { name: /홍길동님/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });
});
