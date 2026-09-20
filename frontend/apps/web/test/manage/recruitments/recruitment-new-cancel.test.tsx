import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse, delay } from 'msw';
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

// 페이지가 임시저장 주인을 알려면 useMeQuery 가 돌아야 하고, 그 훅은 인증 상태에서만 실행된다.
// selectIsAuthenticated 등 나머지 export 는 실제 모듈을 그대로 쓴다(members-page 테스트와 같은 패턴).
vi.mock('@duing/stores', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/stores')>()),
  useAuthStore: (selector: (state: { status: string }) => unknown) =>
    selector({ status: 'authenticated' }),
}));

import NewRecruitmentPage from '@/app/manage/clubs/[clubId]/recruitments/new/page';

const CLUB_ID = 1;
const ME_ID = 42;
const DRAFT_OWNER = { userId: ME_ID, clubId: CLUB_ID };
const RECRUITMENTS_HREF = `/manage/clubs/${CLUB_ID}/recruitments`;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

const server = setupServer(
  http.get(`*/clubs/${CLUB_ID}/recruitments`, () =>
    HttpResponse.json({ ok: true, message: null, data: [] }),
  ),
  http.get('*/users/me', () =>
    HttpResponse.json({ ok: true, message: null, data: { id: ME_ID, name: '운영진' } }),
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
    saveRecruitmentDraft(DRAFT_OWNER, { title: '쓰다 만 제목' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '취소' }));
    expect(await screen.findByRole('dialog', { name: '작성을 취소할까요?' })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '취소하고 나가기' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(RECRUITMENTS_HREF));
    expect(loadRecruitmentDraft(DRAFT_OWNER)).toBeNull();
  });

  it('지울 초안이 없으면 묻지 않고 바로 목록으로 나간다', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '취소' }));

    expect(push).toHaveBeenCalledWith(RECRUITMENTS_HREF);
    expect(screen.queryByRole('dialog', { name: '작성을 취소할까요?' })).not.toBeInTheDocument();
  });
});

describe('NewRecruitmentPage — 임시저장 복원', () => {
  // 폼은 마운트 때 한 번만 임시저장을 읽는다 — 작성자 id 없이 먼저 마운트하면 하드 리로드에서
  // 복원 배너가 영영 뜨지 않는다. 그래서 me 를 기다린 뒤 폼을 띄운다.
  it('작성자 정보를 기다렸다가 폼을 띄워 저장해 둔 초안 배너를 보여준다', async () => {
    server.use(
      http.get('*/users/me', async () => {
        await delay(20);
        return HttpResponse.json({ ok: true, message: null, data: { id: ME_ID, name: '운영진' } });
      }),
    );
    saveRecruitmentDraft(DRAFT_OWNER, { title: '새로고침 전에 쓰던 제목' });
    renderPage();

    expect(await screen.findByRole('status', { name: '작성자 정보 불러오는 중' })).toBeInTheDocument();

    expect(await screen.findByRole('button', { name: '이어서 쓰기' })).toBeInTheDocument();
  });

  it('다른 운영진이 같은 기기에 남긴 초안은 복원되지 않는다', async () => {
    saveRecruitmentDraft({ userId: ME_ID + 1, clubId: CLUB_ID }, { title: '남이 쓰던 제목' });
    renderPage();

    expect(await screen.findByRole('button', { name: '취소' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '이어서 쓰기' })).not.toBeInTheDocument();
  });
});
