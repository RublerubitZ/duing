import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SubmissionAuditEntry,
  SubmissionBatchDetail,
  SubmissionBatchSummary,
  SubmissionCandidateBooking,
} from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockDetailQuery = vi.fn();
const mockCancelMutation = vi.fn();
const mockCompleteMutation = vi.fn();
const mockCsvMutation = vi.fn();
const mockCancelMutateAsync = vi.fn();
const mockCompleteMutateAsync = vi.fn();
const mockCsvMutateAsync = vi.fn();
const mockAddToast = vi.fn();
const mockDownloadBlobFile = vi.fn();
const mockReplace = vi.fn();

vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useSubmissionBatchDetailQuery: (...args: unknown[]) => mockDetailQuery(...args),
  useCancelSubmissionBatchMutation: () => mockCancelMutation(),
  useCompleteSubmissionBatchMutation: () => mockCompleteMutation(),
  useDownloadSubmissionCsvMutation: () => mockCsvMutation(),
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

/* ── 대상 ───────────────────────────────────────────────────── */
import { SubmissionBatchDetailPage } from '../../../app/admin/facility-bookings/submission/[batchId]/_pages/SubmissionBatchDetailPage';

/* ── 테스트 데이터 ───────────────────────────────────────────── */
function makeBooking(overrides: Partial<SubmissionCandidateBooking> = {}): SubmissionCandidateBooking {
  return {
    bookingId: 1,
    facilityId: 100,
    facilityName: '강당',
    clubId: 10,
    clubName: '밴드부',
    applicantName: '홍길동',
    contactPhone: '010-1234-5678',
    reservationDate: '2026-08-01',
    startTime: '18:00',
    endTime: '21:00',
    purpose: '정기 합주',
    attendeeCount: 30,
    status: 'CONFIRMED',
    submitted: true,
    selectable: false,
    submissionNo: 'SUB-20260801-001',
    decidedByName: '관리자',
    decidedAt: '2026-07-20T10:00:00',
    ...overrides,
  };
}

