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

// vi.mock 호이스팅 때문에 mock 접두사여야 한다 — 일반 폼의 로그인 이동을 단언한다.
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

// 상세 재요청을 붙잡아 두는 핸들러 — 응답 전(시드만 보이는 구간)과 응답 후를 나눠 보고, 요청 수를 센다.
let detailRequestCount = 0;
let releaseDetail: () => void = () => {};
// 단언이 풀어 주기 전에 실패해도 붙잡힌 요청을 남기지 않는다.
afterEach(() => {
  releaseDetail();
  detailRequestCount = 0;
});

function holdDetail(latestDetail: ClubDetail) {
  const released = new Promise<void>((resolve) => {
    releaseDetail = resolve;
  });
  return http.get('*/clubs/1', async () => {
    detailRequestCount += 1;
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

/** 최신 상세가 캐시에 반영됐는지 — 시드는 updatedAt 0 이고, 재요청이 적용되면 그 시각이 찍힌다. */
function detailUpdatedAt(queryClient: QueryClient): number {
  return queryClient.getQueryState(clubQueryKeys.detail(1))?.dataUpdatedAt ?? 0;
}

// jsdom 은 반응형 숨김(md:hidden·hidden md:block)을 적용하지 않아 데스크탑 카드와 모바일 하단 바 버튼이 함께 잡힌다.
// noUncheckedIndexedAccess 라 두 버튼을 튜플로 돌려준다 — [0] 이 카드(DOM 앞), [1] 이 하단 바다.
function applyButtons(name: string): [HTMLElement, HTMLElement] {
  const buttons = screen.getAllByRole('button', { name });
  expect(buttons).toHaveLength(2);
  const [cardButton, barButton] = buttons;
  if (!cardButton || !barButton) throw new Error(`"${name}" 버튼이 두 개가 아니다`);
  return [cardButton, barButton];
}

describe('동아리 상세 — ISR 스냅샷에서도 지원 버튼은 열려 있고, 외부 폼은 최신 상세로만 연다', () => {
  it('상시모집 외부 폼 시드는 최신 상세 전에도 열려 있지만 눌러도 열리지 않고, 마감 응답이 오면 잠긴 채 마감으로 바뀐다', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      server.use(holdDetail(externalClosed));
      renderSeededDetail(externalAlwaysOpen);
      // 시드(updatedAt 0)는 마운트 때 곧바로 다시 받는다 — 그 응답을 붙잡아 둔 구간이다.
      await waitFor(() => expect(detailRequestCount).toBe(1));

      // 시드(상시모집)가 화면에 있는 구간 — 버튼은 열려 있고 확인 중 스피너가 없다. 눌러도 외부 폼은 열리지 않는다.
      expect(screen.getAllByText('상시모집').length).toBeGreaterThan(0);
      const [cardButton, barButton] = applyButtons('외부 폼으로 이동');
      expect(cardButton).toBeEnabled();
      expect(barButton).toBeEnabled();
      expect(screen.queryByRole('status', { name: '모집 정보 확인 중' })).not.toBeInTheDocument();

      fireEvent.click(cardButton);

      // 누른 카드 버튼(같은 노드)만 확인 중이 된다 — 라벨은 그대로고 스피너 이름이 앞에 붙으며 aria-disabled 로 알린다(시각적 잠금 없음).
      // 진행 중인 마운트 재요청에 합류하므로 요청은 하나다.
      const pendingCardButton = await screen.findByRole('button', {
        name: /^모집 정보 확인 중\s?외부 폼으로 이동$/,
      });
      expect(pendingCardButton).toBe(cardButton);
      expect(pendingCardButton).toHaveAttribute('aria-disabled', 'true');
      expect(pendingCardButton).toBeEnabled();
      expect(barButton).toBeEnabled();
      expect(barButton).not.toHaveAttribute('aria-disabled');
      expect(openSpy).not.toHaveBeenCalled();
      expect(detailRequestCount).toBe(1);
      expect(screen.queryByText('모집 정보를 확인하지 못했어요. 새로고침해 주세요.')).not.toBeInTheDocument();

      releaseDetail();
      expect(
        await screen.findByText('모집 정보를 새로 불러왔어요. 확인 후 다시 눌러 주세요.'),
      ).toBeInTheDocument();
      expect((await screen.findAllByText('이번 모집은 종료됐어요')).length).toBeGreaterThan(0);
      for (const button of applyButtons('외부 폼으로 이동')) {
        expect(button).toBeDisabled();
        fireEvent.click(button);
      }
      expect(openSpy).not.toHaveBeenCalled();
      expect(detailRequestCount).toBe(1);
    } finally {
      openSpy.mockRestore();
    }
  });

  it('열린 일반 폼 시드는 최신 상세 전에도 버튼이 열려 있고, 누르면 상세를 다시 받지 않고 기존 흐름(비로그인 → 로그인)으로 가며, 최신 상세가 반영돼도 버튼은 그대로다', async () => {
    server.use(holdDetail(clubDetail));
    const queryClient = renderSeededDetail(clubDetail);
    await waitFor(() => expect(detailRequestCount).toBe(1));

    const [cardButton, barButton] = applyButtons('지원하기');
    expect(cardButton).toBeEnabled();
    expect(barButton).toBeEnabled();
    expect(screen.queryByRole('status', { name: '모집 정보 확인 중' })).not.toBeInTheDocument();
    expect(screen.queryByText('모집 정보를 확인하지 못했어요. 새로고침해 주세요.')).not.toBeInTheDocument();
    // 하단 바 화살표는 스냅샷에서도 그대로다.
    expect(barButton.querySelector('svg')).not.toBeNull();

    fireEvent.click(cardButton);

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith(`/login?next=${encodeURIComponent('/apply/100')}`),
    );
    // 마운트 재요청 하나뿐 — 일반 폼은 상세를 다시 받지 않는다(서버 자격 확인이 마감을 막는다).
    expect(detailRequestCount).toBe(1);

    // 확인 전후 불변 — 최신 상세가 반영돼도 같은 노드·같은 이름·활성·화살표 그대로다(색·화살표 플립 없음).
    releaseDetail();
    await waitFor(() => expect(detailUpdatedAt(queryClient)).toBeGreaterThan(0));
    const [settledCardButton, settledBarButton] = applyButtons('지원하기');
    expect(settledCardButton).toBe(cardButton);
    expect(settledBarButton).toBe(barButton);
    for (const button of [settledCardButton, settledBarButton]) {
      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute('aria-disabled');
    }
    expect(settledBarButton.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('status', { name: '모집 정보 확인 중' })).not.toBeInTheDocument();
  });

  it('최신 상세를 받지 못하면(재요청 실패) 시드 본문은 남고 새로고침을 안내하지만, 버튼은 잠기지 않는다', async () => {
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
    for (const button of applyButtons('지원하기')) expect(button).toBeEnabled();
    // 데스크탑 카드는 버튼 아래 한 줄, 모바일 하단 바는 좌측 라벨 자리에 안내한다(#1432 노출 조건 그대로).
    expect(screen.getByText('모집 정보를 확인하지 못했어요. 새로고침해 주세요.')).toBeInTheDocument();
    expect(screen.getByText('모집 정보 확인 실패')).toBeInTheDocument();
    expect(screen.getByText('새로고침해 주세요')).toBeInTheDocument();
  });
});
