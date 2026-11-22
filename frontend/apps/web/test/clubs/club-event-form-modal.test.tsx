import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient, NETWORK_ERROR_MESSAGE, registerConnectivityAdapter } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

import { ClubEventFormModal } from '@/app/clubs/[clubId]/member/_components/ClubEventFormModal';

const CLUB_ID = 7;

// 서버가 받은 payload 를 그대로 캡처해 전송 형식을 단언한다.
let capturedCreateBody: Record<string, unknown> | null = null;
let capturedUpdateBody: Record<string, unknown> | null = null;

const server = setupServer(
  http.post(`http://localhost:8080/api/v1/clubs/${CLUB_ID}/events`, async ({ request }) => {
    capturedCreateBody = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ok: true, data: 1, message: null }, { status: 201 });
  }),
  http.patch(`http://localhost:8080/api/v1/clubs/${CLUB_ID}/events/11`, async ({ request }) => {
    capturedUpdateBody = (await request.json()) as Record<string, unknown>;
    return new HttpResponse(null, { status: 204 });
  }),
);

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  capturedCreateBody = null;
  capturedUpdateBody = null;
  registerConnectivityAdapter(null);
});
afterAll(() => server.close());

function renderWithProviders(node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>{node}</ApiClientProvider>
    </QueryClientProvider>,
  );
}

// 모달의 label 은 input 과 연결(htmlFor)되어 있지 않아 name 속성으로 찾는다.
function inputByName(container: HTMLElement, name: string): HTMLInputElement {
  const input = container.querySelector(`[name="${name}"]`);
  if (!(input instanceof HTMLInputElement)) throw new Error(`input[name="${name}"] 을 찾지 못했다`);
  return input;
}

describe('ClubEventFormModal 시각 전송 형식 (Schedule Time = KST 벽시계 원문)', () => {
  it('생성 시 datetime-local 입력을 UTC 변환 없이 벽시계 원문(초 포함)으로 전송한다', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <ClubEventFormModal mode="create" clubId={CLUB_ID} onClose={vi.fn()} />,
    );

    fireEvent.change(inputByName(container, 'title'), { target: { value: '정기 모임' } });
    fireEvent.change(inputByName(container, 'startAt'), { target: { value: '2026-09-10T18:00' } });
    fireEvent.change(inputByName(container, 'endAt'), { target: { value: '2026-09-10T20:30' } });

    await user.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(capturedCreateBody).not.toBeNull());
    // 핵심 회귀: KST 브라우저에서 toISOString() 이었다면 '2026-09-10T09:00:00.000Z' 로 -9h 전송됐다.
    expect(capturedCreateBody).toMatchObject({
      title: '정기 모임',
      startAt: '2026-09-10T18:00:00',
      endAt: '2026-09-10T20:30:00',
    });
  });

  it('수정 시에도 벽시계 원문(초 포함)으로 전송한다', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ClubEventFormModal
        mode="edit"
        clubId={CLUB_ID}
        eventId={11}
        defaultValues={{ title: '기존 일정', startAt: '2026-09-10T18:00', endAt: '2026-09-10T20:30' }}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '수정' }));

    await waitFor(() => expect(capturedUpdateBody).not.toBeNull());
    expect(capturedUpdateBody).toMatchObject({
      title: '기존 일정',
      startAt: '2026-09-10T18:00:00',
      endAt: '2026-09-10T20:30:00',
    });
  });
});