function makeBatch(overrides: Partial<SubmissionBatchSummary> = {}): SubmissionBatchSummary {
  return {
    batchId: 1,
    submissionNo: 'SUB-20260801-001',
    facilityId: 100,
    facilityName: '강당',
    bookingCount: 2,
    // BE 는 Instant(UTC) 로 내려준다 — UTC 로는 08-01 이지만 KST 로는 08-02 다.
    submittedAt: '2026-08-01T15:30:00Z',
    submittedByName: '관리자',
    memo: '8월 1차 제출',
    cancelled: false,
    cancelledAt: null,
    completed: false,
    completedAt: null,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<SubmissionBatchDetail> = {}): SubmissionBatchDetail {
  return {
    batch: makeBatch(),
    bookings: [makeBooking(), makeBooking({ bookingId: 2, reservationDate: '2026-08-02', purpose: '무대 설치' })],
    audits: [],
    ...overrides,
  };
}

const detailSuccess = (detail: SubmissionBatchDetail) => ({
  data: detail,
  isLoading: false,
  isSuccess: true,
  isError: false,
});

describe('SubmissionBatchDetailPage', () => {
  beforeEach(() => {
    mockDetailQuery.mockReset();
    mockCancelMutation.mockReset();
    mockCompleteMutation.mockReset();
    mockCsvMutation.mockReset();
    mockCancelMutateAsync.mockReset();
    mockCompleteMutateAsync.mockReset();
    mockCsvMutateAsync.mockReset();
    mockAddToast.mockReset();
    mockDownloadBlobFile.mockReset();
    mockReplace.mockReset();
    mockDetailQuery.mockReturnValue(detailSuccess(makeDetail()));
    mockCancelMutation.mockReturnValue({ mutateAsync: mockCancelMutateAsync, isPending: false });
    mockCompleteMutation.mockReturnValue({ mutateAsync: mockCompleteMutateAsync, isPending: false });
    mockCsvMutation.mockReturnValue({ mutateAsync: mockCsvMutateAsync, isPending: false });
    mockCancelMutateAsync.mockResolvedValue(undefined);
    mockCsvMutateAsync.mockResolvedValue(new Blob(['csv'], { type: 'text/csv' }));
  });

  // ① 헤더
  it('헤더 제목은 메모, 제출번호는 서브 표기·탈퇴한 생성자는 - 로 표기된다', () => {
    mockDetailQuery.mockReturnValue(
      detailSuccess(makeDetail({ batch: makeBatch({ submittedByName: null }) })),
    );
    render(<SubmissionBatchDetailPage batchId={1} />);

    // 메모=제목 승격(개편 스펙 §7) — 메모가 있으면 제목, 제출번호는 서브로 내려간다.
    expect(screen.getByRole('heading', { name: '8월 1차 제출' })).toBeInTheDocument();
    expect(screen.getByText('SUB-20260801-001')).toBeInTheDocument();
    expect(screen.getByText('제출 대기')).toBeInTheDocument();
    // 생성자 항목의 값만 좁혀 폴백(-)을 단언 — 다른 셀의 - 와 헷갈리지 않는다.
    expect(screen.getByText('생성자').nextElementSibling).toHaveTextContent('-');
    // 조회는 라우트가 넘긴 batchId 로 마운트된다.
    expect(mockDetailQuery).toHaveBeenCalledWith(1);
  });

  // ② Audit
  it('운영 기록을 한글 라벨·탈퇴 관리자 폴백·완료 요약으로 보여주고 IP 는 표시하지 않는다', () => {
    // createdAt 은 BE 가 Instant(UTC)로 내려준다 — 화면은 KST(+9h)로 환산해 보여야 한다.
    const audits: SubmissionAuditEntry[] = [
      { action: 'CREATED', adminName: '관리자', createdAt: '2026-08-01T10:00:00Z', ipAddress: '10.0.0.1', detail: null },
      {
        action: 'COMPLETED',
        adminName: null,
        // 날짜 경계: UTC 로는 08-02 이지만 KST 로는 08-03 이다.
        createdAt: '2026-08-02T17:30:00Z',
        ipAddress: '10.0.0.2',
        detail: '총 5건 중 3건 등록 완료, 2건 제외',
      },
    ];
    mockDetailQuery.mockReturnValue(detailSuccess(makeDetail({ audits })));
    render(<SubmissionBatchDetailPage batchId={1} />);

    expect(screen.getByText('생성')).toBeInTheDocument();
    expect(screen.getByText('학교 제출 완료')).toBeInTheDocument();
    expect(screen.getByText('(탈퇴한 관리자)')).toBeInTheDocument();
    expect(screen.getByText('총 5건 중 3건 등록 완료, 2건 제외')).toBeInTheDocument();
    expect(screen.getByText('2026.08.01 19:00')).toBeInTheDocument();
    // UTC 문자열을 그대로 자르면 08.02 02:30 이 되어 날짜까지 어긋난다.
    expect(screen.getByText('2026.08.03 02:30')).toBeInTheDocument();
    // IP 는 응답에 있어도 화면에 노출하지 않는다(결정 6).
    expect(screen.queryByText('10.0.0.1')).not.toBeInTheDocument();
    expect(screen.queryByText('10.0.0.2')).not.toBeInTheDocument();
  });

  // ③ 읽기 전용 그룹 행 클릭 → Sheet(취소 예약 취소선)
  it('예약 행을 클릭하면 상세 Sheet 가 열리고, 취소된 예약은 제목에 취소선과 취소됨 배지가 붙는다', () => {
    mockDetailQuery.mockReturnValue(
      detailSuccess(
        makeDetail({
          bookings: [
            makeBooking({ bookingId: 3, clubName: '취소동아리', status: 'CANCELLED', purpose: '취소된 예약' }),
          ],
        }),
      ),
    );
    render(<SubmissionBatchDetailPage batchId={1} />);

    fireEvent.click(screen.getByText('취소된 예약'));

    const title = screen.getByText('취소동아리 예약 상세');
    expect(title).toHaveClass('line-through');
    const heading = title.closest('h2');
    if (heading === null) throw new Error('취소 예약 Sheet 제목을 찾지 못했습니다');
    expect(within(heading).getByText('취소됨')).toBeInTheDocument();
  });

  // ③-b 제출번호는 예약의 업무 상태가 아니라 '이 목록과의 관계'로 소개한다
  it('취소된 제출 목록의 상세 Sheet 는 제출번호를 제출 완료가 아닌 목록 소속으로 설명한다', () => {
    // 취소된 목록은 학교에 실제 제출된 것이 아니다 — '제출됨' 상태로 읽히면 안 된다.
    mockDetailQuery.mockReturnValue(
      detailSuccess(
        makeDetail({
          batch: makeBatch({ cancelled: true, cancelledAt: '2026-08-03T09:00:00Z' }),
          bookings: [makeBooking({ bookingId: 5, purpose: '취소 목록 예약', submitted: true })],
        }),
      ),
    );
    render(<SubmissionBatchDetailPage batchId={1} />);

    fireEvent.click(screen.getByText('취소 목록 예약'));

    expect(screen.getByText('취소된 제출 목록에 포함')).toBeInTheDocument();
    // 제출번호는 그대로 보이되 '상태' 행에 섞이지 않는다.
    const statusValue = screen.getByText('상태').nextElementSibling;
    expect(statusValue?.textContent).not.toContain('SUB-');
  });

  it('검토 중인 제출 목록의 상세 Sheet 는 이 목록에 포함됐다고 설명한다', () => {
    mockDetailQuery.mockReturnValue(
      detailSuccess(
        makeDetail({ bookings: [makeBooking({ bookingId: 6, purpose: '검토 중 예약', submitted: true })] }),
      ),
    );
    render(<SubmissionBatchDetailPage batchId={1} />);

    fireEvent.click(screen.getByText('검토 중 예약'));

    expect(screen.getByText('이 제출 목록에 포함')).toBeInTheDocument();
  });

  // ④ 완료 스킵 → 결과 Dialog 제외 목록 예약일·동아리 표기
  it('완료 시 스킵 응답이 오면 제외 목록을 예약일·동아리로 표기한다', async () => {
    mockCompleteMutateAsync.mockResolvedValue({
      totalCount: 5,
      confirmedCount: 3,
      skippedCount: 2,
      completedAt: '2026-08-01T11:00:00',
      skippedBookings: [
        { bookingId: 123, status: 'CANCELLED', reason: '취소됨' },
        { bookingId: 124, status: 'CONFLICT', reason: '시간이 겹치는 다른 예약이 확정됨' },
      ],
    });
    mockDetailQuery.mockReturnValue(
      detailSuccess(
        makeDetail({
          bookings: [
            makeBooking({ bookingId: 123, clubName: '밴드부', reservationDate: '2026-08-01' }),
            makeBooking({ bookingId: 124, clubId: 77, clubName: null, reservationDate: '2026-08-02' }),
          ],
        }),
      ),
    );
    render(<SubmissionBatchDetailPage batchId={9} />);

    fireEvent.click(screen.getByRole('button', { name: '제출 완료' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '제출 완료' }));

    await waitFor(() => {
      expect(mockCompleteMutateAsync).toHaveBeenCalledWith({ batchId: 9 });
    });
    // detail.bookings 로 구성한 Map 이 제외 행에 예약일·동아리를 붙인다(clubName null → 동아리 77 폴백).
    expect(screen.getByText('2026-08-01 밴드부 · 취소됨')).toBeInTheDocument();
    expect(screen.getByText('2026-08-02 동아리 77 · 시간이 겹치는 다른 예약이 확정됨')).toBeInTheDocument();
  });

  // ④-b 완료 결과 Dialog 가 열린 뒤 상세 refetch 가 실패해도 Dialog 유지(쿼리 게이트 밖 마운트)
  it('완료 결과 Dialog 가 열린 뒤 상세 refetch 가 실패해도 결과 Dialog 를 유지한다', async () => {
    const detail = makeDetail({
      bookings: [
        makeBooking({ bookingId: 123, clubName: '밴드부', reservationDate: '2026-08-01' }),
        makeBooking({ bookingId: 124, clubId: 77, clubName: null, reservationDate: '2026-08-02' }),
      ],
    });
    mockCompleteMutateAsync.mockResolvedValue({
      totalCount: 5,
      confirmedCount: 3,
      skippedCount: 2,
      completedAt: '2026-08-01T11:00:00',
      skippedBookings: [
        { bookingId: 123, status: 'CANCELLED', reason: '취소됨' },
        { bookingId: 124, status: 'CONFLICT', reason: '시간이 겹치는 다른 예약이 확정됨' },
      ],
    });
    mockDetailQuery.mockReturnValue(detailSuccess(detail));
    const { rerender } = render(<SubmissionBatchDetailPage batchId={9} />);

    fireEvent.click(screen.getByRole('button', { name: '제출 완료' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '제출 완료' }));

    await waitFor(() => {
      expect(screen.getByText('2026-08-01 밴드부 · 취소됨')).toBeInTheDocument();
    });

    // onSettled invalidation 이 유발한 상세 refetch 가 실패 — React Query 는 마지막 data 를 유지한 채 status='error'.
    mockDetailQuery.mockReturnValue({ data: detail, isLoading: false, isSuccess: false, isError: true });
    rerender(<SubmissionBatchDetailPage batchId={9} />);

    // 결과 Dialog(제외 목록)가 사라지지 않고, 404 문구로도 대체되지 않는다.
    expect(screen.getByText('2026-08-01 밴드부 · 취소됨')).toBeInTheDocument();
    expect(screen.getByText('2026-08-02 동아리 77 · 시간이 겹치는 다른 예약이 확정됨')).toBeInTheDocument();
    expect(screen.queryByText('제출 목록을 찾을 수 없어요.')).not.toBeInTheDocument();
  });

  // ⑤ REVIEWING 아닐 때 완료/취소 버튼 비노출
  it('완료된 제출 목록은 완료·취소 버튼을 감추고 CSV 만 남긴다', () => {
    mockDetailQuery.mockReturnValue(
      detailSuccess(
        makeDetail({ batch: makeBatch({ completed: true, completedAt: '2026-08-02T09:00:00' }) }),
      ),
    );
    render(<SubmissionBatchDetailPage batchId={1} />);

    expect(screen.queryByRole('button', { name: '제출 완료' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '제출 목록 취소' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CSV/ })).toBeInTheDocument();
  });

  // ⑥ CSV 파일명
  it('CSV 버튼은 batchId 로 다운로드하고 제출번호 규칙 파일명으로 저장한다', async () => {
    mockDetailQuery.mockReturnValue(
      detailSuccess(makeDetail({ batch: makeBatch({ batchId: 42, submissionNo: 'SUB-20260801-009' }) })),
    );
    render(<SubmissionBatchDetailPage batchId={42} />);

    fireEvent.click(screen.getByRole('button', { name: /CSV/ }));

    await waitFor(() => {
      expect(mockCsvMutateAsync).toHaveBeenCalledWith({ batchId: 42 });
      expect(mockDownloadBlobFile).toHaveBeenCalledWith(
        'facility-submission-SUB-20260801-009.csv',
        expect.any(Blob),
      );
    });
  });

  // 취소 성공 → 목록으로 가드 라우터 이동
  it('취소를 확정하면 목록 탭으로 이동하고 성공 토스트를 띄운다', async () => {
    mockDetailQuery.mockReturnValue(detailSuccess(makeDetail({ batch: makeBatch({ batchId: 7 }) })));
    render(<SubmissionBatchDetailPage batchId={7} />);

    fireEvent.click(screen.getByRole('button', { name: '제출 목록 취소' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '제출 목록 취소' }));

    await waitFor(() => {
      expect(mockCancelMutateAsync).toHaveBeenCalledWith({ batchId: 7 });
      expect(mockReplace).toHaveBeenCalledWith('/admin/facility-bookings?tab=archive');
      expect(mockAddToast).toHaveBeenCalledWith('제출 목록이 취소되었어요.');
    });
  });

  // 404/에러
  it('상세 조회가 실패하면 안내와 목록 링크를 보여준다', () => {
    mockDetailQuery.mockReturnValue({ data: undefined, isLoading: false, isSuccess: false, isError: true });
    render(<SubmissionBatchDetailPage batchId={1} />);

    expect(screen.getByText('제출 목록을 찾을 수 없어요.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '제출 이력으로 돌아가기' })).toBeInTheDocument();
  });
});
