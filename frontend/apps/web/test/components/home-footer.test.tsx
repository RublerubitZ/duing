import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/duing/BrandMark', () => ({ BrandMark: () => <span>두잉</span> }));

const routerPushMock = vi.fn();
vi.mock('@/app/_lib/useGuardedRouter', () => ({
  useGuardedRouter: () => ({ push: routerPushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

import { HomeFooter } from '../../app/_components/HomeFooter';
import { ToastProvider } from '../../app/_components/toast/ToastProvider';

describe('HomeFooter — 모바일 간소 푸터', () => {
  it('모바일(md:hidden) 푸터에 서비스 소개·이용약관 링크가 노출된다', () => {
    render(<HomeFooter />);

    // 모바일 간소 푸터(md:hidden)와 데스크탑 풀 푸터(md:block)가 함께 마운트되므로,
    // md:hidden 푸터 안쪽의 링크만 골라 모바일 동선을 검증한다.
    const mobileFooter = screen
      .getAllByRole('contentinfo')
      .find((footer) => footer.classList.contains('md:hidden'));
    expect(mobileFooter).toBeDefined();
    if (!mobileFooter) return;

    const introLink = within(mobileFooter).getByRole('link', { name: '서비스 소개' });
    expect(introLink).toHaveAttribute('href', '/introduce');
    expect(
      within(mobileFooter).getByRole('link', { name: '이용약관 및 개인정보 처리방침' }),
    ).toHaveAttribute('href', '/terms');
  });
});

describe('HomeFooter — 데스크탑 풀 푸터', () => {
  function desktopFooter() {
    const footer = screen
      .getAllByRole('contentinfo')
      .find((el) => el.classList.contains('md:block'));
    expect(footer).toBeDefined();
    return footer as HTMLElement;
  }

  it('서비스 컬럼은 상단바·하단 탭과 같은 목록(탐색·시설·일정·소식)을 갖는다', () => {
    render(
      <ToastProvider>
        <HomeFooter />
      </ToastProvider>,
    );
    const footer = desktopFooter();

    expect(within(footer).getByRole('link', { name: '동아리 탐색' })).toHaveAttribute('href', '/clubs');
    expect(within(footer).getByRole('link', { name: '시설' })).toHaveAttribute('href', '/facilities');
    expect(within(footer).getByRole('link', { name: '일정' })).toHaveAttribute('href', '/calendar');
    expect(within(footer).getByRole('link', { name: '소식' })).toHaveAttribute('href', '/notices');
  });

  it('"우리 동아리도 신청하고 싶어요" 는 링크가 아닌 버튼이고, 누르면 총동연 문의 안내 토스트가 뜬다', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <HomeFooter />
      </ToastProvider>,
    );
    const footer = desktopFooter();

    const cta = within(footer).getByRole('button', { name: '우리 동아리도 신청하고 싶어요' });
    await user.click(cta);

    expect(screen.getByText('동아리 신청은 총동연(총동아리연합회)에 문의해 주세요.')).toBeInTheDocument();
    // 토스트 액션은 총동연 1:1 문의로 이어진다.
    await user.click(screen.getByRole('button', { name: '1:1 문의' }));
    expect(routerPushMock).toHaveBeenCalledWith('/me/inquiries/new');
  });
});