describe('ClubEventFormModal 저장 실패 안내 (#1633)', () => {
  const EVENTS_URL = `http://localhost:8080/api/v1/clubs/${CLUB_ID}/events`;
  const EVENT_URL = `${EVENTS_URL}/11`;
  const SAVE_FALLBACK_MESSAGE = '일정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.';

  function rejectWith(status: number, message: string) {
    return HttpResponse.json({ ok: false, data: null, message }, { status });
  }

  function renderCreateModal(onClose: () => void) {
    const view = renderWithProviders(
      <ClubEventFormModal mode="create" clubId={CLUB_ID} onClose={onClose} />,
    );
    fireEvent.change(inputByName(view.container, 'title'), { target: { value: '정기 모임' } });
    fireEvent.change(inputByName(view.container, 'startAt'), { target: { value: '2026-09-10T18:00' } });
    fireEvent.change(inputByName(view.container, 'endAt'), { target: { value: '2026-09-10T20:30' } });
    return view;
  }

  function renderEditModal(onClose: () => void) {
    return renderWithProviders(
      <ClubEventFormModal
        mode="edit"
        clubId={CLUB_ID}
        eventId={11}
        defaultValues={{ title: '기존 일정', startAt: '2026-09-10T18:00', endAt: '2026-09-10T20:30' }}
        onClose={onClose}
      />,
    );
  }

  it('추가 — 서버가 거절하면 서버 메시지를 버튼 줄 바로 위에 보이고, 창과 입력은 그대로 둔다', async () => {
    server.use(http.post(EVENTS_URL, () => rejectWith(403, '일정 추가 권한이 없습니다.')));
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = renderCreateModal(onClose);

    await user.click(screen.getByRole('button', { name: '추가' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('일정 추가 권한이 없습니다.');
    expect(alert.nextElementSibling).toContainElement(screen.getByRole('button', { name: '추가' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(inputByName(container, 'title')).toHaveValue('정기 모임');
    expect(screen.getByRole('button', { name: '추가' })).toBeEnabled();
  });

  it('추가 — ApiError 가 아닌 예외면 원문 대신 고정 문구를 보인다', async () => {
    // 2xx 인데 본문이 JSON 이 아니면 파서의 SyntaxError 가 ApiError 로 바뀌지 않고 그대로 올라온다.
    server.use(
      http.post(EVENTS_URL, () =>
        new HttpResponse('<html>ok</html>', { status: 201, headers: { 'Content-Type': 'text/html' } }),
      ),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderCreateModal(onClose);

    await user.click(screen.getByRole('button', { name: '추가' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(SAVE_FALLBACK_MESSAGE);
    expect(alert).not.toHaveTextContent('Unexpected token');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('수정 — 서버가 거절하면 서버 메시지를 보이고, 창과 입력은 그대로 둔다', async () => {
    server.use(http.patch(EVENT_URL, () => rejectWith(404, '일정을 찾을 수 없습니다.')));
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = renderEditModal(onClose);

    await user.click(screen.getByRole('button', { name: '수정' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('일정을 찾을 수 없습니다.');
    expect(onClose).not.toHaveBeenCalled();
    expect(inputByName(container, 'title')).toHaveValue('기존 일정');
  });

  it('수정 — 다시 제출하면 요청이 진행되는 동안 문구가 사라지고, 성공하면 창을 닫는다', async () => {
    let releaseSecondSave: () => void = () => {};
    const secondSaveGate = new Promise<void>((resolve) => {
      releaseSecondSave = resolve;
    });
    let patchCount = 0;
    server.use(
      http.patch(EVENT_URL, async () => {
        patchCount += 1;
        if (patchCount === 1) return rejectWith(404, '일정을 찾을 수 없습니다.');
        await secondSaveGate;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderEditModal(onClose);

    await user.click(screen.getByRole('button', { name: '수정' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('일정을 찾을 수 없습니다.');

    await user.click(screen.getByRole('button', { name: '수정' }));
    await waitFor(() => expect(patchCount).toBe(2));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(onClose).not.toHaveBeenCalled();

    releaseSecondSave();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('수정 — 본문 없는 5xx 로 합성된 "요청 실패 (502)" 대신 고정 문구를 보인다', async () => {
    server.use(http.patch(EVENT_URL, () => new HttpResponse(null, { status: 502 })));
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderEditModal(onClose);

    await user.click(screen.getByRole('button', { name: '수정' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(SAVE_FALLBACK_MESSAGE);
    expect(alert).not.toHaveTextContent('요청 실패');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('수정 — 네트워크가 끊기면 정규화된 안내(상태 0 ApiError)를 고정 문구로 덮지 않는다', async () => {
    server.use(http.patch(EVENT_URL, () => HttpResponse.error()));
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderEditModal(onClose);

    await user.click(screen.getByRole('button', { name: '수정' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(NETWORK_ERROR_MESSAGE);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('수정 — 요청 전에 바로 막혀도(오프라인) 다시 제출하면 안내를 새 요소로 그려 스크린리더가 다시 읽는다', async () => {
    // 연결 어댑터가 막으면 요청이 나가기 전에 실패해, 대기 상태가 화면에 그려지지 않고 곧장 오류로 간다.
    let blockedCount = 0;
    registerConnectivityAdapter(() => {
      blockedCount += 1;
      return false;
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderEditModal(onClose);

    await user.click(screen.getByRole('button', { name: '수정' }));
    const firstAlert = await screen.findByRole('alert');
    expect(firstAlert).toHaveTextContent(NETWORK_ERROR_MESSAGE);

    // 사람은 같은 ms 에 두 번 제출하지 못한다 — 제출 시각이 달라지도록 시계를 조금 넘긴다.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await user.click(screen.getByRole('button', { name: '수정' }));

    await waitFor(() => expect(blockedCount).toBe(2));
    await waitFor(() => expect(screen.getByRole('alert')).not.toBe(firstAlert));
    expect(screen.getByRole('alert')).toHaveTextContent(NETWORK_ERROR_MESSAGE);
    expect(onClose).not.toHaveBeenCalled();
  });
});
