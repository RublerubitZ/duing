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

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
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

// 상세 재요청 외의 마운트 요청(사진·히어로 활동·조회 비콘)만 기본으로 받는다 — 상세는 테스트마다 정한다.
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

// 상세 재요청을 붙잡아 두는 핸들러 — 응답 전(시드만 보이는 구간)과 응답 후를 나눠 본다.
let releaseDetail: () => void = () => {};
function holdDetail(latestDetail: ClubDetail) {
  const released = new Promise<void>((resolve) => {
    releaseDetail = resolve;
  });
  return http.get('*/clubs/1', async () => {
    await released;
    return envelope(latestDetail);
  });
}

/** page.tsx 처럼 상세를 updatedAt 0 으로 시드해 그린다 — 실패 재시도가 테스트를 늦추지 않게 retry 는 끈다. */
function renderSeededDetail(seedDetail: ClubDetail) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(clubQueryKeys.detail(1), seedDetail, { updatedAt: 0 });
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

// jsdom 은 반응형 숨김(md:hidden·hidden md:block)을 적용하지 않아 데스크탑 카드와 모바일 하단 바 버튼이 함께 잡힌다.
function applyButtons(name: string) {
  const buttons = screen.getAllByRole('button', { name });
  expect(buttons).toHaveLength(2);
  return buttons;
}

describe('동아리 상세 — ISR 스냅샷으로는 지원 버튼을 열지 않는다', () => {
  it('상시모집 외부 폼 시드여도 최신 상세 전에는 잠기고, 마감 응답이 오면 잠긴 채 마감으로 바뀐다', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      server.use(holdDetail(externalClosed));
      renderSeededDetail(externalAlwaysOpen);

      // 시드(상시모집)가 화면에 있는 구간 — 그래도 버튼은 잠겨 있고 눌러도 외부 폼이 열리지 않는다.
      expect(screen.getAllByText('상시모집').length).toBeGreaterThan(0);
      for (const button of applyButtons('외부 폼으로 이동')) {
        expect(button).toBeDisabled();
        fireEvent.click(button);
      }
      expect(openSpy).not.toHaveBeenCalled();

      releaseDetail();
      expect((await screen.findAllByText('이번 모집은 종료됐어요')).length).toBeGreaterThan(0);
      for (const button of applyButtons('외부 폼으로 이동')) {
        expect(button).toBeDisabled();
        fireEvent.click(button);
      }
      expect(openSpy).not.toHaveBeenCalled();
    } finally {
      openSpy.mockRestore();
    }
  });

  it('열린 모집 시드는 최신 상세가 열린 모집으로 도착한 뒤에야 지원 버튼이 열린다', async () => {
    server.use(holdDetail(clubDetail));
    renderSeededDetail(clubDetail);

    for (const button of applyButtons('지원하기')) expect(button).toBeDisabled();

    releaseDetail();
    await waitFor(() => {
      for (const button of applyButtons('지원하기')) expect(button).toBeEnabled();
    });
  });

  it('최신 상세를 받지 못하면(재요청 실패) 시드 본문은 남고 지원 버튼은 잠긴 채 남는다', async () => {
    server.use(
      http.get('*/clubs/1', () =>
        HttpResponse.json({ ok: false, data: null, message: '서버 오류' }, { status: 500 }),
      ),
    );
    const queryClient = renderSeededDetail(clubDetail);

    await waitFor(() =>
      expect(queryClient.getQueryState(clubQueryKeys.detail(1))?.status).toBe('error'),
    );
    expect(screen.getAllByText('모션케어').length).toBeGreaterThan(0);
    for (const button of applyButtons('지원하기')) expect(button).toBeDisabled();
  });
});
