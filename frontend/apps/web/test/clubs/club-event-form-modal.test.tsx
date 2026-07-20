import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
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

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  capturedCreateBody = null;
  capturedUpdateBody = null;
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
