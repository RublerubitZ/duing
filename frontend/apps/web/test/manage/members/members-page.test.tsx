import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { ClubMember, ClubMemberRole } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

// useMeQuery 는 인증 상태에서만 실행된다 — 로그인 상태로 고정한다.
// selectIsAuthenticated 등 나머지 export 는 실제 모듈을 그대로 쓴다(술어 계약이 어긋나지 않게).
vi.mock('@duing/stores', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/stores')>()),
  useAuthStore: (selector: (state: { status: string }) => unknown) =>
    selector({ status: 'authenticated' }),
}));

import ClubMembersPage from '@/app/manage/clubs/[clubId]/members/page';

const CLUB_ID = 7;
const VIEWER_ID = 999;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

const json = (data: unknown) => HttpResponse.json({ ok: true, message: null, data });

function member(overrides: Partial<ClubMember> = {}): ClubMember {
  return {
    memberId: 1,
    userId: 1,
    name: '홍길동',
    studentId: '20200001',
    role: 'MEMBER',
    joinedAt: '2024-01-10',
    major: '컴퓨터공학과',
    grade: 'JUNIOR',
    phoneMasked: null,
    generation: 3,
    feeStatus: 'NONE',
    ...overrides,
  };
}

const membersFixture: ClubMember[] = [
  member({ memberId: 1, userId: 11, name: '홍길동', role: 'LEADER', generation: 3, feeStatus: 'NONE', major: '컴퓨터공학과' }),
  member({ memberId: 2, userId: 12, name: '김철수', role: 'OFFICER', generation: 3, feeStatus: 'PAID', major: '경영학과' }),
  member({ memberId: 3, userId: 13, name: '이영희', role: 'MEMBER', generation: 2, feeStatus: 'UNPAID', major: '전자공학과' }),
];

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

// jsdom 은 matchMedia 가 없다 — MemberDetailPanel 의 usePanelMode 가 매 렌더 호출하므로
// 항상 매치(데스크탑 inline)로 스텁해 패널을 인라인으로 렌더한다.
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

