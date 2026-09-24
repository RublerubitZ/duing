import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { SubmissionBatchDetail, SubmissionBatchSummary, SubmissionCandidateBooking } from '@duing/types';

const mockDetailQuery = vi.fn();
const mockMembersQuery = vi.fn();
const mockCompleteMutateAsync = vi.fn();
const mockCsvMutateAsync = vi.fn();
const mockAddToast = vi.fn();
const mockDownloadBlobFile = vi.fn();
const mockReplace = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useSubmissionBatchDetailQuery: (...args: unknown[]) => mockDetailQuery(...args),
  useAdminClubMembersQuery: (...args: unknown[]) => mockMembersQuery(...args),
  useCompleteSubmissionBatchMutation: () => ({ mutateAsync: mockCompleteMutateAsync, isPending: false }),
  useDownloadSubmissionCsvMutation: () => ({ mutateAsync: mockCsvMutateAsync, isPending: false }),
}));
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));
vi.mock('@/app/_lib/downloadFile', () => ({
  downloadBlobFile: (...args: unknown[]) => mockDownloadBlobFile(...args),
}));
vi.mock('@/app/_lib/useGuardedRouter', () => ({
  useGuardedRouter: () => ({ replace: mockReplace }),
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

function makeBatch(overrides: Partial<SubmissionBatchSummary> = {}): SubmissionBatchSummary {
  return {
    batchId: 7,
    submissionNo: 'SUB-20260801-007',
    facilityId: null,
    facilityName: null,
    facilityNames: ['세미나실 A'],
    bookingCount: 2,
    clubNames: ['밴드부'],
    submittedAt: '2026-08-01T15:30:00Z',
    submittedByName: '관리자',
    memo: '8월 1주차 · 밴드부',
    cancelled: false,
    cancelledAt: null,
    completed: false,
    completedAt: null,
    ...overrides,
  };
}

function detailSuccess(bookings: SubmissionCandidateBooking[], batchOverrides: Partial<SubmissionBatchSummary> = {}) {
  const data: SubmissionBatchDetail = { batch: makeBatch(batchOverrides), bookings, audits: [] };
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
  mockCompleteMutateAsync.mockReset();
  mockCsvMutateAsync.mockReset();
  mockAddToast.mockReset();
  mockDownloadBlobFile.mockReset();
  mockReplace.mockReset();
  mockCsvMutateAsync.mockResolvedValue(new Blob(['csv'], { type: 'text/csv' }));
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

  it('완료 확인 Dialog 가 열린 동안 Enter 는 작성 완료를 토글하지 않는다', () => {
    renderCockpit();
    fireEvent.click(screen.getByRole('button', { name: '완료 처리' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Dialog 본문(비버튼)에 포커스가 있어도 배경의 현재 건이 작성 완료로 바뀌면 안 된다.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
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
    fireEvent.click(screen.getByRole('button', { name: /연극부\s*08\/10 19:00/ }));
    // 좌측 헤더의 현재 시설·건 위치가 2/2 로 바뀐다(연극부는 두 번째 건).
    expect(screen.getByText(/세미나실 A · 2 \/ 2건/)).toBeInTheDocument();
  });

  it('우측 건 목록은 같은 동아리라도 날짜·시간으로 구분된다(배치=동아리 단위)', () => {
    mockDetailQuery.mockReturnValue(
      detailSuccess([
        booking({ bookingId: 1, clubName: '밴드부', reservationDate: '2026-08-10', startTime: '18:00' }),
        booking({ bookingId: 2, clubName: '밴드부', reservationDate: '2026-08-17', startTime: '18:00' }),
      ]),
    );
    renderCockpit();

    // 동명·동시각 두 건이 날짜로 갈린다 — 날짜가 없으면 둘 다 "밴드부 18:00" 이라 구분 불가.
    expect(screen.getByRole('button', { name: /밴드부\s*08\/10 18:00/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /밴드부\s*08\/17 18:00/ })).toBeInTheDocument();
  });

  it('제목은 배치 메모(제목 승격)이고 제출번호는 서브로, 메모가 없으면 제출번호가 제목이다', () => {
    renderCockpit();
    expect(screen.getByRole('heading', { name: '8월 1주차 · 밴드부' })).toBeInTheDocument();
    expect(screen.getByText('SUB-20260801-007')).toBeInTheDocument();
  });

  it('메모 없는 배치는 제출번호가 제목이고 서브 번호는 중복 표기하지 않는다', () => {
    mockDetailQuery.mockReturnValue(detailSuccess(BOOKINGS, { memo: null }));
    renderCockpit();
    expect(screen.getByRole('heading', { name: 'SUB-20260801-007' })).toBeInTheDocument();
    expect(screen.getAllByText('SUB-20260801-007')).toHaveLength(1);
  });

  it('데이터 로딩 전에는 제목이 "제출 정보 보기" 다', () => {
    mockDetailQuery.mockReturnValue({ data: undefined, isLoading: true, isSuccess: false, isError: false, refetch: vi.fn() });
    renderCockpit();
    expect(screen.getByRole('heading', { name: '제출 정보 보기' })).toBeInTheDocument();
  });

  it('제출 대기로 돌아가는 링크를 제공한다', () => {
    renderCockpit();

    expect(screen.getByRole('link', { name: /제출 대기로/ })).toHaveAttribute(
      'href',
      '/admin/facility-bookings?tab=ready',
    );
  });

  it('헤더 CSV 는 batchId 로 내려받아 제출번호 규칙 파일명으로 저장한다', async () => {
    renderCockpit();
    fireEvent.click(screen.getByRole('button', { name: /CSV/ }));
    await waitFor(() => {
      expect(mockCsvMutateAsync).toHaveBeenCalledWith({ batchId: 7 });
      expect(mockDownloadBlobFile).toHaveBeenCalledWith('facility-submission-SUB-20260801-007.csv', expect.any(Blob));
    });
  });

  it('헤더 완료 처리 → 확인 Dialog → 확인 시 batchId 로 완료하고 스킵 0 이면 토스트 후 제출 이력 탭으로 이동한다', async () => {
    mockCompleteMutateAsync.mockResolvedValue({
      totalCount: 2, confirmedCount: 2, skippedCount: 0, completedAt: '2026-08-02T09:00:00', skippedBookings: [],
    });
    renderCockpit();
    fireEvent.click(screen.getByRole('button', { name: '완료 처리' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '완료 처리' }));
    await waitFor(() => {
      expect(mockCompleteMutateAsync).toHaveBeenCalledWith({ batchId: 7 });
      expect(mockAddToast).toHaveBeenCalledWith('학교 제출이 완료되었습니다.');
      expect(mockReplace).toHaveBeenCalledWith('/admin/facility-bookings?tab=archive');
    });
  });

  it('스킵이 있으면 결과 Dialog 에 예약일·동아리로 제외 행을 보여주고, 닫으면 제출 이력 탭으로 이동한다', async () => {
    mockCompleteMutateAsync.mockResolvedValue({
      totalCount: 2, confirmedCount: 1, skippedCount: 1, completedAt: '2026-08-02T09:00:00',
      skippedBookings: [{ bookingId: 2, status: 'CANCELLED', reason: '취소된 예약' }],
    });
    renderCockpit();
    fireEvent.click(screen.getByRole('button', { name: '완료 처리' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '완료 처리' }));
    const resultDialog = await screen.findByRole('dialog', { name: '학교 제출 완료' });
    expect(within(resultDialog).getByText('2026-08-10 연극부 · 취소된 예약')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    fireEvent.click(within(resultDialog).getByRole('button', { name: '확인' }));
    expect(mockReplace).toHaveBeenCalledWith('/admin/facility-bookings?tab=archive');
  });

  it('완료 실패 시 서버 메시지를 토스트로 띄우고 이동하지 않는다', async () => {
    mockCompleteMutateAsync.mockRejectedValue(new Error('이미 완료된 제출 목록입니다.'));
    renderCockpit();
    fireEvent.click(screen.getByRole('button', { name: '완료 처리' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '완료 처리' }));
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('이미 완료된 제출 목록입니다.', { variant: 'error' });
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('완료·취소된 배치에는 완료 처리 버튼이 없고 CSV 는 남는다', () => {
    mockDetailQuery.mockReturnValue(detailSuccess(BOOKINGS, { completed: true, completedAt: '2026-08-02T09:00:00' }));
    renderCockpit();
    expect(screen.queryByRole('button', { name: '완료 처리' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CSV/ })).toBeInTheDocument();
  });
});
