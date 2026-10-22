import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { FILTERS } from '@/app/me/applications/_constants/data';
import { ApplicationsPage } from '@/app/me/applications/_pages/ApplicationsPage';

// 정적 HTML 은 조회가 꺼져 있어 숫자가 전부 0 으로 실렸다 — 목록 스켈레톤과 같은 조건이면 숫자를 그리지 않는다(#1500 후속).

const mockApplicationsQuery = vi.fn();

vi.mock('next/navigation', () => ({ notFound: vi.fn() }));
vi.mock('@duing/hooks', async () => ({
  ...(await import('@duing/hooks/datetime')),
  useMyApplicationsQuery: () => mockApplicationsQuery(),
  useMyApplicationDetailQuery: () => ({ data: undefined }),
  useMyInterviewQuery: () => ({ data: undefined }),
  useWithdrawApplicationMutation: () => ({ mutate: vi.fn(), isPending: false }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);
vi.mock('@/app/_components/ExploreNav', () => ({ ExploreNav: () => null }));

const summary = {
  id: 42,
  recruitmentId: 7,
  recruitmentTitle: '봄 신입 모집',
  recruitmentStatus: 'OPEN' as const,
  clubId: 3,
  clubName: '두잉',
  category: 'HOBBY' as const,
  logoUrl: null,
  status: 'SUBMITTED' as const,
  interview: null,
  submittedAt: '2026-06-01T01:00:00Z',
};
const rows = [summary, { ...summary, id: 43, status: 'ACCEPTED' as const }];

const tree = () => (
  <ToastProvider>
    <ApplicationsPage />
  </ToastProvider>
);

const labels = FILTERS.map((filterItem) => filterItem.label);
const tabTexts = (root: HTMLElement) => [...root.querySelectorAll('section button')].map((tab) => tab.textContent);
const filterTexts = (root: HTMLElement) => [...root.querySelectorAll('aside label')].map((row) => row.textContent);
const summaryText = (root: HTMLElement) => root.querySelector('aside > div')?.textContent ?? '';

function serverContainer(): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderToString(tree());
  return container;
}

function expectCountsHidden(root: HTMLElement) {
  expect(tabTexts(root)).toEqual(labels);
  expect(filterTexts(root)).toEqual(labels);
  expect(summaryText(root)).not.toMatch(/\d/);
  expect(summaryText(root)).not.toContain('건');
  expect(summaryText(root).match(/—/g)).toHaveLength(4);
}

afterEach(() => {
  mockApplicationsQuery.mockReset();
});

describe('지원 내역 — 불러오는 동안 숫자 0 을 그리지 않는다', () => {
  it('서버 렌더(정적 HTML, 조회 꺼짐): 탭·필터 숫자 없음, 요약은 "—"', () => {
    mockApplicationsQuery.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, isError: false });

    expectCountsHidden(serverContainer());
  });

  it('처음 불러오는 중: 탭·필터 숫자 없음, 요약은 "—"', () => {
    mockApplicationsQuery.mockReturnValue({ data: undefined, isLoading: true, isFetching: true, isError: false });

    const { container } = render(tree());

    expectCountsHidden(container);
  });

  it('옛 목록을 든 채 다시 불러오는 중이면 숫자를 그대로 둔다', () => {
    mockApplicationsQuery.mockReturnValue({ data: rows, isLoading: false, isFetching: true, isError: false });

    const { container } = render(tree());

    expect(tabTexts(container)[0]).toBe('전체2');
    expect(summaryText(container)).toContain('2건');
  });

  it('조회가 끝나 0건이면 0 을 그린다', () => {
    mockApplicationsQuery.mockReturnValue({ data: [], isLoading: false, isFetching: false, isError: false });

    const { container } = render(tree());

    expect(tabTexts(container)).toEqual(labels.map((label) => `${label}0`));
    expect(summaryText(container)).toContain('0건');
  });

  it('하이드레이션 직전에 목록이 차 있어도 서버와 같이 하이드레이션하고, 그 뒤 숫자를 채운다', async () => {
    mockApplicationsQuery.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, isError: false });
    const container = serverContainer();
    document.body.appendChild(container);
    mockApplicationsQuery.mockReturnValue({ data: rows, isLoading: false, isFetching: false, isError: false });
    // 텍스트 불일치는 onRecoverableError 로, 속성 불일치는 console.error 경고로만 온다(React 19).
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recoverableErrors: unknown[] = [];

    try {
      const root = await act(async () =>
        hydrateRoot(container, tree(), { onRecoverableError: (error) => recoverableErrors.push(error) }),
      );
      const hydrationWarnings = consoleErrorSpy.mock.calls.filter((args) => /hydrat/i.test(args.map(String).join(' ')));

      expect(recoverableErrors).toEqual([]);
      expect(hydrationWarnings).toEqual([]);
      expect(tabTexts(container)[0]).toBe('전체2');
      act(() => root.unmount());
    } finally {
      consoleErrorSpy.mockRestore();
      container.remove();
    }
  });
});
