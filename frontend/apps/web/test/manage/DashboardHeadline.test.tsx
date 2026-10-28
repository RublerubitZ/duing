import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockQueue = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@duing/hooks')>();
  return {
    kstDateTimeFormatter: actual.kstDateTimeFormatter,
    useDashboardTaskQueue: (clubId: number) => mockQueue(clubId),
  } satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>;
});

import { DashboardHeadline } from '@/app/manage/_components/dashboard/DashboardHeadline';

// RTL 을 거치지 않고 hydrateRoot 를 직접 쓰므로 act 환경 플래그를 직접 켠다(as 단언 대신 Reflect).
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

describe('DashboardHeadline', () => {
  it('서버 HTML 에는 날짜·건수가 없고, 하이드레이션 뒤에 나타나며 불일치가 없다', async () => {
    mockQueue.mockReturnValue({ groups: [], totalCount: 3, isLoading: false, isError: false });
    const element = <DashboardHeadline clubId={1} />;
    const container = document.createElement('div');
    container.innerHTML = renderToString(element);
    expect(container.textContent).toBe('');

    const recoverableErrors: unknown[] = [];
    await act(async () => {
      hydrateRoot(container, element, { onRecoverableError: (error) => recoverableErrors.push(error) });
    });
    expect(recoverableErrors).toEqual([]);
    expect(container.textContent).toMatch(/^\d{1,2}월 \d{1,2}일 [월화수목금토일]요일 · 처리할 업무 3건$/);
  });

  it('좁은 폭에서도 날짜와 건수가 각각 한 덩어리로 줄바꿈된다(낱말 중간에서 끊기지 않음)', () => {
    mockQueue.mockReturnValue({ groups: [], totalCount: 3, isLoading: false, isError: false });
    render(<DashboardHeadline clubId={1} />);
    expect(screen.getByText(/요일$/)).toHaveClass('whitespace-nowrap');
    expect(screen.getByText('처리할 업무 3건')).toHaveClass('whitespace-nowrap');
  });

  it('0건이면 "처리할 업무 없음"', () => {
    mockQueue.mockReturnValue({ groups: [], totalCount: 0, isLoading: false, isError: false });
    const { container } = render(<DashboardHeadline clubId={1} />);
    expect(container.textContent).toMatch(/· 처리할 업무 없음$/);
  });

  it.each([
    ['로딩', { isLoading: true, isError: false }],
    ['일부 실패', { isLoading: false, isError: true }],
  ])('%s 중에는 건수와 구분자를 숨긴다', (_label, state) => {
    mockQueue.mockReturnValue({ groups: [], totalCount: 3, ...state });
    const { container } = render(<DashboardHeadline clubId={1} />);
    expect(container.textContent).toMatch(/요일$/);
    expect(container.textContent).not.toContain('·');
  });
});
