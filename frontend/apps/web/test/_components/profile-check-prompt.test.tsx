import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider, userQueryKeys } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type { Grade, ProfileCheckStatus, User } from '@duing/types';

import { ProfileCheckPrompt } from '@/app/_components/ProfileCheckPrompt';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { PROFILE_CHECK_SNOOZE_KEY } from '@/app/_lib/profileCheckSnooze';

/**
 * 학기별 정보 확인 팝업(스펙 §6.2). 실제 ApiClient + MSW — TanStack Query 는 모킹하지 않는다.
 * 문서 한정 숨김(모듈 변수)은 파일 안에서 테스트 사이에 남으므로 테스트마다 새 사용자 id 를 쓴다(createState).
 */
const BASE = 'http://localhost:8080/api/v1';
const TITLE = '새 학기, 내 정보를 확인해 주세요.';
const MESSAGE =
  '새 학기가 시작되었습니다!\n\n현재 등록된 학년과 전공 및 재학 상태가 올바른지 확인해 주세요.';
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

type ServerState = { me: User; status: ProfileCheckStatus; meRequests: number; statusRequests: number };

let lastUserId = 100;

function createState(grade: Grade, suggestedGrade: Grade | null): ServerState {
  lastUserId += 1;
  const me: User = {
    id: lastUserId,
    studentId: `2024${lastUserId}`,
    name: '홍길동',
    phone: '010-1234-5678',
    grade,
    role: 'STUDENT',
    college: 'IT_ENGINEERING',
    major: '컴퓨터정보공학부',
  };
  const status: ProfileCheckStatus = {
    pending: true,
    semesterYear: 2026,
    semesterTerm: 1,
    title: TITLE,
    message: MESSAGE,
    grade,
    college: 'IT_ENGINEERING',
    major: '컴퓨터정보공학부',
    suggestedGrade,
  };
  return { me, status, meRequests: 0, statusRequests: 0 };
}

function serve(state: ServerState) {
  server.use(
    http.get(`${BASE}/users/me`, () => {
      state.meRequests += 1;
      return HttpResponse.json({ ok: true, data: state.me, message: null });
    }),
    http.get(`${BASE}/users/me/profile-check`, () => {
      state.statusRequests += 1;
      return HttpResponse.json({ ok: true, data: state.status, message: null });
    }),
  );
}

function stubViewport(desktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === '(min-width: 768px)' ? desktop : false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// 폭이 768px 을 넘나드는 화면 회전 — 판정값을 바꾸고 등록된 change 리스너를 부른다. 처음은 모바일 폭이다.
function stubRotatableViewport() {
  let desktop = false;
  const listeners = new Set<() => void>();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return query === '(min-width: 768px)' ? desktop : false;
      },
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      dispatchEvent: () => false,
    }),
  });
  return {
    rotateToDesktop: () => {
      desktop = true;
      listeners.forEach((listener) => listener());
    },
  };
}

