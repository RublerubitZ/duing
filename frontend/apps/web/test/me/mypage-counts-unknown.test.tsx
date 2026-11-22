import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@duing/api';
import { ApiClientProvider, applicationQueryKeys } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type {
  ApplicationStatus,
  ApplicationSummary,
  FavoriteClub,
  FederationInquirySummary,
  MyClubSummary,
  PageResponse,
  RecruitmentStatus,
  User,
} from '@duing/types';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import type { SectionId } from '@/app/me/_lib/sectionOrder';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/me',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  useSelectedLayoutSegment: () => null,
}));
// 화면 밖 관심(상단바·정보 확인 팝업·장식) — 숫자·섹션만 본다.
vi.mock('@/app/_components/HomeNav', () => ({ HomeNav: () => null }));
vi.mock('@/app/_components/ProfileCheckPrompt', () => ({ ProfileCheckPrompt: () => null }));
vi.mock('@/components/duing/Sparkle', () => ({ SparkleFull: () => null }));
// 설정 화면의 대화상자·세션 카드 — 머리글 숫자만 본다.
vi.mock('@/app/_components/ProfileEditDialog', () => ({ ProfileEditDialog: () => null }));
vi.mock('@/app/me/settings/_components/PasswordChangeDialog', () => ({ PasswordChangeDialog: () => null }));
vi.mock('@/app/me/settings/_components/PhoneChangeDialog', () => ({ PhoneChangeDialog: () => null }));
vi.mock('@/app/me/settings/_components/WithdrawAccountDialog', () => ({ WithdrawAccountDialog: () => null }));
vi.mock('@/app/me/settings/_components/SessionListCard', () => ({ SessionListCard: () => null }));

import { MyPage } from '@/app/me/_pages/MyPage';
import { SettingsPage } from '@/app/me/settings/_pages/SettingsPage';

/**
 * 받은 목록이 없으면 숫자를 모른다(#1579) — 조회 중뿐 아니라 첫 조회가 실패해도 0 이 아니라 "—"·배지 없음, 섹션은 빈 안내 대신
 * 실패 안내와 다시 시도. 실제 훅 + 실제 ApiClient + MSW(TanStack Query 는 모킹하지 않는다).
 */
const BASE = 'http://localhost:8080/api/v1';
const APPLICATIONS_URL = `${BASE}/users/me/applications`;
const MY_CLUBS_URL = `${BASE}/me/clubs`;
const FAVORITES_URL = `${BASE}/me/favorites`;
const INQUIRIES_URL = `${BASE}/me/federation-inquiries`;

const me: User = {
  id: 1,
  name: '홍길동',
  studentId: '20240001',
  phone: '010-1234-5678',
  grade: 'FRESHMAN',
  role: 'STUDENT',
  college: 'IT_ENGINEERING',
  major: '컴퓨터정보공학부',
};

const application = (id: number, status: ApplicationStatus, recruitmentStatus: RecruitmentStatus): ApplicationSummary => ({
  id,
  recruitmentId: id * 10,
  recruitmentTitle: '봄 신입 모집',
  recruitmentStatus,
  clubId: id,
  clubName: `지원동아리${id}`,
  category: 'CREATION',
  logoUrl: null,
  status,
  interview: null,
  submittedAt: '2026-05-26T10:00:00Z',
});
// 진행 중 2건(심사 중·모집 중), 지난 지원 1건(합격).
const applications = [application(1, 'SUBMITTED', 'OPEN'), application(2, 'SUBMITTED', 'OPEN'), application(3, 'ACCEPTED', 'CLOSED')];

const club = (clubId: number): MyClubSummary => ({
  clubId,
  clubName: `가입동아리${clubId}`,
  logoUrl: null,
  status: 'ACTIVE',
  myRole: 'MEMBER',
  activeRecruitmentCount: 0,
  joinedAt: '2026-05-20T10:00:00Z',
});

