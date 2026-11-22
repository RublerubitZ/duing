import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient, NETWORK_ERROR_MESSAGE } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

// 본문 에디터(Tiptap 지연 로드)를 폼 값으로 제어되는 textarea 로 바꾼다 — 작성 모드는 본문이 있어야 제출된다.
vi.mock('@/app/_components/NoticeRichEditorLazy', () => ({
  NoticeRichEditorLazy: (props: { value: string; onChange: (html: string) => void }) => (
    <textarea
      aria-label="본문"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  ),
}));

import { ClubNoticeFormModal } from '@/app/clubs/[clubId]/member/_components/ClubNoticeFormModal';

const CLUB_ID = 7;
const NOTICE_ID = 11;
const NOTICES_URL = `http://localhost:8080/api/v1/clubs/${CLUB_ID}/notices`;
const NOTICE_URL = `${NOTICES_URL}/${NOTICE_ID}`;
const SAVE_FALLBACK_MESSAGE = '공지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.';

// 기본 핸들러 없이 시작한다 — 테스트마다 server.use 로 응답을 걸고, 빠뜨리면 onUnhandledRequest 가 실패시킨다.
const server = setupServer();
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
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

// 창의 label 은 input 과 연결(htmlFor)돼 있지 않아 name 속성으로 찾는다.
function inputByName(container: HTMLElement, name: string): HTMLInputElement {
  const input = container.querySelector(`[name="${name}"]`);
  if (!(input instanceof HTMLInputElement)) throw new Error(`input[name="${name}"] 을 찾지 못했다`);
  return input;
}

function rejectWith(status: number, message: string) {
  return HttpResponse.json({ ok: false, data: null, message }, { status });
}

function renderCreateModal(onClose: () => void) {
  const view = renderWithProviders(
    <ClubNoticeFormModal mode="create" clubId={CLUB_ID} onClose={onClose} />,
  );
  fireEvent.change(inputByName(view.container, 'title'), { target: { value: '정기 공지' } });
  fireEvent.change(screen.getByLabelText('본문'), { target: { value: '<p>모임 안내</p>' } });
  return view;
}

function renderEditModal(onClose: () => void) {
  return renderWithProviders(
    <ClubNoticeFormModal
      mode="edit"
      clubId={CLUB_ID}
      noticeId={NOTICE_ID}
      defaultValues={{ title: '기존 공지', content: '<p>기존 본문</p>' }}
      defaultContentFormat="HTML"
      onClose={onClose}
    />,
  );
}

describe('ClubNoticeFormModal 저장 실패 안내 (#1633)', () => {
  it('작성 — 서버가 거절하면 서버 메시지를 버튼 줄 바로 위에 보이고, 창과 입력은 그대로 둔다', async () => {
    server.use(http.post(NOTICES_URL, () => rejectWith(403, '공지 작성 권한이 없습니다.')));
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = renderCreateModal(onClose);

    await user.click(screen.getByRole('button', { name: '작성' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('공지 작성 권한이 없습니다.');
    // 스크롤 영역 밖, 버튼 줄 바로 위 — 어디까지 스크롤했든 실패 순간 보이는 자리다.
    expect(alert.closest('.overflow-y-auto')).toBeNull();
    expect(alert.nextElementSibling).toContainElement(screen.getByRole('button', { name: '작성' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(inputByName(container, 'title')).toHaveValue('정기 공지');
    expect(screen.getByLabelText('본문')).toHaveValue('<p>모임 안내</p>');
    expect(screen.getByRole('button', { name: '작성' })).toBeEnabled();
  });

  it('작성 — ApiError 가 아닌 예외면 원문 대신 고정 문구를 보인다', async () => {
    // 2xx 인데 본문이 JSON 이 아니면 파서의 SyntaxError 가 ApiError 로 바뀌지 않고 그대로 올라온다.
    server.use(
      http.post(NOTICES_URL, () =>
        new HttpResponse('<html>ok</html>', { status: 201, headers: { 'Content-Type': 'text/html' } }),
      ),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderCreateModal(onClose);

    await user.click(screen.getByRole('button', { name: '작성' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(SAVE_FALLBACK_MESSAGE);
    expect(alert).not.toHaveTextContent('Unexpected token');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('수정 — 서버가 거절하면 서버 메시지를 보이고, 창과 입력은 그대로 둔다', async () => {
    server.use(http.patch(NOTICE_URL, () => rejectWith(404, '공지를 찾을 수 없습니다.')));
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = renderEditModal(onClose);

    await user.click(screen.getByRole('button', { name: '수정' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('공지를 찾을 수 없습니다.');
    expect(onClose).not.toHaveBeenCalled();
    expect(inputByName(container, 'title')).toHaveValue('기존 공지');
  });

  it('수정 — 다시 제출하면 요청이 진행되는 동안 문구가 사라지고, 성공하면 창을 닫는다', async () => {
    let releaseSecondSave: () => void = () => {};
    const secondSaveGate = new Promise<void>((resolve) => {
      releaseSecondSave = resolve;
    });
    let patchCount = 0;
    server.use(
      http.patch(NOTICE_URL, async () => {
        patchCount += 1;
        if (patchCount === 1) return rejectWith(404, '공지를 찾을 수 없습니다.');
        await secondSaveGate;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderEditModal(onClose);

    await user.click(screen.getByRole('button', { name: '수정' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('공지를 찾을 수 없습니다.');

    await user.click(screen.getByRole('button', { name: '수정' }));
    await waitFor(() => expect(patchCount).toBe(2));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(onClose).not.toHaveBeenCalled();

    releaseSecondSave();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('수정 — 본문 없는 5xx 로 합성된 "요청 실패 (502)" 대신 고정 문구를 보인다', async () => {
    server.use(http.patch(NOTICE_URL, () => new HttpResponse(null, { status: 502 })));
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
    server.use(http.patch(NOTICE_URL, () => HttpResponse.error()));
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderEditModal(onClose);

    await user.click(screen.getByRole('button', { name: '수정' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(NETWORK_ERROR_MESSAGE);
    expect(onClose).not.toHaveBeenCalled();
  });
});
