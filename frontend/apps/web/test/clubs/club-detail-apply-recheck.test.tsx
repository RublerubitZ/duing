import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@duing/api';
import { ApiClientProvider, clubQueryKeys } from '@duing/hooks';
import type { ClubDetail, StudentRecruitmentProjection } from '@duing/types';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { ClubDetailPage } from '@/app/clubs/[clubId]/_pages/ClubDetailPage';

import { clubDetail } from './club-detail-tree-fixture';

// vi.mock 호이스팅 때문에 mock 접두사여야 한다 — 일반 폼 로그인 이동을 단언한다.
const mockRouterPush = vi.fn();
afterEach(() => mockRouterPush.mockReset());

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/clubs/1',
  useParams: () => ({ clubId: '1' }),
  useSelectedLayoutSegment: () => null,
}));

function envelope(data: unknown) {
  return HttpResponse.json({ ok: true, message: null, data });
}

const server = setupServer(
  http.get('*/clubs/1/photos', () => envelope([])),
  http.get('*/clubs/1/hero-activities', () => envelope([])),
  http.post('*/clubs/1/views', () => new HttpResponse(null, { status: 204 })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function withRecruitment(changes: Partial<StudentRecruitmentProjection>): ClubDetail {
  if (!clubDetail.activeRecruitment) throw new Error('픽스처에 활성 모집이 없다');
  return { ...clubDetail, activeRecruitment: { ...clubDetail.activeRecruitment, ...changes } };
}

const EXTERNAL_FORM_URL = 'https://forms.example.com/apply';
const externalAlwaysOpen = withRecruitment({
  displayStatus: 'ALWAYS_OPEN',
  endDate: null,
  applicationMode: 'EXTERNAL',
  externalFormUrl: EXTERNAL_FORM_URL,
});
const externalClosed = withRecruitment({
  displayStatus: 'CLOSED',
  endDate: null,
  applicationMode: 'EXTERNAL',
  externalFormUrl: EXTERNAL_FORM_URL,
});

const THREE_MINUTES_MS = 3 * 60_000;
const SIX_MINUTES_MS = 6 * 60_000;

let detailRequestCount = 0;
afterEach(() => {
  detailRequestCount = 0;
});

// 재요청 응답을 붙잡아 두는 핸들러 — 재확인 중 상태를 본다. 붙잡지 않을 땐 바로 응답한다.
let releaseDetail: () => void = () => {};
afterEach(() => releaseDetail());

function respondDetail(latestDetail: ClubDetail, options: { hold?: boolean } = {}) {
  const released = options.hold
    ? new Promise<void>((resolve) => {
        releaseDetail = resolve;
      })
    : Promise.resolve();
  return http.get('*/clubs/1', async () => {
    detailRequestCount += 1;
    await released;
    return envelope(latestDetail);
  });
}

/** 이 브라우저가 이미 받은 상세(스냅샷 아님)를 updatedAt 시각으로 심어 그린다. */
function renderCheckedDetail(checkedDetail: ClubDetail, updatedAt: number) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(clubQueryKeys.detail(1), checkedDetail, { updatedAt });
  render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={createApiClient({ baseUrl: 'http://localhost:8080/api/v1' })}>
        <ToastProvider>
          <ClubDetailPage clubId={1} />
        </ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

// jsdom 은 반응형 숨김을 적용하지 않아 데스크탑 카드와 모바일 하단 바 버튼이 함께 잡힌다.
// noUncheckedIndexedAccess 라 두 버튼을 튜플로 돌려준다 — 호출부가 [0] 을 바로 누를 수 있다.
function applyButtons(name: string): [HTMLElement, HTMLElement] {
  const buttons = screen.getAllByRole('button', { name });
  expect(buttons).toHaveLength(2);
  const [firstButton, secondButton] = buttons;
  if (!firstButton || !secondButton) throw new Error(`"${name}" 버튼이 두 개가 아니다`);
  return [firstButton, secondButton];
}

describe('동아리 상세 — 확인한 지 오래된 상세로는 외부 폼을 열지 않는다', () => {
  it('3분 지난 상세면 누를 때 먼저 다시 받고, 마감으로 바뀌면 열지 않고 잠근다', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      // 마운트 재요청이 나가지 않게 staleTime(5분) 안쪽 시각으로 심는다 — 재확인 임계값(2분)만 넘긴다.
      server.use(respondDetail(externalClosed));
      renderCheckedDetail(externalAlwaysOpen, Date.now() - THREE_MINUTES_MS);

      const [cardButton] = applyButtons('외부 폼으로 이동');
      expect(cardButton).toBeEnabled();
      fireEvent.click(cardButton);

      expect(
        await screen.findByText('모집 정보를 새로 불러왔어요. 확인 후 다시 눌러 주세요.'),
      ).toBeInTheDocument();
      expect(openSpy).not.toHaveBeenCalled();
      expect(detailRequestCount).toBe(1);
      await waitFor(() => {
        for (const button of applyButtons('외부 폼으로 이동')) expect(button).toBeDisabled();
      });
      expect(screen.getAllByText('이번 모집은 종료됐어요').length).toBeGreaterThan(0);
    } finally {
      openSpy.mockRestore();
    }
  });

  it('3분 지난 상세가 다시 받아도 상시모집이면, 한 번 더 누를 때 외부 폼이 열린다', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      server.use(respondDetail(externalAlwaysOpen));
      renderCheckedDetail(externalAlwaysOpen, Date.now() - THREE_MINUTES_MS);

      fireEvent.click(applyButtons('외부 폼으로 이동')[0]);
      expect(
        await screen.findByText('모집 정보를 새로 불러왔어요. 확인 후 다시 눌러 주세요.'),
      ).toBeInTheDocument();
      expect(openSpy).not.toHaveBeenCalled();

      await waitFor(() => expect(applyButtons('외부 폼으로 이동')[0]).toBeEnabled());
      fireEvent.click(applyButtons('외부 폼으로 이동')[0]);
      expect(openSpy).toHaveBeenCalledWith(EXTERNAL_FORM_URL, '_blank', 'noopener,noreferrer');
      expect(detailRequestCount).toBe(1);
    } finally {
      openSpy.mockRestore();
    }
  });

  it('방금 받은 상세면 다시 받지 않고 바로 외부 폼을 연다', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      server.use(respondDetail(externalAlwaysOpen));
      renderCheckedDetail(externalAlwaysOpen, Date.now() - 1_000);

      fireEvent.click(applyButtons('외부 폼으로 이동')[0]);
      expect(openSpy).toHaveBeenCalledWith(EXTERNAL_FORM_URL, '_blank', 'noopener,noreferrer');
      expect(detailRequestCount).toBe(0);
    } finally {
      openSpy.mockRestore();
    }
  });

  it('다시 받기가 실패하면 열지 않고 오류를 알리며, 버튼은 다시 누를 수 있다', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      server.use(
        http.get('*/clubs/1', () => {
          detailRequestCount += 1;
          return HttpResponse.json({ ok: false, data: null, message: '서버 오류' }, { status: 500 });
        }),
      );
      renderCheckedDetail(externalAlwaysOpen, Date.now() - THREE_MINUTES_MS);

      fireEvent.click(applyButtons('외부 폼으로 이동')[0]);
      expect(
        await screen.findByText('모집 정보를 확인하지 못했어요. 잠시 후 다시 시도해주세요.'),
      ).toBeInTheDocument();
      expect(openSpy).not.toHaveBeenCalled();
      await waitFor(() => {
        for (const button of applyButtons('외부 폼으로 이동')) expect(button).toBeEnabled();
      });
    } finally {
      openSpy.mockRestore();
    }
  });

  it('다시 받는 동안에는 버튼이 잠기고 "모집 정보 확인 중" 이 보인다', async () => {
    server.use(respondDetail(externalAlwaysOpen, { hold: true }));
    renderCheckedDetail(externalAlwaysOpen, Date.now() - THREE_MINUTES_MS);

    fireEvent.click(applyButtons('외부 폼으로 이동')[0]);
    // 재확인 상태는 훅 인스턴스마다 따로라, 누른 카드 버튼만 확인 중이 된다(하단 바는 그대로).
    expect(await screen.findByRole('button', { name: '모집 정보 확인 중' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '외부 폼으로 이동' })).toBeEnabled();

    releaseDetail();
    await waitFor(() => expect(applyButtons('외부 폼으로 이동')[0]).toBeEnabled());
    expect(detailRequestCount).toBe(1);
  });

  it('마운트 재요청이 진행 중일 때 누르면 그 요청에 합류해 상세를 한 번만 받는다', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      // staleTime(5분)을 넘긴 상세 — SPA 재진입처럼 마운트 재요청이 자동으로 나간다. 응답은 붙잡아 둔다.
      server.use(respondDetail(externalAlwaysOpen, { hold: true }));
      renderCheckedDetail(externalAlwaysOpen, Date.now() - SIX_MINUTES_MS);
      await waitFor(() => expect(detailRequestCount).toBe(1));

      // 재요청 중에도 버튼은 열려 있다(이전에 받은 상세) — 누르면 재확인이 진행 중인 요청을 끊지 않고 합류한다.
      fireEvent.click(applyButtons('외부 폼으로 이동')[0]);
      releaseDetail();

      expect(
        await screen.findByText('모집 정보를 새로 불러왔어요. 확인 후 다시 눌러 주세요.'),
      ).toBeInTheDocument();
      expect(detailRequestCount).toBe(1);
      expect(openSpy).not.toHaveBeenCalled();
    } finally {
      openSpy.mockRestore();
    }
  });

  it('일반 폼은 확인한 지 오래돼도 상세를 다시 받지 않고 기존 흐름(비로그인 → 로그인)으로 간다', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      server.use(respondDetail(clubDetail));
      renderCheckedDetail(clubDetail, Date.now() - THREE_MINUTES_MS);

      fireEvent.click(applyButtons('지원하기')[0]);
      await waitFor(() =>
        expect(mockRouterPush).toHaveBeenCalledWith(`/login?next=${encodeURIComponent('/apply/100')}`),
      );
      expect(detailRequestCount).toBe(0);
      expect(openSpy).not.toHaveBeenCalled();
    } finally {
      openSpy.mockRestore();
    }
  });
});