function setupHandlers({
  useGeneration,
  myRole = 'LEADER',
}: {
  useGeneration: boolean;
  myRole?: ClubMemberRole;
}) {
  server.use(
    http.get('*/users/me', () =>
      HttpResponse.json({ ok: true, message: null, data: { id: VIEWER_ID, name: '관리자' } }),
    ),
    http.get('*/leader/clubs/me/managed', () =>
      HttpResponse.json({
        ok: true,
        message: null,
        data: [
          {
            clubId: CLUB_ID,
            clubName: '두잉',
            logoUrl: null,
            myRole,
            centralClub: false,
            activeRecruitmentCount: 0,
          },
        ],
      }),
    ),
    http.get(`*/clubs/${CLUB_ID}`, () =>
      HttpResponse.json({ ok: true, message: null, data: { useGeneration } }),
    ),
    http.get(`*/clubs/${CLUB_ID}/members`, () =>
      HttpResponse.json({ ok: true, message: null, data: membersFixture }),
    ),
  );
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // React 19 use(thenable) 가 동기적으로 값을 꺼내가도록 status/value 를 미리 태깅한다
  // (recruitment 상세/목록 페이지 테스트와 동일 패턴).
  const paramsValue = { clubId: String(CLUB_ID) };
  const params = Object.assign(Promise.resolve(paramsValue), {
    status: 'fulfilled' as const,
    value: paramsValue,
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ClubMembersPage params={params} />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe('ClubMembersPage — 기수 표시 전환', () => {
  it('useGeneration=true 면 기수 컬럼·기수 필터·최신 기수 KPI 를 렌더한다', async () => {
    setupHandlers({ useGeneration: true });
    renderPage();

    expect(await screen.findByRole('columnheader', { name: '기수' })).toBeInTheDocument();
    expect(screen.getByLabelText('기수')).toBeInTheDocument();
    expect(screen.getByText('최신 기수')).toBeInTheDocument();
  });

  it('useGeneration=false 면 기수 컬럼이 없고 4번째 KPI 는 최근 가입이다', async () => {
    setupHandlers({ useGeneration: false });
    renderPage();

    // 로드 완료 대기(회원 이름은 표·카드로 2회 등장).
    expect((await screen.findAllByText('홍길동')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('columnheader', { name: '기수' })).not.toBeInTheDocument();
    expect(screen.queryByText('최신 기수')).not.toBeInTheDocument();
    // 4번째 KPI 라벨과 "최근 가입" 필터 칩이 함께 등장한다.
    expect(screen.getAllByText('최근 가입').length).toBeGreaterThanOrEqual(2);
  });
});

describe('ClubMembersPage — 검색·결과 수', () => {
  it('검색어를 입력하면 결과 수가 갱신된다', async () => {
    setupHandlers({ useGeneration: false });
    renderPage();

    expect(await screen.findByText('결과 3명')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('회원 검색'), '홍길동');

    expect(await screen.findByText('결과 1명')).toBeInTheDocument();
  });
});

describe('ClubMembersPage — 상세 열기', () => {
  it('상세 버튼을 누르면 회원 상세 패널이 열린다', async () => {
    setupHandlers({ useGeneration: true });
    renderPage();

    // 상세 버튼은 데스크탑 표·모바일 카드에 하나씩(뷰포트별로 하나만 보인다) — 표 쪽을 누른다.
    await userEvent.click((await screen.findAllByRole('button', { name: '이영희 상세' }))[0]!);

    expect(await screen.findByRole('complementary', { name: '이영희 상세' })).toBeInTheDocument();
    expect(screen.getByText('기본 정보')).toBeInTheDocument();
  });
});

describe('ClubMembersPage — 권한 게이트', () => {
  it('OFFICER 뷰어는 기수 사용 시 선택할 수 있고 벌크 툴바엔 기수 변경만 노출된다', async () => {
    setupHandlers({ useGeneration: true, myRole: 'OFFICER' });
    renderPage();

    const [selectYoung] = await screen.findAllByRole('checkbox', { name: '이영희 선택' });
    await userEvent.click(selectYoung!);

    const toolbar = await screen.findByRole('region', { name: '회원 일괄 작업' });
    expect(within(toolbar).getByRole('button', { name: /기수 변경/ })).toBeInTheDocument();
    // 승급·강등·탈퇴는 회장 전용 — OFFICER 툴바에는 없다.
    expect(within(toolbar).queryByRole('button', { name: /임원 승급/ })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole('button', { name: /부원 강등/ })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole('button', { name: '탈퇴' })).not.toBeInTheDocument();
    // 명단 다운로드는 기존대로 운영진 공통.
    expect(screen.getByRole('button', { name: '멤버 명단 다운로드' })).toBeInTheDocument();
  });

  it('LEADER 뷰어는 기수 미사용이어도 선택·벌크 툴바(승급·강등·탈퇴)를 유지한다', async () => {
    setupHandlers({ useGeneration: false, myRole: 'LEADER' });
    renderPage();

    const [selectYoung] = await screen.findAllByRole('checkbox', { name: '이영희 선택' });
    await userEvent.click(selectYoung!);

    const toolbar = await screen.findByRole('region', { name: '회원 일괄 작업' });
    expect(within(toolbar).getByRole('button', { name: /임원 승급/ })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: /부원 강등/ })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: '탈퇴' })).toBeInTheDocument();
    expect(within(toolbar).queryByRole('button', { name: /기수 변경/ })).not.toBeInTheDocument();
  });

  it('OFFICER 뷰어 + 기수 미사용이면 선택 체크박스와 일괄 툴바가 없다 — 실행 가능한 벌크 액션이 없다', async () => {
    setupHandlers({ useGeneration: false, myRole: 'OFFICER' });
    renderPage();

    // 로드 완료 대기(회원 이름은 표·카드로 2회 등장).
    expect((await screen.findAllByText('홍길동')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('checkbox', { name: '전체 선택' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '회원 일괄 작업' })).not.toBeInTheDocument();
  });
});

describe('ClubMembersPage — 상세 패널 최신화', () => {
  it('패널에서 역할 변경이 성공하면 패널 표시가 새 역할로 갱신된다', async () => {
    let youngRole: ClubMemberRole = 'MEMBER';
    const membersOf = () =>
      membersFixture.map((member) =>
        member.memberId === 3 ? { ...member, role: youngRole } : member,
      );
    server.use(
      http.get('*/users/me', () => json({ id: VIEWER_ID, name: '관리자' })),
      http.get('*/leader/clubs/me/managed', () =>
        json([
          {
            clubId: CLUB_ID,
            clubName: '두잉',
            logoUrl: null,
            myRole: 'LEADER',
            centralClub: false,
            activeRecruitmentCount: 0,
          },
        ]),
      ),
      http.get(`*/clubs/${CLUB_ID}`, () => json({ useGeneration: true })),
      http.get(`*/clubs/${CLUB_ID}/members`, () => json(membersOf())),
      http.patch(`*/clubs/${CLUB_ID}/members/3/role`, async ({ request }) => {
        const body = (await request.json()) as { role: ClubMemberRole };
        youngRole = body.role;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();

    // 상세 버튼은 데스크탑 표·모바일 카드에 하나씩(뷰포트별로 하나만 보인다) — 표 쪽을 누른다.
    await userEvent.click((await screen.findAllByRole('button', { name: '이영희 상세' }))[0]!);
    // MEMBER 이영희 → 승급 버튼 노출
    await userEvent.click(await screen.findByRole('button', { name: '임원으로 승급' }));
    await userEvent.click(await screen.findByRole('button', { name: '승급' }));

    // refetch 후 패널이 OFFICER 로 파생 → 강등 버튼으로 바뀌고 승급 버튼은 사라진다(스테일 스냅샷 아님).
    expect(await screen.findByRole('button', { name: '부원으로 강등' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '임원으로 승급' })).not.toBeInTheDocument();
  });
});

describe('ClubMembersPage — 선택 정리', () => {
  it('필터를 바꾸면 화면에서 사라진 회원 선택이 해제된다', async () => {
    setupHandlers({ useGeneration: true, myRole: 'LEADER' });
    renderPage();

    // MEMBER 이영희 를 선택 → 일괄 툴바 노출
    const [selectYoung] = await screen.findAllByRole('checkbox', { name: '이영희 선택' });
    await userEvent.click(selectYoung!);
    expect(await screen.findByRole('region', { name: '회원 일괄 작업' })).toBeInTheDocument();

    // 역할 필터를 회장으로 좁히면 이영희가 사라지고 선택이 정리되어 툴바가 닫힌다.
    await userEvent.click(screen.getByRole('button', { name: '회장' }));

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: '회원 일괄 작업' })).not.toBeInTheDocument(),
    );
  });

  it('검색어로 가려진 선택은 유지되고, 검색어를 지우면 다시 대상에 든다', async () => {
    setupHandlers({ useGeneration: true, myRole: 'LEADER' });
    renderPage();

    const [selectYoung] = await screen.findAllByRole('checkbox', { name: '이영희 선택' });
    await userEvent.click(selectYoung!);
    expect(await screen.findByText(/선택/)).toBeInTheDocument();

    // 이영희가 검색 결과에서 빠지면 툴바 대상에서 빠질 뿐(선택 자체는 보존).
    await userEvent.type(screen.getByRole('searchbox', { name: '회원 검색' }), '김철수');
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: '회원 일괄 작업' })).not.toBeInTheDocument(),
    );

    // 검색어를 지우면 선택이 그대로 살아 있어 툴바가 다시 열린다(타이핑에 선택이 소실되지 않는다).
    await userEvent.clear(screen.getByRole('searchbox', { name: '회원 검색' }));
    expect(await screen.findByRole('region', { name: '회원 일괄 작업' })).toBeInTheDocument();
  });

  it('선택한 기수의 회원이 모두 사라지면 기수 필터가 해제되어 목록이 다시 보인다', async () => {
    // 이영희만 2기 — 기수를 3으로 바꾸면 2기 옵션 자체가 사라진다.
    let youngGeneration: number | null = 2;
    const membersOf = () =>
      membersFixture.map((each) =>
        each.memberId === 3 ? { ...each, generation: youngGeneration } : each,
      );
    server.use(
      http.get('*/users/me', () => json({ id: VIEWER_ID, name: '관리자' })),
      http.get('*/leader/clubs/me/managed', () =>
        json([
          {
            clubId: CLUB_ID,
            clubName: '두잉',
            logoUrl: null,
            myRole: 'LEADER',
            centralClub: false,
            activeRecruitmentCount: 0,
          },
        ]),
      ),
      http.get(`*/clubs/${CLUB_ID}`, () => json({ useGeneration: true })),
      http.get(`*/clubs/${CLUB_ID}/members`, () => json(membersOf())),
      http.patch(`*/clubs/${CLUB_ID}/members/3/generation`, async ({ request }) => {
        const body = (await request.json()) as { generation: number | null };
        youngGeneration = body.generation;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();

    // 2기(이영희 1명)로 좁힌 뒤, 상세 패널에서 이영희를 3기로 옮긴다.
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: '기수' }), '2');
    await waitFor(() => expect(screen.getByText('결과 1명')).toBeInTheDocument());

    await userEvent.click((await screen.findAllByRole('button', { name: '이영희 상세' }))[0]!);
    const generationInput = await screen.findByRole('spinbutton', { name: '기수 수정' });
    await userEvent.clear(generationInput);
    await userEvent.type(generationInput, '3');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    // 2기 옵션이 사라진 뒤에도 필터가 남으면 "결과 0명" 으로 굳는다 — 해제되어 전원이 다시 보여야 한다.
    await waitFor(() => expect(screen.getByText('결과 3명')).toBeInTheDocument());
    expect(screen.queryByText('조건에 맞는 회원이 없어요')).not.toBeInTheDocument();
  });
});

