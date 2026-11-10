import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminMobileBar } from '@/app/admin/_components/AdminMobileBar';

const mockUsePathname = vi.fn(() => '/admin');
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

beforeEach(() => mockUsePathname.mockReturnValue('/admin'));

// 상단바의 알림 종이 조회 훅을 쓴다 — 로그인 전이라 요청은 나가지 않는다.
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
function render(ui: ReactElement) {
  return rtlRender(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe('AdminMobileBar', () => {
  it.each([
    ['/admin', '대시보드'],
    ['/admin/weekly-briefing', '주간 브리핑'],
    ['/admin/clubs/3', '동아리 관리'],
    ['/admin/unknown', '관리 콘솔'],
  ])('%s 의 모바일 제목은 %s 다 — 단독 메뉴와 섹션을 같은 판정으로 읽는다', (pathname, title) => {
    mockUsePathname.mockReturnValue(pathname);
    render(<AdminMobileBar />);
    expect(screen.getByText(title)).toBeInTheDocument();
  });

  it('모바일 상단 바는 인쇄에서 숨긴다', () => {
    render(<AdminMobileBar />);
    expect(screen.getByRole('button', { name: '관리 메뉴 열기' }).parentElement).toHaveClass(
      'no-print',
    );
  });
});
