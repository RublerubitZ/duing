import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ManagedClub } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { ManageGuard } from '@/app/manage/_components/ManageGuard';

const CLUBS: ManagedClub[] = [
  {
    clubId: 1,
    clubName: 'AI 동아리',
    logoUrl: null,
    myRole: 'LEADER',
    centralClub: true,
    activeRecruitmentCount: 1,
  },
];

function renderGuard(currentClubId: number | null) {
  return render(
    <ManageGuard
      managedClubs={CLUBS}
      currentClubId={currentClubId}
      isLoading={false}
      isRetrying={false}
      onRetry={vi.fn()}
    >
      <p>운영 콘솔 본문</p>
    </ManageGuard>,
  );
}

describe('ManageGuard — clubId 권한 게이트', () => {
  it('운영 중인 동아리의 clubId 면 본문을 렌더한다', () => {
    renderGuard(1);
    expect(screen.getByText('운영 콘솔 본문')).toBeInTheDocument();
  });

  it('URL 의 clubId 만 다른 동아리로 바꾸면 본문 대신 403 안내를 보여준다', () => {
    renderGuard(25);
    expect(screen.queryByText('운영 콘솔 본문')).not.toBeInTheDocument();
    expect(screen.getByText('이 동아리의 운영 권한이 없습니다.')).toBeInTheDocument();
  });

  it('숫자가 아닌 clubId(NaN → null)도 차단한다', () => {
    renderGuard(null);
    expect(screen.queryByText('운영 콘솔 본문')).not.toBeInTheDocument();
    expect(screen.getByText('이 동아리의 운영 권한이 없습니다.')).toBeInTheDocument();
  });

  // 동작 줄(div)로 링크를 감싸도 403 은 링크 하나 그대로여야 한다.
  it('403 안내는 다시 시도 없이 내 운영 콘솔 링크만 둔다', () => {
    renderGuard(25);
    expect(screen.getByRole('link', { name: '내 운영 콘솔로 이동' })).toHaveAttribute('href', '/manage');
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
  });

  it('운영하는 동아리가 하나도 없으면 기존 안내를 유지한다', () => {
    render(
      <ManageGuard managedClubs={[]} currentClubId={1} isLoading={false} isRetrying={false} onRetry={vi.fn()}>
        <p>운영 콘솔 본문</p>
      </ManageGuard>,
    );
    expect(screen.getByText('현재 운영하는 동아리가 없습니다.')).toBeInTheDocument();
  });

  it('운영 동아리 목록 조회가 실패해도(undefined) 본문을 열어주지 않는다', () => {
    render(
      <ManageGuard managedClubs={undefined} currentClubId={1} isLoading={false} isRetrying={false} onRetry={vi.fn()}>
        <p>운영 콘솔 본문</p>
      </ManageGuard>,
    );
    expect(screen.queryByText('운영 콘솔 본문')).not.toBeInTheDocument();
  });

  // 잠긴 버튼은 클릭도 Enter 도 무시한다 — aria-disabled 의 뜻과 동작을 맞춘다.
  it('조회 실패 안내의 다시 시도는 다시 받는 중에 같은 버튼이 잠겨 클릭·Enter 로 onRetry 를 부르지 않는다', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const guardElement = (isRetrying: boolean) => (
      <ManageGuard
        managedClubs={undefined}
        currentClubId={1}
        isLoading={false}
        isRetrying={isRetrying}
        onRetry={onRetry}
      >
        <p>운영 콘솔 본문</p>
      </ManageGuard>
    );
    const { rerender } = render(guardElement(false));

    const retryButton = screen.getByRole('button', { name: '다시 시도' });
    await user.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(guardElement(true));
    expect(retryButton).toHaveAccessibleName('다시 불러오는 중');
    expect(retryButton).toHaveAttribute('aria-disabled', 'true');
    expect(retryButton).toBeEnabled();
    await user.click(retryButton);
    await user.keyboard('{Enter}');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('권한 확인 중에는 본문을 미리 렌더하지 않는다', () => {
    render(
      <ManageGuard managedClubs={undefined} currentClubId={25} isLoading isRetrying={false} onRetry={vi.fn()}>
        <p>운영 콘솔 본문</p>
      </ManageGuard>,
    );
    expect(screen.queryByText('운영 콘솔 본문')).not.toBeInTheDocument();
  });
});
