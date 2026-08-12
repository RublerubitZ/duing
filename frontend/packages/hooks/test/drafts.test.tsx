import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { ApplicationDraft, DraftAnswer } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { draftQueryKeys } from '../src/draftQueryKeys';
import { useApplicationDraftMutation, useApplicationDraftQuery } from '../src/drafts';

const RECRUITMENT_ID = 42;
const OTHER_RECRUITMENT_ID = 43;
const TEXT_QUESTION_ID = '11111111-1111-1111-1111-111111111111';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  };
}

function newQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

function answersOf(text: string): DraftAnswer[] {
  return [{ questionId: TEXT_QUESTION_ID, values: [text] }];
}

/** 지원서 화면과 같은 구성 — 조회 훅이 떠 있는 상태에서 저장이 반복된다. */
function useDraftScreen(recruitmentId: number) {
  return {
    draft: useApplicationDraftQuery(recruitmentId),
    save: useApplicationDraftMutation(recruitmentId),
  };
}

let getCountByRecruitment: Record<number, number> = {};
let putBodies: unknown[] = [];
let storedAnswers: DraftAnswer[] = [];

function draftGetHandler(recruitmentId: number) {
  return http.get(`*/recruitments/${recruitmentId}/draft`, () => {
    getCountByRecruitment[recruitmentId] = (getCountByRecruitment[recruitmentId] ?? 0) + 1;
    const draft: ApplicationDraft =
      storedAnswers.length > 0
        ? { exists: true, answers: storedAnswers, updatedAt: '2026-08-12T00:00:00Z' }
        : { exists: false, answers: [], updatedAt: null };
    return HttpResponse.json({ ok: true, message: null, data: draft });
  });
}

