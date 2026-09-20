import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// 상단바·목록은 각자 테스트가 있다 — 여기서는 페이지 셸(공통 상단바 + 제목)만 본다.
vi.mock('@/app/_components/HomeNav', () => ({ HomeNav: () => <nav data-testid="home-nav" /> }));
vi.mock('@/app/me/_components/MyFeeList', () => ({ MyFeeList: () => <div data-testid="my-fee-list" /> }));

import MyFeesPage from '@/app/me/fees/page';

describe('MyFeesPage', () => {
  it('공통 상단바와 제목·목록을 렌더한다', () => {
    render(<MyFeesPage />);

    expect(screen.getByTestId('home-nav')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '내 회비' })).toBeInTheDocument();
    expect(screen.getByTestId('my-fee-list')).toBeInTheDocument();
  });
});