const favorite = (clubId: number): FavoriteClub => ({
  clubId,
  name: `찜동아리${clubId}`,
  logoUrl: null,
  category: 'ACADEMIC',
  division: null,
  favoritedAt: '2026-05-17T01:23:45',
  openRecruitmentCount: 0,
});

/** 찜 첫 페이지(20개까지) — 전체 수는 따로 준다(마이페이지는 첫 페이지만 받는다). */
function favoritePage(totalElements: number): PageResponse<FavoriteClub> {
  return {
    content: Array.from({ length: Math.min(totalElements, 20) }, (_, index) => favorite(index + 1)),
    page: 0,
    size: 20,
    totalElements,
    totalPages: Math.ceil(totalElements / 20),
    hasNext: totalElements > 20,
  };
}

const inquiry: FederationInquirySummary = {
  id: 1,
  title: '동아리방 문의',
  status: 'RECEIVED',
  createdAt: '2026-05-20T10:00:00Z',
  answeredAt: null,
};
const inquiryPage: PageResponse<FederationInquirySummary> = {
  content: [inquiry],
  page: 0,
  size: 3,
  totalElements: 1,
  totalPages: 1,
  hasNext: false,
};

const ok = <T,>(data: T) => HttpResponse.json({ ok: true, data, message: null });
const serverError = () =>
  HttpResponse.json({ ok: false, data: null, message: '일시적인 오류가 발생했습니다.' }, { status: 500 });

// 기본은 모두 성공 — 테스트는 실패시킬 목록만 server.use 로 덮는다(resetHandlers 가 이 기본으로 되돌린다).
const server = setupServer(
  http.get(`${BASE}/users/me`, () => ok(me)),
  http.get(`${BASE}/users/me/profile-check`, () => ok({ pending: false })),
  http.get(APPLICATIONS_URL, () => ok(applications)),
  http.get(MY_CLUBS_URL, () => ok([club(1), club(2)])),
  http.get(FAVORITES_URL, () => ok(favoritePage(1))),
  http.get(INQUIRIES_URL, () => ok(inquiryPage)),
);
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  act(() => useAuthStore.setState({ status: 'authenticated' }));
});
afterEach(() => {
  server.resetHandlers();
  act(() => useAuthStore.setState(useAuthStore.getInitialState(), true));
});
afterAll(() => server.close());

function renderWithClient(ui: ReactElement): QueryClient {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <ToastProvider>{ui}</ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

/** 섹션 본문 — 제목이 탭 라벨과 겹치고(지난 지원·가입한 동아리…) 지원 실패면 '다시 시도'가 둘이라 섹션 안으로 좁혀 찾는다. */
function section(id: SectionId): HTMLElement {
  const element = document.getElementById(`sec-${id}`);
  if (element === null) throw new Error(`섹션 sec-${id} 이 없다`);
  return element;
}

/** 탭 버튼 — 모바일 짧은 라벨과 PC 라벨이 함께 그려져(CSS 로만 가림) 이름이 '지원지원 현황2' 꼴이다. 라벨엔 숫자가 없어 숫자 유무로 배지를 본다. */
function tab(label: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(label) });
}

type HeaderLabel = '지원 중' | '가입' | '찜';
const HEADER_LABELS: HeaderLabel[] = ['지원 중', '가입', '찜'];

/** 머리글의 숫자 — 라벨 바로 위 형제가 숫자다(header-counts-parity 와 같은 방식). */
function headerCount(label: HeaderLabel): string {
  const header = screen.getByRole('heading', { level: 1 }).closest('section');
  if (header === null) throw new Error('머리글이 없다');
  return within(header).getByText(label, { exact: true }).previousElementSibling?.textContent ?? '';
}

/** 화면 첫 섹션 — 진행 중 지원이 0건으로 확정될 때만 가입한 동아리가 먼저 온다. */
function firstSectionId(): string | null {
  return document.querySelector('[data-section]')?.getAttribute('data-section') ?? null;
}