const server = setupServer(
  draftGetHandler(RECRUITMENT_ID),
  draftGetHandler(OTHER_RECRUITMENT_ID),
  http.put(`*/recruitments/${RECRUITMENT_ID}/draft`, async ({ request }) => {
    putBodies.push(await request.json());
    return new HttpResponse(null, { status: 204 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  getCountByRecruitment = {};
  putBodies = [];
  storedAnswers = [];
});
afterAll(() => server.close());

/**
 * 재조회는 저장 완료 뒤 비동기로 출발하므로, 곧바로 세면 "아직 안 나간 것"과 "안 나가는 것"을
 * 구분하지 못한다. 매크로태스크를 충분히 흘려보낸 뒤에 세어 둘을 갈라놓는다.
 */
async function settleRefetchWindow() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

describe('임시저장 훅 — 저장 후 재조회 없음', () => {
  it('저장 1회는 PUT 1회 + GET 0회로 끝나고 캐시는 저장한 값이 된다', async () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useDraftScreen(RECRUITMENT_ID), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.draft.isSuccess).toBe(true));
    // 첫 진입 조회 1회 — 여기서부터 늘어나는 GET 이 저장이 유발한 재조회다.
    expect(getCountByRecruitment[RECRUITMENT_ID]).toBe(1);

    await act(async () => {
      await result.current.save.mutateAsync({ answers: answersOf('열정') });
    });
    await settleRefetchWindow();

    expect(putBodies).toEqual([{ answers: answersOf('열정') }]);
    expect(getCountByRecruitment[RECRUITMENT_ID]).toBe(1);
    expect(queryClient.getQueryState(draftQueryKeys.byRecruitment(RECRUITMENT_ID))?.isInvalidated).toBe(
      false,
    );

    const cached = queryClient.getQueryData<ApplicationDraft>(
      draftQueryKeys.byRecruitment(RECRUITMENT_ID),
    );
    expect(cached?.exists).toBe(true);
    expect(cached?.answers).toEqual(answersOf('열정'));
    expect(typeof cached?.updatedAt).toBe('string');
    // 조회 훅도 같은 값을 그대로 본다 — 재조회 없이 화면 상태가 최신이다.
    expect(result.current.draft.data?.answers).toEqual(answersOf('열정'));
  });

  it('연속 저장 3회도 GET 0회이고 캐시는 마지막 저장값을 담는다', async () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useDraftScreen(RECRUITMENT_ID), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.draft.isSuccess).toBe(true));

    for (const text of ['하나', '둘', '셋']) {
      await act(async () => {
        await result.current.save.mutateAsync({ answers: answersOf(text) });
      });
    }
    await settleRefetchWindow();

    expect(putBodies).toHaveLength(3);
    expect(getCountByRecruitment[RECRUITMENT_ID]).toBe(1);
    expect(
      queryClient.getQueryData<ApplicationDraft>(draftQueryKeys.byRecruitment(RECRUITMENT_ID))
        ?.answers,
    ).toEqual(answersOf('셋'));
  });

  it('저장이 실패하면 캐시를 건드리지 않고 재조회도 하지 않는다', async () => {
    server.use(
      http.put(`*/recruitments/${RECRUITMENT_ID}/draft`, () =>
        HttpResponse.json(
          { ok: false, message: '마감된 모집입니다.', data: null },
          { status: 410 },
        ),
      ),
    );

    const queryClient = newQueryClient();
    storedAnswers = answersOf('서버에 저장된 답');
    const { result } = renderHook(() => useDraftScreen(RECRUITMENT_ID), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.draft.isSuccess).toBe(true));

    await act(async () => {
      await result.current.save.mutateAsync({ answers: answersOf('실패할 답') }).catch(() => undefined);
    });
    await settleRefetchWindow();

    expect(result.current.save.isError).toBe(true);
    expect(getCountByRecruitment[RECRUITMENT_ID]).toBe(1);
    // 실패한 입력이 캐시에 남으면 재진입 시 저장되지도 않은 답이 시드된다.
    expect(
      queryClient.getQueryData<ApplicationDraft>(draftQueryKeys.byRecruitment(RECRUITMENT_ID))
        ?.answers,
    ).toEqual(answersOf('서버에 저장된 답'));
  });

  it('저장은 그 모집의 캐시만 갱신하고 다른 모집 임시저장은 서버에서 새로 읽는다', async () => {
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useDraftScreen(RECRUITMENT_ID), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.draft.isSuccess).toBe(true));
    await act(async () => {
      await result.current.save.mutateAsync({ answers: answersOf('42번 모집 답') });
    });

    expect(
      queryClient.getQueryData(draftQueryKeys.byRecruitment(OTHER_RECRUITMENT_ID)),
    ).toBeUndefined();

    // 다른 모집 지원서로 이동 — 저장이 남긴 캐시가 아니라 그 모집의 GET 을 탄다.
    const other = renderHook(() => useDraftScreen(OTHER_RECRUITMENT_ID), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(other.result.current.draft.isSuccess).toBe(true));
    expect(getCountByRecruitment[OTHER_RECRUITMENT_ID]).toBe(1);
    expect(other.result.current.draft.data?.exists).toBe(false);
  });

  it('새로고침(새 QueryClient)이면 저장분을 서버 GET 으로 다시 읽어온다', async () => {
    const queryClient = newQueryClient();
    const { result, unmount } = renderHook(() => useDraftScreen(RECRUITMENT_ID), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.draft.isSuccess).toBe(true));
    await act(async () => {
      await result.current.save.mutateAsync({ answers: answersOf('저장된 답') });
    });
    // 서버도 저장을 반영한 상태가 된다.
    storedAnswers = answersOf('저장된 답');
    unmount();

    const reloaded = renderHook(() => useDraftScreen(RECRUITMENT_ID), {
      wrapper: makeWrapper(newQueryClient()),
    });

    await waitFor(() => expect(reloaded.result.current.draft.isSuccess).toBe(true));
    expect(getCountByRecruitment[RECRUITMENT_ID]).toBe(2);
    expect(reloaded.result.current.draft.data).toEqual({
      exists: true,
      answers: answersOf('저장된 답'),
      updatedAt: '2026-08-12T00:00:00Z',
    });
  });
});
