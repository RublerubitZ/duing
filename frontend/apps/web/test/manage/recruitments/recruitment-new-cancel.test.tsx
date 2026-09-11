import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import {
  loadRecruitmentDraft,
  saveRecruitmentDraft,
} from '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentDraft';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

import NewRecruitmentPage from '@/app/manage/clubs/[clubId]/recruitments/new/page';

const CLUB_ID = 1;
const RECRUITMENTS_HREF = `/manage/clubs/${CLUB_ID}/recruitments`;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

const server = setupServer(
  http.get(`*/clubs/${CLUB_ID}/recruitments`, () =>
    HttpResponse.json({ ok: true, message: null, data: [] }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  push.mockClear();
  window.localStorage.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // React 19 의 use(thenable) 가 동기적으로 값을 꺼내도록 status/value 를 미리 태깅한다(복제 테스트와 동일 패턴).
  const paramsValue = { clubId: String(CLUB_ID) };
  const params = Object.assign(Promise.resolve(paramsValue), {
    status: 'fulfilled' as const,
    value: paramsValue,
  });
  const searchParams = Object.assign(Promise.resolve({}), {
    status: 'fulfilled' as const,
    value: {},
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <NewRecruitmentPage params={params} searchParams={searchParams} />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe('NewRecruitmentPage — 취소', () => {
  // 그냥 나가면 자동 저장본이 남아, 취소했는데도 다음 진입에서 "작성 중이던 내용이 있어요" 가 뜬다.
  it('임시저장이 있으면 확인을 거쳐 초안을 지우고 목록으로 나간다', async () => {
    saveRecruitmentDraft(CLUB_ID, { title: '쓰다 만 제목' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '취소' }));
    expect(await screen.findByRole('dialog', { name: '작성을 취소할까요?' })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '취소하고 나가기' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(RECRUITMENTS_HREF));
    expect(loadRecruitmentDraft(CLUB_ID)).toBeNull();
  });

  it('지울 초안이 없으면 묻지 않고 바로 목록으로 나간다', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '취소' }));

    expect(push).toHaveBeenCalledWith(RECRUITMENTS_HREF);
    expect(screen.queryByRole('dialog', { name: '작성을 취소할까요?' })).not.toBeInTheDocument();
  });
});
