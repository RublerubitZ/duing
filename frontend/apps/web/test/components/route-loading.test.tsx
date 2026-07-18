import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouteLoading } from '@/app/_components/RouteLoading';

describe('RouteLoading', () => {
  it('스크린리더에 로딩 상태를 알리는 스피너 게이트를 렌더한다', () => {
    render(<RouteLoading />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveAttribute('aria-label', '페이지 불러오는 중');
  });
});
