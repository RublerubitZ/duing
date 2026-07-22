import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { AdminClubMember, ClubDetail } from '@duing/types';
import { collegeDisplayName } from '@/app/_lib/college';

import { AdminClubDetailPage } from '@/app/admin/clubs/[clubId]/_pages/AdminClubDetailPage';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

const CLUB_DETAIL: ClubDetail = {
  id: 1,
  name: '두잉동아리',
  category: 'ACADEMIC',
  division: '1',
  college: null,
  logoUrl: null,
  status: 'ACTIVE',
  tags: ['개발'],
  tagline: '함께 성장',
  centralClub: true,
  description: '기존 소개',
  coverUrl: null,
  snsLinks: [],
  faqs: [],
  leaderId: 10,
  leaderName: '회장',
  photos: [],
  foundedYear: 2018,
  cohortNumber: 10,
  location: '학생회관 405호',
  contactEmail: null,
  activityFrequency: 1,
  activeDays: [],
  membershipFee: null,
  highlights: [],
  majorProjects: null,
  activeRecruitment: null,
};

const MEMBERS: AdminClubMember[] = Array.from({ length: 25 }, (_, index) => ({
  memberId: index + 1,
  name: index === 0 ? '홍길동' : `회원${index + 1}`,
  studentId: `2023${String(1000 + index).padStart(4, '0')}`,
  major: index === 0 ? '컴퓨터공학과' : '전자공학과',
  college: 'IT_ENGINEERING',
  grade: 'FRESHMAN',
  role: index === 0 ? 'LEADER' : index < 3 ? 'OFFICER' : 'MEMBER',
}));

const server = setupServer(
  http.get('*/admin/clubs/1', () =>
    HttpResponse.json({ ok: true, data: CLUB_DETAIL, message: null }),
  ),
  http.get('*/admin/clubs/1/members', () =>
    HttpResponse.json({ ok: true, data: MEMBERS, message: null }),
  ),
);
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </ApiClientProvider>
    );
  }
  return render(
    <Wrapper>
      <AdminClubDetailPage clubId={1} />
    </Wrapper>,
  );
}

describe('AdminClubDetailPage', () => {
  it('회원 행에 단과대·전공을 표시하고 총 회원 수를 보여준다', async () => {
    renderPage();
    expect(await screen.findByText('홍길동')).toBeInTheDocument();
    expect(screen.getByText(/회원 25명/)).toBeInTheDocument();
    expect(screen.getByText(/컴퓨터공학과/)).toBeInTheDocument();
    // 25명 모두 동일 단과대(IT_ENGINEERING) 픽스처라 첫 페이지 20행이 같은 라벨을 공유한다.
    // 단일 매칭을 가정한 getByText 는 다중 매칭으로 던지므로 "라벨이 노출되는지"만 확인한다.
    expect(
      screen.getAllByText(new RegExp(collegeDisplayName('IT_ENGINEERING'))).length,
    ).toBeGreaterThan(0);
  });

  it('25명이면 페이지네이션이 나타나고 첫 페이지엔 20명만 보인다', async () => {
    renderPage();
    await screen.findByText('홍길동');
    // 21번째 회원은 2페이지 → 첫 페이지에 없음
    expect(screen.queryByText('회원21')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
  });

  it('이름·학번·전공으로 검색하면 결과가 필터링된다', async () => {
    renderPage();
    await screen.findByText('홍길동');
    await userEvent.type(screen.getByLabelText('회원 검색'), '홍길');
    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeInTheDocument();
      expect(screen.queryByText('회원5')).not.toBeInTheDocument();
    });
  });

  it('전공(major)과 학번(studentId)으로도 검색된다', async () => {
    renderPage();
    await screen.findByText('홍길동');

    const searchInput = screen.getByLabelText('회원 검색');
    // 전공 경로: 0번 회원만 컴퓨터공학과
    await userEvent.type(searchInput, '컴퓨터공학');
    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeInTheDocument();
      expect(screen.queryByText('회원5')).not.toBeInTheDocument();
    });

    // 학번 경로: index 5(=회원6)만 20231005
    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, '20231005');
    await waitFor(() => {
      expect(screen.getByText('회원6')).toBeInTheDocument();
      expect(screen.queryByText('홍길동')).not.toBeInTheDocument();
    });
  });

  it('검색 결과가 없으면 Empty 문구를 보여준다', async () => {
    renderPage();
    await screen.findByText('홍길동');
    await userEvent.type(screen.getByLabelText('회원 검색'), '존재하지않는이름');
    expect(await screen.findByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it('수정 버튼으로 편집 모드에 진입해 저장하면 변경 payload 로 PATCH 되고 편집 모드가 닫힌다', async () => {
    let patchBody: unknown = null;
    server.use(
      http.patch('*/admin/clubs/1', async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({
          ok: true,
          data: { ...CLUB_DETAIL, name: '새이름두잉' },
          message: null,
        });
      }),
    );
    renderPage();
    await screen.findByText('홍길동');

    await userEvent.click(screen.getByRole('button', { name: '수정' }));
    const nameInput = await screen.findByLabelText('이름');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '새이름두잉');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(patchBody).toEqual({ name: '새이름두잉' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument(),
    );
  });
});