describe('ClubMembersPage — 필터 칩 변경과 검색어의 분리', () => {
  it('검색어로 가려진 선택은 필터 칩을 눌러도 유지된다', async () => {
    setupHandlers({ useGeneration: true, myRole: 'LEADER' });
    renderPage();

    // MEMBER 이영희 선택 → 검색어로 가린다.
    const [selectYoung] = await screen.findAllByRole('checkbox', { name: '이영희 선택' });
    await userEvent.click(selectYoung!);
    await userEvent.type(screen.getByRole('searchbox', { name: '회원 검색' }), '김철수');
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: '회원 일괄 작업' })).not.toBeInTheDocument(),
    );

    // 이영희가 여전히 부합하는 필터(부원)를 눌러도 선택이 사라지면 안 된다.
    await userEvent.click(screen.getByRole('button', { name: '부원' }));
    await userEvent.clear(screen.getByRole('searchbox', { name: '회원 검색' }));

    expect(await screen.findByRole('region', { name: '회원 일괄 작업' })).toBeInTheDocument();
  });

  it('필터에서 벗어난 선택은 여전히 정리된다', async () => {
    setupHandlers({ useGeneration: true, myRole: 'LEADER' });
    renderPage();

    const [selectYoung] = await screen.findAllByRole('checkbox', { name: '이영희 선택' });
    await userEvent.click(selectYoung!);
    // 이영희(MEMBER)는 임원 필터에 걸리지 않는다 → 선택 해제.
    await userEvent.click(screen.getByRole('button', { name: '임원' }));
    await userEvent.click(screen.getByRole('button', { name: '전체' }));

    expect(screen.queryByRole('region', { name: '회원 일괄 작업' })).not.toBeInTheDocument();
  });
});

// 가입 링크 발급은 모집 관리 카드의 다이얼로그로 완결된다(스펙 §5.1) — 안내만 하던 회원 초대
// 진입점은 제거했고, 승인 업무인 가입 요청 진입은 클럽 단위라 여기 그대로 있다.
describe('ClubMembersPage — 회원 초대 진입점', () => {
  it('안내 전용 회원 초대 버튼은 두지 않는다', async () => {
    setupHandlers({ useGeneration: true });
    renderPage();

    await screen.findByRole('link', { name: /가입 요청/ });
    expect(screen.queryByRole('button', { name: '회원 초대' })).not.toBeInTheDocument();
  });

  it('가입 요청 관리 진입 링크는 그대로 유지한다', async () => {
    setupHandlers({ useGeneration: true });
    renderPage();

    expect(await screen.findByRole('link', { name: /가입 요청/ })).toHaveAttribute(
      'href',
      `/manage/clubs/${CLUB_ID}/members/requests`,
    );
  });
});
