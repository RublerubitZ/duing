import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ApplicationStatus, ApplicationSummary, MyClubSummary, RecruitmentStatus } from '@duing/types';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';

// 마이페이지와 설정은 같은 머리글(MyPageHeader)을 쓴다 — 같은 사람의 숫자가 화면마다 다르면 안 된다(#1499).
// 진행 중 지원 1(결과 나온 지원 2는 지난 지원), 가입 동아리 2(운영은 0), 찜 1.
const make = (id: number, status: ApplicationStatus, recruitmentStatus: RecruitmentStatus): ApplicationSummary => ({
  id,
  recruitmentId: id * 10,
  recruitmentTitle: '봄 신입 모집',
  recruitmentStatus,
  clubId: id,
  clubName: `동아리${id}`,
  category: 'CREATION',
  logoUrl: null,
  status,
  interview: null,
  submittedAt: '2026-05-26T10:00:00Z',
});
// 지난 지원 하나는 결과 없이 마감된 지원 — 지원 상태만 보면 진행 중으로 잘못 셀 수 있는 경우다.
const applications = [make(1, 'SUBMITTED', 'OPEN'), make(2, 'ACCEPTED', 'CLOSED'), make(3, 'SUBMITTED', 'CLOSED')];
const club = (clubId: number): MyClubSummary => ({
  clubId,
  clubName: `가입${clubId}`,
  logoUrl: null,
  status: 'ACTIVE',
  myRole: 'MEMBER',
  activeRecruitmentCount: 0,
  joinedAt: '2026-05-20T10:00:00Z',
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/me',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  useSelectedLayoutSegment: () => null,
}));
vi.mock('@duing/hooks', () => ({
  useMeQuery: () => ({ data: undefined }),
  useLogout: () => vi.fn(),
  useMyApplicationsQuery: () => ({ data: applications, isPending: false }),
  useManagedClubsQuery: () => ({ data: [] }),
  useMyClubsQuery: () => ({ data: [club(1), club(2)] }),
  useFavoriteListQuery: () => ({ data: { content: [{ clubId: 9 }] } }),
  useProfileCheckQuery: () => ({ data: { pending: false }, isFetching: false, isError: false }),
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
// 섹션·배너는 이 테스트의 관심이 아니다(머리글 숫자만 본다).
vi.mock('@/app/me/_components/SectionApply', () => ({ SectionApply: () => null }));
vi.mock('@/app/me/_components/SectionArchived', () => ({ SectionArchived: () => null }));
vi.mock('@/app/me/_components/SectionMyClubs', () => ({ SectionMyClubs: () => null }));
vi.mock('@/app/me/_components/SectionSaved', () => ({ SectionSaved: () => null }));
vi.mock('@/app/me/_components/SectionInquiries', () => ({ SectionInquiries: () => null }));
vi.mock('@/app/me/_components/AcceptanceBanner', () => ({ AcceptanceBanner: () => null }));

import { MyPage } from '@/app/me/_pages/MyPage';
import { SettingsPage } from '@/app/me/settings/_pages/SettingsPage';

/** 머리글의 "지원 중·가입·찜" 숫자 — 라벨 바로 위 형제가 숫자다. */
function headerCounts(): Record<string, string> {
  const header = screen.getByRole('heading', { level: 1 }).closest('section');
  if (!header) throw new Error('머리글이 없다');
  return Object.fromEntries(
    ['지원 중', '가입', '찜'].map((label) => [
      label,
      within(header).getByText(label, { exact: true }).previousElementSibling?.textContent ?? '',
    ]),
  );
}

describe('마이페이지·설정 머리글 숫자 — 같은 데이터면 같은 숫자', () => {
  it('지원 중은 진행 중 지원, 가입은 가입한 동아리 수로 두 화면이 같다', () => {
    const { unmount } = render(<MyPage />);
    const myPageCounts = headerCounts();
    unmount();
    render(
      <ToastProvider>
        <SettingsPage />
      </ToastProvider>,
    );
    const settingsCounts = headerCounts();

    expect(myPageCounts).toEqual({ '지원 중': '1', 가입: '2', 찜: '1' });
    expect(settingsCounts).toEqual(myPageCounts);
  });
});
