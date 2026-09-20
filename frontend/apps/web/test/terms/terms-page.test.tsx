import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../app/_components/InfoTabs', () => ({
  InfoTabs: () => <nav data-testid="info-tabs" />,
}));
vi.mock('../../app/_components/HomeFooter', () => ({
  HomeFooter: () => <footer data-testid="home-footer" />,
}));

import TermsPage from '../../app/terms/page';

// 개정일은 상수 하나로 두고 시행일은 개정일 + 7일(개정 고지 유예)로 산출한다 — 헤더·약관 부칙·처리방침 13조가
// 같은 값을 쓰므로, 상수를 바꾸면 세 곳이 함께 움직여야 한다.
describe('TermsPage 개정일·시행일', () => {
  it('최종 개정일 2026-09-08 과 시행일 2026-09-15(개정일 + 7일)를 헤더에 나란히 보여준다', () => {
    render(<TermsPage />);

    expect(screen.getByText(/최종 개정일: 2026-09-08/)).toBeInTheDocument();
    expect(screen.getByText(/시행일: 2026-09-15/)).toBeInTheDocument();
  });

  it('약관 부칙과 처리방침 13조가 같은 시행일로 "부터 시행합니다" 를 말한다', () => {
    render(<TermsPage />);

    expect(screen.getAllByText(/2026-09-15부터 시행합니다/)).toHaveLength(2);
    expect(screen.queryByText(/2026-09-21/)).not.toBeInTheDocument();
  });
});
