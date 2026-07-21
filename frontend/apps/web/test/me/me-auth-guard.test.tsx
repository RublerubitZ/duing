import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAuthStore } from '@duing/stores';

import { MeAuthGuard } from '@/app/me/_components/MeAuthGuard';

vi.mock('next/navigation', () => ({
  usePathname: () => '/me/settings',
}));

afterEach(() => {
  useAuthStore.setState({ status: 'idle', user: null });
});

describe('MeAuthGuard', () => {
  it('미인증 확정 상태면 빈 사용자 화면 대신 로그인 유도를 렌더한다', () => {
    useAuthStore.setState({ status: 'unauthenticated' });

    render(
      <MeAuthGuard>
        <div>마이페이지 콘텐츠</div>
      </MeAuthGuard>,
    );

    expect(screen.queryByText('마이페이지 콘텐츠')).not.toBeInTheDocument();
    expect(screen.getByText(/다시 로그인해 주세요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '로그인하기' })).toHaveAttribute(
      'href',
      '/login?next=%2Fme%2Fsettings',
    );
  });

  // 의도적 로그아웃·탈퇴도 이동 커밋 전까지 unauthenticated 를 스치므로, 세션 만료로
  // 단정하는 문구를 쓰면 "탈퇴 완료" 토스트와 "세션 만료" 화면이 동시에 보이게 된다.
  it('로그인 유도 문구는 세션 만료를 단정하지 않고, 빠른 이동에서 숨겨지도록 지연 표시된다', () => {
    useAuthStore.setState({ status: 'unauthenticated' });

    const { container } = render(
      <MeAuthGuard>
        <div>마이페이지 콘텐츠</div>
      </MeAuthGuard>,
    );

    expect(screen.queryByText(/세션이 만료/)).not.toBeInTheDocument();
    expect(container.querySelector('.delayed-show')).not.toBeNull();
  });

  // idle 까지 가리면 세션 부트스트랩이 끝나기 전 매 하드 로드마다 로그인 화면이 플래시된다.
  it('부트스트랩 진행 중(idle)에는 로그인 유도 없이 콘텐츠를 그대로 렌더한다', () => {
    useAuthStore.setState({ status: 'idle' });

    render(
      <MeAuthGuard>
        <div>마이페이지 콘텐츠</div>
      </MeAuthGuard>,
    );

    expect(screen.getByText('마이페이지 콘텐츠')).toBeInTheDocument();
    expect(screen.queryByText(/다시 로그인해 주세요/)).not.toBeInTheDocument();
  });

  it('인증 상태면 콘텐츠를 그대로 렌더한다', () => {
    useAuthStore.setState({ status: 'authenticated' });

    render(
      <MeAuthGuard>
        <div>마이페이지 콘텐츠</div>
      </MeAuthGuard>,
    );

    expect(screen.getByText('마이페이지 콘텐츠')).toBeInTheDocument();
    expect(screen.queryByText(/다시 로그인해 주세요/)).not.toBeInTheDocument();
  });
});
