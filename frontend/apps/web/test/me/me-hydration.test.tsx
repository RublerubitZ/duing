import { act, type ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { User } from '@duing/types';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';

// 서버에는 me 조회가 없어 늘 비어 있다. 브라우저는 부팅 세션 복원(providers 모듈 스코프 선요청)이
// 본문 하이드레이션보다 먼저 끝나면 캐시에 me 가 이미 있다 — 그 순간을 이 값으로 흉내 낸다.
const meState: { current: User | undefined } = vi.hoisted(() => ({ current: undefined }));
// 목록 캐시 — 지금은 하이드레이션 전에 차는 경로가 없지만, 셸 쪽 선요청이 생기면 생긴다. 그 순간을 흉내 내 하이드레이션 게이트를 고정한다.
const applicationsState: { data: unknown[]; isPending: boolean } = vi.hoisted(() => ({ data: [], isPending: false }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/me',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  useSelectedLayoutSegment: () => null,
}));
vi.mock('@duing/hooks', () => ({
  useMeQuery: () => ({ data: meState.current }),
  useLogout: () => vi.fn(),
  useMyApplicationsQuery: () => ({ data: applicationsState.data, isPending: applicationsState.isPending }),
  useManagedClubsQuery: () => ({ data: [] }),
  useFavoriteListQuery: () => ({ data: { content: [] } }),
  useProfileCheckQuery: () => ({ data: { pending: false }, isFetching: false, isError: false }),
  useMyClubsQuery: () => ({ data: [] }),
  useMyFederationInquiriesQuery: () => ({ data: { content: [], totalElements: 0 } }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);
vi.mock('@/app/_components/HomeNav', () => ({ HomeNav: () => null }));
vi.mock('@/app/_components/ProfileCheckPrompt', () => ({ ProfileCheckPrompt: () => null }));
vi.mock('@/app/_components/ProfileEditDialog', () => ({ ProfileEditDialog: () => null }));
vi.mock('@/components/duing/Sparkle', () => ({ SparkleFull: () => null }));
vi.mock('@/app/me/settings/_components/PasswordChangeDialog', () => ({ PasswordChangeDialog: () => null }));
vi.mock('@/app/me/settings/_components/PhoneChangeDialog', () => ({ PhoneChangeDialog: () => null }));
vi.mock('@/app/me/settings/_components/WithdrawAccountDialog', () => ({ WithdrawAccountDialog: () => null }));
vi.mock('@/app/me/settings/_components/SessionListCard', () => ({ SessionListCard: () => null }));

import { HomeNavAdminLink } from '@/app/_components/HomeNavAdminLink';
import { MyPage } from '@/app/me/_pages/MyPage';
import { SettingsPage } from '@/app/me/settings/_pages/SettingsPage';

// RTL 을 거치지 않고 hydrateRoot 를 직접 쓰므로 act 환경 플래그를 직접 켠다(없으면 act 경고가 stderr 로 샌다).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const student: User = {
  id: 1,
  name: '홍길동',
  studentId: '20240001',
  phone: '010-1234-5678',
  grade: 'FRESHMAN',
  role: 'STUDENT',
  college: 'IT_ENGINEERING',
  major: '컴퓨터정보공학부',
};

// jsdom 의 window·document 를 지워야 typeof window 분기가 서버 렌더에서 브라우저 쪽을 타지 않는다.
function renderAsServer(tree: () => ReactElement): string {
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('document', undefined);
  try {
    return renderToString(tree());
  } finally {
    vi.unstubAllGlobals();
  }
}

async function hydrateAfterSessionRestore(tree: () => ReactElement, user: User, beforeHydrate?: () => void) {
  meState.current = undefined;
  const serverHtml = renderAsServer(tree);
  const container = document.createElement('div');
  container.innerHTML = serverHtml;
  document.body.appendChild(container);
  meState.current = user;
  beforeHydrate?.();
  // 텍스트 불일치는 onRecoverableError 로, 속성 불일치는 console.error 경고로만 온다(React 19).
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const recoverableErrors: unknown[] = [];
  const root = await act(async () =>
    hydrateRoot(container, tree(), { onRecoverableError: (error) => recoverableErrors.push(error) }),
  );
  const hydratedHtml = container.innerHTML;
  const hydrationWarnings = consoleErrorSpy.mock.calls.filter((args) => /hydrat/i.test(args.map(String).join(' ')));
  act(() => root.unmount());
  consoleErrorSpy.mockRestore();
  container.remove();
  meState.current = undefined;
  return { serverHtml, hydratedHtml, recoverableErrors, hydrationWarnings };
}

describe('me 를 그리는 화면 — 부팅 세션 복원이 본문 하이드레이션보다 먼저 끝나도 불일치가 없다', () => {
  // 하이드레이션이 던져도 다음 테스트로 목록 상태가 새지 않게 여기서 되돌린다.
  afterEach(() => {
    applicationsState.data = [];
    applicationsState.isPending = false;
  });

  it('설정: 머리글·프로필 행을 서버와 같이 "—" 로 하이드레이션하고, 그 뒤 이름을 채운다', async () => {
    const result = await hydrateAfterSessionRestore(
      () => (
        <ToastProvider>
          <SettingsPage />
        </ToastProvider>
      ),
      student,
    );

    expect(result.serverHtml).toContain('안녕하세요, <!-- -->—<!-- -->님');
    expect(result.recoverableErrors).toEqual([]);
    expect(result.hydrationWarnings).toEqual([]);
    expect(result.hydratedHtml).toContain('안녕하세요, <!-- -->홍길동<!-- -->님');
    expect(result.hydratedHtml).toContain('컴퓨터정보공학부');
  });

  it('마이페이지: 머리글을 서버와 같이 하이드레이션하고, 그 뒤 이름·학번을 채운다', async () => {
    const result = await hydrateAfterSessionRestore(() => <MyPage />, student);

    expect(result.serverHtml).toContain('안녕하세요, <!-- -->—<!-- -->님');
    // 정적 HTML 에 거짓 빈 상태("…없어요"·"· 0")를 싣지 않고 섹션 자리만 그린다(#1500) — 하이드레이션 뒤에 실제 빈 상태가 온다.
    expect(result.serverHtml).not.toContain('없어요');
    expect(result.serverHtml).not.toContain('· 0');
    expect(result.serverHtml).toContain('진행 중인 지원 불러오는 중');
    expect(result.hydratedHtml).toContain('진행 중인 지원이 없어요');
    expect(result.recoverableErrors).toEqual([]);
    expect(result.hydrationWarnings).toEqual([]);
    expect(result.hydratedHtml).toContain('안녕하세요, <!-- -->홍길동<!-- -->님');
    expect(result.hydratedHtml).toContain('20240001');
  });

  it('마이페이지: 지원 목록이 하이드레이션 전에 캐시에 차 있어도 서버처럼 스켈레톤으로 하이드레이션하고, 그 뒤 목록을 그린다', async () => {
    applicationsState.isPending = true;
    const result = await hydrateAfterSessionRestore(() => <MyPage />, student, () => {
      applicationsState.isPending = false;
      applicationsState.data = [
        {
          id: 1, recruitmentId: 10, recruitmentTitle: '봄 신입 모집', recruitmentStatus: 'OPEN', clubId: 1, clubName: '두잉 댄스',
          category: 'CREATION', logoUrl: null, status: 'SUBMITTED', interview: null, submittedAt: '2026-05-26T10:00:00Z',
        },
      ];
    });

    // 게이트(하이드레이션 전엔 조회 중)가 없으면 서버 스켈레톤 ↔ 클라이언트 목록으로 어긋난다(#418).
    expect(result.serverHtml).toContain('진행 중인 지원 불러오는 중');
    expect(result.recoverableErrors).toEqual([]);
    expect(result.hydrationWarnings).toEqual([]);
    expect(result.hydratedHtml).toContain('두잉 댄스');
  });

  it('총동연 링크: 서버처럼 비운 채 하이드레이션하고, 그 뒤 관리자에게만 붙인다', async () => {
    const result = await hydrateAfterSessionRestore(() => <HomeNavAdminLink />, { ...student, role: 'ADMIN' });

    expect(result.serverHtml).toBe('');
    expect(result.recoverableErrors).toEqual([]);
    expect(result.hydrationWarnings).toEqual([]);
    expect(result.hydratedHtml).toContain('총동연');
  });

  it('총동연 링크: 관리자가 아니면 하이드레이션 뒤에도 붙이지 않는다', async () => {
    const result = await hydrateAfterSessionRestore(() => <HomeNavAdminLink />, student);

    expect(result.recoverableErrors).toEqual([]);
    expect(result.hydratedHtml).toBe('');
  });
});