function renderPrompt(
  extra?: ReactNode,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <ToastProvider>
          {extra}
          <ProfileCheckPrompt />
        </ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

// 조회 두 건이 끝나고 "띄울지" 를 정하는 effect 까지 돈 뒤를 본다 — "안 뜬다" 단언이 공허하지 않게.
async function settle(state: ServerState, statusRequests: number) {
  await waitFor(() => {
    expect(state.statusRequests).toBe(statusRequests);
    expect(state.meRequests).toBeGreaterThanOrEqual(statusRequests);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

/** 뒤로가기 1회. jsdom 의 traversal 은 태스크 큐에 실리므로 popstate 발화 자체를 기다린다(back-dismiss-overlays 와 같은 하네스). */
async function pressBack() {
  // 엔트리를 물지 않은 상태에서 back() 하면 popstate 가 영원히 안 와 타임아웃으로 끝난다 — 먼저 단언한다.
  expect(window.history.state.__overlayId).toEqual(expect.any(Number));
  const popped = new Promise<void>((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
  });
  await act(async () => {
    window.history.back();
    await popped;
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  useAuthStore.setState({ status: 'authenticated', isVerified: true, user: null });
  stubViewport(true);
});
afterEach(() => {
  // 아래 전역 초기화(로그인 상태·matchMedia)가 마운트된 팝업을 act 밖에서 다시 그리지 않게 먼저 언마운트한다.
  cleanup();
  server.resetHandlers();
  window.localStorage.clear();
  Reflect.deleteProperty(window, 'matchMedia');
  useAuthStore.setState(useAuthStore.getInitialState(), true);
});
afterAll(() => server.close());

describe('ProfileCheckPrompt — 띄우지 않는 경우', () => {
  it('로그인하지 않았으면 조회하지 않고 아무것도 그리지 않는다', async () => {
    useAuthStore.setState({ status: 'unauthenticated', isVerified: true, user: null });
    const state = createState('SOPHOMORE', 'JUNIOR');
    serve(state);

    renderPrompt();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(state.statusRequests).toBe(0);
    expect(state.meRequests).toBe(0);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('띄울 게 없으면(pending:false) 아무것도 그리지 않는다', async () => {
    const state = createState('SOPHOMORE', null);
    state.status = { pending: false };
    serve(state);

    renderPrompt();
    await settle(state, 1);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('조회가 실패하면(배포 전 404) 아무것도 그리지 않는다', async () => {
    const state = createState('SOPHOMORE', 'JUNIOR');
    server.use(
      http.get(`${BASE}/users/me`, () => HttpResponse.json({ ok: true, data: state.me, message: null })),
      http.get(`${BASE}/users/me/profile-check`, () => {
        state.statusRequests += 1;
        return HttpResponse.json({ ok: false, data: null, message: '찾을 수 없습니다.' }, { status: 404 });
      }),
    );

    renderPrompt();
    await waitFor(() => expect(state.statusRequests).toBe(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('열리는 순간 입력란에 포커스가 있으면 이번에는 띄우지 않는다', async () => {
    const state = createState('SOPHOMORE', 'JUNIOR');
    serve(state);

    renderPrompt(<input aria-label="동아리 검색" autoFocus />);
    await settle(state, 1);

    expect(document.activeElement).toBe(screen.getByLabelText('동아리 검색'));
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('열리는 순간 다른 다이얼로그가 열려 있으면 이번에는 띄우지 않는다', async () => {
    const state = createState('SOPHOMORE', 'JUNIOR');
    serve(state);

    renderPrompt(
      <div role="dialog" data-state="open" aria-label="알림">
        알림 목록
      </div>,
    );
    await settle(state, 1);

    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('캐시의 pending:true 를 다시 받는 중이면 기다렸다가 받은 값으로 정한다 — 그사이 확인됐으면 띄우지 않는다', async () => {
    const state = createState('SOPHOMORE', 'JUNIOR');
    // 설정 화면에서 프로필을 저장해 서버는 이 학기를 확인으로 기록했지만, 팝업 상태 키는 무효화만 돼(구독자 없음)
    // 캐시에 pending:true 가 남은 채 마이페이지로 돌아온 경우다(앱 기본값 staleTime 30초).
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
    });
    queryClient.setQueryData(userQueryKeys.profileCheck(), state.status);
    await queryClient.invalidateQueries({ queryKey: userQueryKeys.profileCheck() });
    state.status = { pending: false };
    let releaseStatus: () => void = () => undefined;
    serve(state);
    server.use(
      http.get(`${BASE}/users/me/profile-check`, async () => {
        state.statusRequests += 1;
        await new Promise<void>((resolve) => {
          releaseStatus = resolve;
        });
        return HttpResponse.json({ ok: true, data: state.status, message: null });
      }),
    );

    renderPrompt(undefined, queryClient);
    // 다시 받는 중 — 내 정보는 도착했고 캐시에는 아직 pending:true 가 있다.
    await settle(state, 1);
    expect(screen.queryByText(TITLE)).toBeNull();

    await act(async () => {
      releaseStatus();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(queryClient.getQueryData(userQueryKeys.profileCheck())).toEqual({ pending: false });
    expect(screen.queryByText(TITLE)).toBeNull();
  });
});

describe('ProfileCheckPrompt — 표시', () => {
  it('PC 에서는 가운데 다이얼로그로 학기·제목·정보·학년 변화와 제안 버튼을 보여 주고, 제목에 포커스를 둔다', async () => {
    const state = createState('SOPHOMORE', 'JUNIOR');
    serve(state);

    renderPrompt();

    const dialog = await screen.findByRole('dialog', { name: TITLE });
    expect(dialog).toHaveClass('max-w-[420px]');
    expect(within(dialog).getByText('2026학년도 1학기')).toBeInTheDocument();
    const gradeValue = within(dialog).getByText('학년').nextElementSibling;
    expect(gradeValue?.textContent).toContain('2학년');
    expect(gradeValue?.textContent).toContain('3학년');
    expect(within(dialog).getByText('IT·공과대학')).toBeInTheDocument();
    expect(within(dialog).getByText('컴퓨터정보공학부')).toBeInTheDocument();
    expect(within(dialog).getByText(/새 학기가 시작되었습니다!/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '3학년이 맞아요' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '정보 수정하기' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '나중에 확인하기' })).toBeInTheDocument();
    // Enter 한 번으로 학년이 바뀌지 않게 — 주 버튼이 아니라 제목에 포커스.
    await waitFor(() =>
      expect(document.activeElement).toBe(within(dialog).getByRole('heading', { name: TITLE })),
    );
  });

  it('모바일에서는 닫기(X) 버튼 없는 하단 시트로 띄운다', async () => {
    stubViewport(false);
    const state = createState('SOPHOMORE', 'JUNIOR');
    serve(state);

    renderPrompt();

    const sheet = await screen.findByRole('dialog', { name: TITLE });
    expect(sheet).toHaveClass('rounded-t-xl');
    expect(within(sheet).queryByRole('button', { name: '닫기' })).toBeNull();
    expect(within(sheet).getByRole('button', { name: '3학년이 맞아요' })).toBeInTheDocument();
  });

  it('제안이 없으면 주 버튼이 "현재 정보가 맞아요" 이고 학년 변화 표시가 없다', async () => {
    const state = createState('SENIOR', null);
    serve(state);

    renderPrompt();

    const dialog = await screen.findByRole('dialog', { name: TITLE });
    expect(within(dialog).getByRole('button', { name: '현재 정보가 맞아요' })).toBeInTheDocument();
    expect(within(dialog).getByText('학년').nextElementSibling).toHaveTextContent(/^4학년$/);
    expect(within(dialog).queryByText('→')).toBeNull();
  });
});

describe('ProfileCheckPrompt — 화면 회전', () => {
  it('모바일 폭에서 시트로 띄운 뒤 폭이 768px 을 넘어도 시트를 그대로 둔다', async () => {
    const viewport = stubRotatableViewport();
    const state = createState('SOPHOMORE', 'JUNIOR');
    serve(state);
    const user = userEvent.setup();

    renderPrompt();
    expect(await screen.findByRole('dialog', { name: TITLE })).toHaveClass('rounded-t-xl');

    await act(async () => {
      viewport.rotateToDesktop();
    });
    expect(screen.getByRole('dialog', { name: TITLE })).toHaveClass('rounded-t-xl');

    // 팝업이 다시 그려져도(수정 창을 열었다 닫음) 띄울 때 정한 시트다.
    await user.click(screen.getByRole('button', { name: '정보 수정하기' }));
    const editDialog = await screen.findByRole('dialog', { name: '프로필 수정' });
    await user.click(within(editDialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '프로필 수정' })).toBeNull());
    const popup = screen.getByRole('dialog', { name: TITLE });
    expect(popup).toHaveClass('rounded-t-xl');
    expect(popup).not.toHaveClass('max-w-[420px]');
  });

  it('수정 창을 연 채 화면을 돌려도 수정 창이 맨 위에서 가려지지 않고 입력 포커스를 지킨다', async () => {
    const viewport = stubRotatableViewport();
    const state = createState('SOPHOMORE', 'JUNIOR');
    serve(state);
    const user = userEvent.setup();

    renderPrompt();
    await user.click(await screen.findByRole('button', { name: '정보 수정하기' }));
    const editDialog = await screen.findByRole('dialog', { name: '프로필 수정' });
    const majorInput = within(editDialog).getByPlaceholderText('학과명 입력 (예: 컴퓨터정보공학부)');
    await user.click(majorInput);

    await act(async () => {
      viewport.rotateToDesktop();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // 컨테이너가 바뀌어 팝업이 새로 열리면 수정 창 위에 겹쳐 수정 창을 aria-hidden 으로 가리고 포커스를 가져간다.
    expect(screen.getByRole('dialog', { name: '프로필 수정' })).toBe(editDialog);
    expect(editDialog.closest('[aria-hidden="true"]')).toBeNull();
    expect(document.activeElement).toBe(majorInput);
  });
});

describe('ProfileCheckPrompt — 확인', () => {
  it('주 버튼은 제안 학년을 절대값으로 보내고, 성공하면 닫고 "정보를 확인했어요." 를 알린다', async () => {
    const state = createState('SOPHOMORE', 'JUNIOR');
    let sentBody: unknown = null;
    serve(state);
    server.use(
      http.put(`${BASE}/users/me/profile-check`, async ({ request }) => {
        sentBody = await request.json();
        state.me = { ...state.me, grade: 'JUNIOR' };
        state.status = { pending: false };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();

    renderPrompt();
    await user.click(await screen.findByRole('button', { name: '3학년이 맞아요' }));

    expect(await screen.findByText('정보를 확인했어요.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull());
    expect(sentBody).toEqual({ semesterYear: 2026, semesterTerm: 1, grade: 'JUNIOR' });
  });

  it('보낸 학년이 내 정보에 반영되지 않았으면(다른 곳에서 먼저 확인) 그 사실을 알린다', async () => {
    const state = createState('SOPHOMORE', 'JUNIOR');
    serve(state);
    server.use(
      http.put(`${BASE}/users/me/profile-check`, () => {
        // 다른 기기가 먼저 "현재 정보가 맞아요" 로 확인했다 — 서버는 204 로 받고 학년을 바꾸지 않는다.
        state.status = { pending: false };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();

    renderPrompt();
    await user.click(await screen.findByRole('button', { name: '3학년이 맞아요' }));

    expect(await screen.findByText('이미 다른 곳에서 확인해서 학년은 바뀌지 않았어요.')).toBeInTheDocument();
    expect(screen.queryByText('정보를 확인했어요.')).toBeNull();
  });

  it('기간이 끝났으면(409 PROFILE_CHECK_CLOSED) 닫고 기간 종료를 알린다', async () => {
    const state = createState('SOPHOMORE', 'JUNIOR');
    serve(state);
    server.use(
      http.put(`${BASE}/users/me/profile-check`, () => {
        state.status = { pending: false };
        return HttpResponse.json(
          { ok: false, data: null, message: '지금은 정보 확인 기간이 아닙니다.', code: 'PROFILE_CHECK_CLOSED' },
          { status: 409 },
        );
      }),
    );
    const user = userEvent.setup();

    renderPrompt();
    await user.click(await screen.findByRole('button', { name: '3학년이 맞아요' }));

    expect(await screen.findByText('지금은 정보 확인 기간이 아니에요.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('그 밖의 실패는 팝업 안에 오류를 보여 주고 닫지 않는다', async () => {
    const state = createState('SOPHOMORE', 'JUNIOR');
    serve(state);
    server.use(
      http.put(`${BASE}/users/me/profile-check`, () =>
        HttpResponse.json({ ok: false, data: null, message: '일시적인 오류가 발생했습니다.' }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();

    renderPrompt();
    await user.click(await screen.findByRole('button', { name: '3학년이 맞아요' }));

    const dialog = screen.getByRole('dialog', { name: TITLE });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('일시적인 오류가 발생했습니다.');
    expect(within(dialog).getByRole('button', { name: '3학년이 맞아요' })).toBeEnabled();
  });

  it('열린 동안 재조회가 pending:false 를 가져와도 팝업을 내리지 않는다 — 열린 뒤에는 연 순간의 상태로 그린다', async () => {
    const state = createState('SOPHOMORE', 'JUNIOR');
    serve(state);
    server.use(
      http.put(`${BASE}/users/me/profile-check`, () => {
        // 이 요청은 실패했지만 그 사이 다른 기기가 확인했다 — 실패 뒤 재조회는 pending:false 를 받는다.
        state.status = { pending: false };
        return HttpResponse.json({ ok: false, data: null, message: '일시적인 오류가 발생했습니다.' }, { status: 500 });
      }),
    );
    const user = userEvent.setup();

    renderPrompt();
    await user.click(await screen.findByRole('button', { name: '3학년이 맞아요' }));
    // 실패도 상태를 다시 받는다(훅 onSettled) — 그 응답(pending:false)이 반영될 때까지 기다린다.
    await waitFor(() => expect(state.statusRequests).toBe(2));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const dialog = screen.getByRole('dialog', { name: TITLE });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('일시적인 오류가 발생했습니다.');
    expect(within(dialog).getByText('2026학년도 1학기')).toBeInTheDocument();
  });

  it('전송 중에는 Esc 로 닫히지 않고, 끝나면 닫힌다', async () => {
    const state = createState('SOPHOMORE', 'JUNIOR');
    let releasePut: () => void = () => undefined;
    let putReached = false;
    serve(state);
    server.use(
      http.put(`${BASE}/users/me/profile-check`, async () => {
        await new Promise<void>((resolve) => {
          releasePut = resolve;
          // 핸들러가 실제로 요청을 잡은 뒤에만 풀어 준다 — aria-busy 는 요청이 핸들러에 닿기 전에도 켜진다.
          putReached = true;
        });
        state.me = { ...state.me, grade: 'JUNIOR' };
        state.status = { pending: false };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();

    renderPrompt();
    await user.click(await screen.findByRole('button', { name: '3학년이 맞아요' }));
    const dialog = screen.getByRole('dialog', { name: TITLE });
    await waitFor(() => expect(dialog).toHaveAttribute('aria-busy', 'true'));

    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveTextContent('정보 확인 중');

    await waitFor(() => expect(putReached).toBe(true));
    await act(async () => {
      releasePut();
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull());
  });

  // 뒤로가기는 busy 가 막는 Esc·스크림·스와이프와 달리 onOpenChange(false) 로 오므로 팝업 쪽 가드가 따로 막아야 한다(D5).
  it('전송 중에는 뒤로가기로도 닫히지 않고, 끝나면 확인 토스트와 함께 닫힌다', async () => {
    stubViewport(false);
    const state = createState('SOPHOMORE', 'JUNIOR');
    let releasePut: () => void = () => undefined;
    let putReached = false;
    serve(state);
    server.use(
      http.put(`${BASE}/users/me/profile-check`, async () => {
        await new Promise<void>((resolve) => {
          releasePut = resolve;
          putReached = true;
        });
        state.me = { ...state.me, grade: 'JUNIOR' };
        state.status = { pending: false };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();

    renderPrompt();
    await user.click(await screen.findByRole('button', { name: '3학년이 맞아요' }));
    await waitFor(() => expect(putReached).toBe(true));

    await pressBack();

    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();

    await act(async () => {
      releasePut();
    });
    expect(await screen.findByText('정보를 확인했어요.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull());
  });
});

describe('ProfileCheckPrompt — 숨김', () => {
  it('"나중에 확인하기" 는 이 기기에 24시간 숨김을 저장하고, 다시 들어와도 띄우지 않는다', async () => {
    const state = createState('SOPHOMORE', 'JUNIOR');
    serve(state);
    const user = userEvent.setup();

    const first = renderPrompt();
    await user.click(await screen.findByRole('button', { name: '나중에 확인하기' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull());

    const stored = window.localStorage.getItem(PROFILE_CHECK_SNOOZE_KEY);
    expect(stored === null ? null : JSON.parse(stored)).toMatchObject({
      userId: state.me.id,
      semesterYear: 2026,
      semesterTerm: 1,
    });

    first.unmount();
    renderPrompt();
    await settle(state, 2);

    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('Esc 로 닫으면 저장소에 남기지 않고 이 문서 동안만 띄우지 않는다', async () => {
    const state = createState('SOPHOMORE', 'JUNIOR');
    serve(state);

    const first = renderPrompt();
    fireEvent.keyDown(await screen.findByRole('dialog', { name: TITLE }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull());
    expect(window.localStorage.getItem(PROFILE_CHECK_SNOOZE_KEY)).toBeNull();

    first.unmount();
    renderPrompt();
    await settle(state, 2);

    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('확인에 성공했으면 상태가 아직 pending 으로 와도 같은 문서에서는 다시 띄우지 않는다', async () => {
    const state = createState('SOPHOMORE', 'JUNIOR');
    serve(state);
    server.use(
      http.put(`${BASE}/users/me/profile-check`, () => {
        // 상태는 그대로 둔다 — 재조회가 늦거나 실패해 캐시에 pending:true 가 남은 / ↔ /me 재마운트를 흉내 낸다.
        state.me = { ...state.me, grade: 'JUNIOR' };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();

    const first = renderPrompt();
    await user.click(await screen.findByRole('button', { name: '3학년이 맞아요' }));
    expect(await screen.findByText('정보를 확인했어요.')).toBeInTheDocument();
    await waitFor(() => expect(state.statusRequests).toBe(2));

    first.unmount();
    renderPrompt();
    await settle(state, 3);

    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it.each([
    ['다른 학기', (userId: number) => ({ userId, semesterYear: 2026, semesterTerm: 2, until: Date.now() + 60_000 })],
    ['만료됨', (userId: number) => ({ userId, semesterYear: 2026, semesterTerm: 1, until: Date.now() - 1 })],
  ])('%s 숨김은 무시하고 띄운다', async (_label, makeStored) => {
    const state = createState('SOPHOMORE', 'JUNIOR');
    window.localStorage.setItem(PROFILE_CHECK_SNOOZE_KEY, JSON.stringify(makeStored(state.me.id)));
    serve(state);

    renderPrompt();

    expect(await screen.findByRole('dialog', { name: TITLE })).toBeInTheDocument();
  });
});

describe('ProfileCheckPrompt — 정보 수정하기', () => {
  it('수정 다이얼로그를 위에 겹쳐 열고, 저장에 성공하면 둘 다 닫힌다', async () => {
    const state = createState('SOPHOMORE', 'JUNIOR');
    let patchedBody: unknown = null;
    serve(state);
    server.use(
      http.patch(`${BASE}/users/me`, async ({ request }) => {
        patchedBody = await request.json();
        // 서버는 학기 중 프로필 저장을 그 학기 확인으로 기록한다(스펙 §5.3).
        state.status = { pending: false };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();

    renderPrompt();
    await user.click(await screen.findByRole('button', { name: '정보 수정하기' }));

    const editDialog = await screen.findByRole('dialog', { name: '프로필 수정' });
    // 팝업은 닫히지 않고 아래에 그대로 있다(수정 다이얼로그가 위에 겹친다).
    expect(screen.getByText(TITLE)).toBeInTheDocument();

    await user.click(within(editDialog).getByRole('button', { name: '저장' }));

    expect(await screen.findByText('프로필을 수정했어요.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
    expect(screen.queryByRole('dialog', { name: '프로필 수정' })).toBeNull();
    expect(patchedBody).toMatchObject({ name: '홍길동', grade: 'SOPHOMORE', college: 'IT_ENGINEERING' });
  });

  it('수정 다이얼로그를 취소하면 팝업으로 돌아온다', async () => {
    const state = createState('SOPHOMORE', 'JUNIOR');
    serve(state);
    const user = userEvent.setup();

    renderPrompt();
    await user.click(await screen.findByRole('button', { name: '정보 수정하기' }));
    const editDialog = await screen.findByRole('dialog', { name: '프로필 수정' });
    await user.click(within(editDialog).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '프로필 수정' })).toBeNull());
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();
  });
});
