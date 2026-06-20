import { render, screen, within } from '@testing-library/react';
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

import { HomeFooter } from '../../app/_components/HomeFooter';

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
