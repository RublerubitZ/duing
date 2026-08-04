import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAuthStore } from '@duing/stores';

import { MeAuthGuard } from '@/app/me/_components/MeAuthGuard';

vi.mock('next/navigation', () => ({
  usePathname: () => '/me/settings',
}));

beforeEach(() => useAuthStore.setState(useAuthStore.getInitialState(), true));

describe('MeAuthGuard', () => {
  // 시드 모델에는 "확인 중" 이 없다 — 로컬 이력으로 authenticated 로 시드되면 서버 확인을
  // 기다리지 않고 보호 화면을 연다(하드 로드마다 로그인 화면이 플래시되던 회귀 차단).
  it('시드된 인증 상태면 서버 확인 전에도 콘텐츠를 그대로 렌더한다', () => {
    useAuthStore.getState().seedSession('authenticated');

    render(
      <MeAuthGuard>
        <div>마이페이지 콘텐츠</div>
      </MeAuthGuard>,
    );

    expect(screen.getByText('마이페이지 콘텐츠')).toBeInTheDocument();
    expect(screen.queryByText(/다시 로그인해 주세요/)).not.toBeInTheDocument();
    expect(useAuthStore.getState().isVerified).toBe(false);
  });

  it('미인증이면 빈 사용자 화면 대신 로그인 유도를 렌더한다', () => {
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

  // 시드된 미인증(검증 전)도 현재 최선의 판단이므로 같은 화면이다 — 시드가 틀렸다면
  // 만료 핸들러·부팅 확인이 status 를 올려 이 가드가 곧바로 children 으로 돌아온다.
  it('서버 확정 미인증도 시드 미인증과 같은 로그인 유도를 렌더한다', () => {
    useAuthStore.setState({ status: 'unauthenticated', isVerified: true });

    render(
      <MeAuthGuard>
        <div>마이페이지 콘텐츠</div>
      </MeAuthGuard>,
    );

    expect(screen.queryByText('마이페이지 콘텐츠')).not.toBeInTheDocument();
    expect(screen.getByText(/다시 로그인해 주세요/)).toBeInTheDocument();
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
});