type SectionFailureCase = {
  label: string;
  url: string;
  sectionId: SectionId;
  title: string;
  failedMessage: string;
  empty: RegExp;
  headerLabel: HeaderLabel | null;
};

const sectionFailureCases: SectionFailureCase[] = [
  {
    label: '가입한 동아리',
    url: MY_CLUBS_URL,
    sectionId: 'joined',
    title: '가입한 동아리',
    failedMessage: '가입한 동아리를 불러오지 못했어요.',
    empty: /아직 가입한 동아리가 없어요/,
    headerLabel: '가입',
  },
  {
    label: '찜한 동아리',
    url: FAVORITES_URL,
    sectionId: 'saved',
    title: '찜한 동아리',
    failedMessage: '찜한 동아리를 불러오지 못했어요.',
    empty: /아직 찜한 동아리가 없어요/,
    headerLabel: '찜',
  },
  {
    label: '내 문의',
    url: INQUIRIES_URL,
    sectionId: 'inquiries',
    title: '내 문의',
    failedMessage: '내 문의를 불러오지 못했어요.',
    empty: /아직 문의 내역이 없어요/,
    headerLabel: null,
  },
];

describe('마이페이지 — 받은 목록이 없으면 숫자를 모른다', () => {
  it('지원 목록 첫 조회가 실패하면 지원·지난 지원 숫자를 숨기고, 빈 안내 대신 실패 안내와 다시 시도, 순서는 지원 먼저', async () => {
    server.use(http.get(APPLICATIONS_URL, () => serverError()));
    renderWithClient(<MyPage />);

    expect(await within(section('apply')).findByText('진행 중인 지원을 불러오지 못했어요.')).toBeInTheDocument();
    expect(within(section('archived')).getByText('지난 지원을 불러오지 못했어요.')).toBeInTheDocument();
    expect(within(section('apply')).getByRole('heading', { level: 2, name: '진행 중인 지원' })).toBeInTheDocument();
    expect(within(section('archived')).getByRole('heading', { level: 2, name: '지난 지원' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '다시 시도' })).toHaveLength(2);
    expect(screen.queryByText(/진행 중인 지원이 없어요/)).not.toBeInTheDocument();
    expect(screen.queryByText(/지난 지원 내역이 없어요/)).not.toBeInTheDocument();
    expect(tab('지원 현황').textContent).not.toMatch(/\d/);
    expect(tab('지난 지원').textContent).not.toMatch(/\d/);
    expect(headerCount('지원 중')).toBe('—');
    // 실패한 목록만 모른다 — 가입은 받은 대로 센다.
    await waitFor(() => expect(headerCount('가입')).toBe('2'));
    expect(firstSectionId()).toBe('apply');
  });

  it('다시 시도하면 받는 동안 스켈레톤·숫자 없음, 받으면 숫자와 목록을 그린다', async () => {
    server.use(http.get(APPLICATIONS_URL, () => serverError()));
    renderWithClient(<MyPage />);
    const retryButton = await within(section('apply')).findByRole('button', { name: '다시 시도' });
    let releaseApplications: () => void = () => undefined;
    const applicationsGate = new Promise<void>((resolve) => {
      releaseApplications = resolve;
    });
    server.use(
      http.get(APPLICATIONS_URL, async () => {
        await applicationsGate;
        return ok(applications);
      }),
    );

    await userEvent.click(retryButton);

    // 데이터 없이 다시 받으면 조회 중으로 돌아간다 — 실패 안내 대신 스켈레톤, 숫자는 여전히 모른다.
    expect(await screen.findByRole('status', { name: '진행 중인 지원 불러오는 중' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '지난 지원 불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
    expect(headerCount('지원 중')).toBe('—');

    releaseApplications();

    await waitFor(() => expect(headerCount('지원 중')).toBe('2'));
    expect(tab('지원 현황').textContent).toMatch(/2$/);
    expect(tab('지난 지원').textContent).toMatch(/1$/);
    expect(within(section('apply')).getByRole('heading', { level: 2, name: '진행 중인 지원 · 2' })).toBeInTheDocument();
  });

  it.each(sectionFailureCases)(
    '$label 첫 조회가 실패하면 그 숫자를 숨기고 실패 안내와 다시 시도를 그리고, 다시 시도는 그 목록을 다시 부른다',
    async ({ url, sectionId, title, failedMessage, empty, headerLabel }) => {
      let failedListRequests = 0;
      server.use(
        http.get(url, () => {
          failedListRequests += 1;
          return serverError();
        }),
      );
      renderWithClient(<MyPage />);

      expect(await within(section(sectionId)).findByText(failedMessage)).toBeInTheDocument();
      expect(within(section(sectionId)).getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
      expect(screen.queryByText(empty)).not.toBeInTheDocument();
      expect(tab(title).textContent).not.toMatch(/\d/);
      if (headerLabel !== null) expect(headerCount(headerLabel)).toBe('—');
      // 실패한 목록만 모른다 — 지원은 받은 대로 센다.
      await waitFor(() => expect(headerCount('지원 중')).toBe('2'));

      await userEvent.click(within(section(sectionId)).getByRole('button', { name: '다시 시도' }));

      // 다른 목록의 refetch 에 잘못 이으면 이 목록의 요청은 1 에 머문다.
      await waitFor(() => expect(failedListRequests).toBe(2));
    },
  );

  it('네 목록이 모두 실패해도 숫자는 모두 숨기고, 섹션마다 다시 시도를 두고, 순서는 지원 먼저다', async () => {
    server.use(
      http.get(APPLICATIONS_URL, () => serverError()),
      http.get(MY_CLUBS_URL, () => serverError()),
      http.get(FAVORITES_URL, () => serverError()),
      http.get(INQUIRIES_URL, () => serverError()),
    );
    renderWithClient(<MyPage />);

    await waitFor(() => expect(screen.getAllByRole('button', { name: '다시 시도' })).toHaveLength(5));
    expect(HEADER_LABELS.map(headerCount)).toEqual(['—', '—', '—']);
    for (const label of ['지원 현황', '가입한 동아리', '찜한 동아리', '내 문의', '지난 지원']) {
      expect(tab(label).textContent).not.toMatch(/\d/);
    }
    expect(firstSectionId()).toBe('apply');
  });

  it('다시 시도도 실패하면 실패 안내로 돌아온다 — 스켈레톤에 멈추지 않는다', async () => {
    let myClubsRequests = 0;
    server.use(
      http.get(MY_CLUBS_URL, () => {
        myClubsRequests += 1;
        return serverError();
      }),
    );
    renderWithClient(<MyPage />);

    await userEvent.click(await within(section('joined')).findByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(myClubsRequests).toBe(2));
    expect(await within(section('joined')).findByText('가입한 동아리를 불러오지 못했어요.')).toBeInTheDocument();
    expect(within(section('joined')).queryByRole('status')).not.toBeInTheDocument();
  });

  // 회귀 가드 — 지금 코드에서도 통과한다.
  it('옛 목록을 든 채 다시 받다 실패하면 마지막 숫자와 목록을 그대로 둔다(숫자는 #1549 와 같은 기준, 목록은 남긴다)', async () => {
    const queryClient = renderWithClient(<MyPage />);
    await waitFor(() => expect(headerCount('지원 중')).toBe('2'));
    server.use(http.get(APPLICATIONS_URL, () => serverError()));

    await act(() => queryClient.refetchQueries({ queryKey: applicationQueryKeys.myList('ALL') }));

    expect(queryClient.getQueryState(applicationQueryKeys.myList('ALL'))?.status).toBe('error');
    expect(headerCount('지원 중')).toBe('2');
    expect(tab('지원 현황').textContent).toMatch(/2$/);
    expect(within(section('apply')).getByRole('heading', { level: 2, name: '진행 중인 지원 · 2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
  });
});

describe('마이페이지·설정 — 찜은 전체 수로 센다(#1580)', () => {
  it('마이페이지: 첫 페이지 20개만 그리고 숫자는 전체 25, 나머지는 전체 보기로 /me/favorites', async () => {
    server.use(http.get(FAVORITES_URL, () => ok(favoritePage(25))));
    renderWithClient(<MyPage />);

    await waitFor(() => expect(headerCount('찜')).toBe('25'));
    expect(tab('찜한 동아리').textContent).toMatch(/25$/);
    const savedSection = section('saved');
    expect(within(savedSection).getByRole('heading', { level: 2, name: '찜한 동아리 · 25' })).toBeInTheDocument();
    // 카드는 동아리 상세 링크다(빈 안내의 탐색 링크는 /clubs, 전체 보기는 /me/favorites 라 세지 않는다).
    expect(savedSection.querySelectorAll('a[href^="/clubs/"]')).toHaveLength(20);
    expect(within(savedSection).getByRole('link', { name: '찜한 동아리 전체 보기' })).toHaveAttribute('href', '/me/favorites');
    // 문의 섹션의 '전체 보기'와 보이는 글자는 같아도 접근 이름이 다르다 — 화면 전체에서 각각 하나로 찾힌다.
    expect(screen.getByRole('link', { name: '찜한 동아리 전체 보기' })).toHaveAttribute('href', '/me/favorites');
    expect(screen.getByRole('link', { name: '내 문의 전체 보기' })).toHaveAttribute('href', '/me/inquiries');
  });

  // 회귀 가드 — 지금도 링크가 없다.
  it('마이페이지: 받은 것이 전부(20)면 전체 보기를 두지 않는다', async () => {
    server.use(http.get(FAVORITES_URL, () => ok(favoritePage(20))));
    renderWithClient(<MyPage />);

    await waitFor(() => expect(headerCount('찜')).toBe('20'));
    expect(within(section('saved')).queryByRole('link', { name: '찜한 동아리 전체 보기' })).not.toBeInTheDocument();
  });

  it('설정: 머리글 찜도 전체 수 25 다', async () => {
    server.use(http.get(FAVORITES_URL, () => ok(favoritePage(25))));
    renderWithClient(<SettingsPage />);

    await waitFor(() => expect(headerCount('찜')).toBe('25'));
  });
});

type SettingsHeaderCase = { label: string; url: string; headerLabel: HeaderLabel };

const settingsHeaderCases: SettingsHeaderCase[] = [
  { label: '지원', url: APPLICATIONS_URL, headerLabel: '지원 중' },
  { label: '가입', url: MY_CLUBS_URL, headerLabel: '가입' },
  { label: '찜', url: FAVORITES_URL, headerLabel: '찜' },
];

// 기본 응답의 머리글 숫자 — 진행 중 지원 2, 가입 2, 찜 1.
const settledHeaderCounts: Record<HeaderLabel, string> = { '지원 중': '2', 가입: '2', 찜: '1' };

describe('설정 머리글 — 받은 목록이 없으면 숫자를 모른다', () => {
  it.each(settingsHeaderCases)(
    '$label 목록 첫 조회가 실패하면 머리글 $headerLabel 은 "—", 나머지 둘은 받은 숫자',
    async ({ url, headerLabel }) => {
      server.use(http.get(url, () => serverError()));
      const queryClient = renderWithClient(<SettingsPage />);
      const otherLabels = HEADER_LABELS.filter((label) => label !== headerLabel);

      for (const otherLabel of otherLabels) {
        await waitFor(() => expect(headerCount(otherLabel)).toBe(settledHeaderCounts[otherLabel]));
      }
      // 조회 중과 실패는 화면에서 같은 "—" 다 — 실패가 앉을 때까지(진행 중인 조회 0) 기다린 뒤 본다.
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));
      expect(headerCount(headerLabel)).toBe('—');
    },
  );
});
