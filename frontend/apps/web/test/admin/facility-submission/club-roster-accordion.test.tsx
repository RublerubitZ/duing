import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { AdminClubMember } from '@duing/types';

const mockMembersQuery = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useAdminClubMembersQuery: (...args: unknown[]) => mockMembersQuery(...args),
}));

import { ClubRosterAccordion } from '@/app/admin/facility-bookings/submission/_components/ClubRosterAccordion';

const MEMBERS: AdminClubMember[] = [
  { memberId: 1, name: '홍길동', studentId: '20231234', major: '컴퓨터공학', college: 'IT_ENGINEERING', grade: 'JUNIOR', role: 'LEADER' },
  { memberId: 2, name: '김철수', studentId: '20240002', major: '간호학', college: 'NURSING', grade: 'FRESHMAN', role: 'MEMBER' },
];

function success(members: AdminClubMember[]) {
  return { data: members, isLoading: false, isSuccess: true, isError: false, refetch: vi.fn() };
}

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  return writeText;
}

function renderAccordion() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<ClubRosterAccordion clubId={100} clubName="밴드부" />, { wrapper: Wrapper });
}

beforeEach(() => {
  mockMembersQuery.mockReset();
  mockMembersQuery.mockReturnValue(success(MEMBERS));
});

describe('ClubRosterAccordion', () => {
  it('기본은 접혀 있고 명단을 조회하지 않는다(clubId null)', () => {
    renderAccordion();

    expect(screen.getByRole('button', { name: /동아리원 보기/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('홍길동')).not.toBeInTheDocument();
    // 접힌 동안은 clubId=null 로 호출돼 조회가 비활성이다.
    expect(mockMembersQuery).toHaveBeenLastCalledWith(null);
  });

  it('펼치면 명단을 이름·학번·전공·단과대·학년으로 이름 순서대로 보여준다', () => {
    renderAccordion();
    fireEvent.click(screen.getByRole('button', { name: /동아리원 보기/ }));

    // 펼친 뒤 clubId 로 조회한다.
    expect(mockMembersQuery).toHaveBeenLastCalledWith(100);
    expect(screen.getByText('홍길동')).toBeInTheDocument();
    expect(screen.getByText('20231234')).toBeInTheDocument();
    // 단과대는 한글 라벨로, 전공·학년과 함께 노출된다.
    expect(screen.getByText(/컴퓨터공학 · IT·공과대학 · 3학년/)).toBeInTheDocument();
    // 총원 표기와 둘째 멤버(이름 순서대로)도 함께 노출된다.
    expect(screen.getByText((_, el) => el?.textContent === '총 2명')).toBeInTheDocument();
    expect(screen.getByText('김철수')).toBeInTheDocument();
  });

  it('행을 클릭하면 이름/학번/전공/단과대 한 줄을 복사한다', () => {
    const writeText = stubClipboard();
    renderAccordion();
    fireEvent.click(screen.getByRole('button', { name: /동아리원 보기/ }));

    fireEvent.click(screen.getByRole('button', { name: '홍길동 명단 복사' }));
    expect(writeText).toHaveBeenCalledWith('홍길동 / 20231234 / 컴퓨터공학 / IT·공과대학');
  });

  it('전체 명단 복사는 모든 행을 줄바꿈으로 이어 붙인다', () => {
    const writeText = stubClipboard();
    renderAccordion();
    fireEvent.click(screen.getByRole('button', { name: /동아리원 보기/ }));

    fireEvent.click(screen.getByRole('button', { name: '전체 명단 복사' }));
    expect(writeText).toHaveBeenCalledWith(
      '홍길동 / 20231234 / 컴퓨터공학 / IT·공과대학\n김철수 / 20240002 / 간호학 / 간호대학',
    );
  });

  it('명단이 비면 안내를 보여준다', async () => {
    mockMembersQuery.mockReturnValue(success([]));
    renderAccordion();
    fireEvent.click(screen.getByRole('button', { name: /동아리원 보기/ }));

    await waitFor(() => expect(screen.getByText('등록된 동아리원이 없어요.')).toBeInTheDocument());
  });
});
