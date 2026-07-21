import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { SubmissionBatchDetail, SubmissionCandidateBooking } from '@duing/types';

const mockDetailQuery = vi.fn();
const mockMembersQuery = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useSubmissionBatchDetailQuery: (...args: unknown[]) => mockDetailQuery(...args),
  useAdminClubMembersQuery: (...args: unknown[]) => mockMembersQuery(...args),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { TranscribeCockpitPage } from '@/app/admin/facility-bookings/submission/[batchId]/transcribe/_pages/TranscribeCockpitPage';

function booking(overrides: Partial<SubmissionCandidateBooking>): SubmissionCandidateBooking {
  return {
    bookingId: 1, facilityId: 10, facilityName: '세미나실 A', clubId: 100, clubName: '밴드부',
    applicantName: '홍길동', contactPhone: '010-1234-5678', reservationDate: '2026-08-10',
    startTime: '18:00', endTime: '20:00', purpose: '정기 합주', attendeeCount: 15,
    status: 'APPROVED', submitted: false, selectable: true, submissionNo: null,
    decidedByName: '관리자', decidedAt: '2026-08-01T00:00:00Z', ...overrides,
  };
}

const BOOKINGS: SubmissionCandidateBooking[] = [
  booking({ bookingId: 1, clubName: '밴드부', startTime: '18:00' }),
  booking({ bookingId: 2, clubName: '연극부', startTime: '19:00' }),
];

function detailSuccess(bookings: SubmissionCandidateBooking[]) {
  const data: SubmissionBatchDetail = {
    batch: {} as SubmissionBatchDetail['batch'],
    bookings,
    audits: [],
  };
  return { data, isLoading: false, isSuccess: true, isError: false, refetch: vi.fn() };
}

function renderCockpit() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<TranscribeCockpitPage batchId={7} />, { wrapper: Wrapper });
}

beforeEach(() => {
  window.sessionStorage.clear();
  mockDetailQuery.mockReset();
  mockMembersQuery.mockReset();
  mockDetailQuery.mockReturnValue(detailSuccess(BOOKINGS));
  // 명단 아코디언은 기본 접힘이라 조회하지 않지만, 훅은 호출되므로 안전한 기본값을 준다.
  mockMembersQuery.mockReturnValue({ data: [], isLoading: false, isSuccess: true, isError: false, refetch: vi.fn() });
});

describe('TranscribeCockpitPage', () => {
  it('HWP 양식 필드를 순서대로 복사 버튼으로 보여준다', () => {
    renderCockpit();

    expect(screen.getByRole('button', { name: /사용 시설명 복사: 세미나실 A/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /사용 일시 복사: 2026-08-10 18:00~20:00/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /신청자 성명 복사: 홍길동/ })).toBeInTheDocument();
  });

  it('작성완료·다음을 누르면 진행이 늘고 sessionStorage 에 남는다', () => {
    renderCockpit();

    expect(screen.getByText((_, el) => el?.textContent === '전체 0/2건 작성 완료')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /작성완료 · 다음/ }));

    expect(screen.getByText((_, el) => el?.textContent === '전체 1/2건 작성 완료')).toBeInTheDocument();
    const saved = JSON.parse(window.sessionStorage.getItem('duing:transcribe:7') ?? '[]');
    expect(saved).toContain(1);
  });

  it('Enter 키로도 현재 건을 작성 완료 처리한다(포커스 없음)', () => {
    renderCockpit();

    fireEvent.keyDown(document, { key: 'Enter' });
    expect(screen.getByText((_, el) => el?.textContent === '전체 1/2건 작성 완료')).toBeInTheDocument();
  });

  it('버튼에 포커스된 상태의 Enter 는 완료 단축키를 발동하지 않는다(버튼 기본 동작 보존)', () => {
    renderCockpit();

    // 이전 버튼 등 상호작용 요소에서 누른 Enter 는 그 버튼의 동작이라 완료 처리로 가로채면 안 된다.
    const copyButton = screen.getByRole('button', { name: /사용 시설명 복사/ });
    fireEvent.keyDown(copyButton, { key: 'Enter' });

    expect(screen.getByText((_, el) => el?.textContent === '전체 0/2건 작성 완료')).toBeInTheDocument();
  });

  it('sessionStorage 에 진행이 남아 있으면 재진입 시 복원한다', () => {
    window.sessionStorage.setItem('duing:transcribe:7', JSON.stringify([1, 2]));
    renderCockpit();

    expect(screen.getByText((_, el) => el?.textContent === '전체 2/2건 작성 완료')).toBeInTheDocument();
  });

  it('현재 시설의 다른 건을 우측 리스트에서 선택해 이동한다', () => {
    renderCockpit();

    // 우측 건 리스트에서 연극부 건(19:00) 클릭 → 좌측 현재 건이 연극부로 바뀐다.
    fireEvent.click(screen.getByRole('button', { name: /연극부\s*19:00/ }));
    // 좌측 헤더의 현재 시설·건 위치가 2/2 로 바뀐다(연극부는 두 번째 건).
    expect(screen.getByText(/세미나실 A · 2 \/ 2건/)).toBeInTheDocument();
  });

  it('제출 대기로 돌아가는 링크를 제공한다', () => {
    renderCockpit();

    expect(screen.getByRole('link', { name: /제출 대기로/ })).toHaveAttribute(
      'href',
      '/admin/facility-bookings?tab=ready',
    );
  });
});
