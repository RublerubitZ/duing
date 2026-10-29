import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PENDING_COUNTS } from './adminHome.data';

const mockCounts = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@duing/hooks')>();
  return {
    kstDateTimeFormatter: actual.kstDateTimeFormatter,
    useAdminPendingCountsQuery: () => mockCounts(),
  } satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>;
});

import { AdminHomeHeadline } from '@/app/admin/_components/home/AdminHomeHeadline';

// RTL 을 거치지 않고 hydrateRoot 를 직접 쓰므로 act 환경 플래그를 직접 켠다(as 단언 대신 Reflect).
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

describe('AdminHomeHeadline', () => {
  it('서버 HTML 에는 날짜·건수가 없고, 하이드레이션 뒤에 나타나며 불일치가 없다', async () => {
    mockCounts.mockReturnValue({ data: PENDING_COUNTS, isError: false });
    const container = document.createElement('div');
    container.innerHTML = renderToString(<AdminHomeHeadline />);
    expect(container.textContent).toBe('');

    const recoverableErrors: unknown[] = [];
    await act(async () => {
      hydrateRoot(container, <AdminHomeHeadline />, { onRecoverableError: (error) => recoverableErrors.push(error) });
    });
    expect(recoverableErrors).toEqual([]);
    expect(container.textContent).toMatch(/^\d{1,2}월 \d{1,2}일 [월화수목금토일]요일 · 처리 대기 28건$/);
  });

  it('날짜와 건수가 각각 한 덩어리로 줄바꿈된다', () => {
    mockCounts.mockReturnValue({ data: PENDING_COUNTS, isError: false });
    render(<AdminHomeHeadline />);
    expect(screen.getByText(/요일$/)).toHaveClass('whitespace-nowrap');
    expect(screen.getByText('처리 대기 28건')).toHaveClass('whitespace-nowrap');
  });

  it('0건이면 "처리 대기 없음"', () => {
    mockCounts.mockReturnValue({ data: { ...PENDING_COUNTS, totalPendingCount: 0 }, isError: false });
    const { container } = render(<AdminHomeHeadline />);
    expect(container.textContent).toMatch(/· 처리 대기 없음$/);
  });

  it.each([
    ['로딩', { data: undefined, isError: false }],
    ['실패', { data: undefined, isError: true }],
  ])('%s 중에는 날짜만 보인다', (_label, state) => {
    mockCounts.mockReturnValue(state);
    const { container } = render(<AdminHomeHeadline />);
    expect(container.textContent).toMatch(/요일$/);
    expect(container.textContent).not.toContain('·');
  });
});
