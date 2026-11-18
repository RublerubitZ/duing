import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
// 대시보드·머리말은 각자 테스트가 본다 — 여기서는 배치만 본다.
vi.mock('@/app/admin/_components/home/AdminHomeDashboard', () => ({
  AdminHomeDashboard: () => <div data-testid="admin-home-dashboard" />,
}));
vi.mock('@/app/admin/_components/home/AdminHomeHeadline', () => ({
  AdminHomeHeadline: () => <p data-testid="admin-home-headline" />,
}));

/* ── 대상 ───────────────────────────────────────────────────── */
import AdminIndexPage from '@/app/admin/page';

describe('관리자 콘솔 첫 화면', () => {
  it('제목·머리말 다음에 대시보드가 온다', () => {
    render(<AdminIndexPage />);

    const heading = screen.getByRole('heading', { level: 1, name: '총동연 관리자' });
    const headline = screen.getByTestId('admin-home-headline');
    const dashboard = screen.getByTestId('admin-home-dashboard');
    expect(heading.compareDocumentPosition(headline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(headline.compareDocumentPosition(dashboard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('영역 이동은 사이드바가 맡는다 — 같은 목적지를 카드로 다시 깔지 않는다', () => {
    render(<AdminIndexPage />);

    expect(screen.queryByRole('region', { name: '전체 메뉴' })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
