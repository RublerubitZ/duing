import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionBatchSummary } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockBatchesQuery = vi.fn();
const mockCancelMutation = vi.fn();
const mockCsvMutation = vi.fn();
const mockCancelMutateAsync = vi.fn();
const mockCsvMutateAsync = vi.fn();
const mockAddToast = vi.fn();
const mockDownloadBlobFile = vi.fn();

vi.mock('@duing/hooks', () => ({
  useSubmissionBatchesQuery: (...args: unknown[]) => mockBatchesQuery(...args),
  useCancelSubmissionBatchMutation: () => mockCancelMutation(),
  useDownloadSubmissionCsvMutation: () => mockCsvMutation(),
}));

vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock('@/app/_lib/downloadFile', () => ({
  downloadBlobFile: (...args: unknown[]) => mockDownloadBlobFile(...args),
}));

/* ── 대상 ───────────────────────────────────────────────────── */
import { SubmissionBatchesTab } from '../../../app/admin/facility-bookings/_tabs/SubmissionBatchesTab';

/* ── 테스트 데이터 ───────────────────────────────────────────── */
function makeBatch(overrides: Partial<SubmissionBatchSummary> = {}): SubmissionBatchSummary {
  return {
    batchId: 1,
    submissionNo: 'SUB-20260801-001',
    facilityId: 100,
    facilityName: '강당',
    bookingCount: 3,
    submittedAt: '2026-08-01T10:00:00',
    submittedByName: '관리자',
    memo: '8월 1차 제출',
    cancelled: false,
    cancelledAt: null,
    completed: false,
    completedAt: null,
    ...overrides,
  };
}

const listSuccess = (batches: SubmissionBatchSummary[], totalPages = 1) => ({
  data: { content: batches, page: 0, size: 10, totalElements: batches.length, totalPages, hasNext: false },
  isLoading: false,
  isSuccess: true,
  isError: false,
  error: null,
  refetch: vi.fn(),
});

/** 배치의 행(<tr>) — 여러 행에 같은 라벨의 액션이 있어 행 단위로 좁혀 조회한다. */
function rowOf(submissionNo: string): HTMLElement {
  const cell = screen.getByText(submissionNo);
  const row = cell.closest('tr');
  if (row === null) throw new Error(`행(${submissionNo})을 찾지 못했습니다`);
  return row;
}

describe('SubmissionBatchesTab', () => {
  beforeEach(() => {
    mockBatchesQuery.mockReset();
    mockCancelMutation.mockReset();
    mockCsvMutation.mockReset();
    mockCancelMutateAsync.mockReset();
    mockCsvMutateAsync.mockReset();
    mockAddToast.mockReset();
    mockDownloadBlobFile.mockReset();
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch()]));
    mockCancelMutation.mockReturnValue({ mutateAsync: mockCancelMutateAsync, isPending: false });
    mockCsvMutation.mockReturnValue({ mutateAsync: mockCsvMutateAsync, isPending: false });
    mockCancelMutateAsync.mockResolvedValue(undefined);
    mockCsvMutateAsync.mockResolvedValue(new Blob(['csv'], { type: 'text/csv' }));
  });

  it('REVIEWING 배치 행이 제출번호·시설·건수·생성일·생성자·검토 중 배지로 렌더된다', () => {
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch()]));
    render(<SubmissionBatchesTab />);

    const row = rowOf('SUB-20260801-001');
    expect(within(row).getByText('강당')).toBeInTheDocument();
    expect(within(row).getByText('3')).toBeInTheDocument();
    expect(within(row).getByText('2026-08-01')).toBeInTheDocument();
    expect(within(row).getByText('관리자')).toBeInTheDocument();
    expect(within(row).getByText('검토 중')).toBeInTheDocument();
    // 첫 페이지 진입은 page:0·size:10 으로 조회한다.
    expect(mockBatchesQuery).toHaveBeenCalledWith({ page: 0, size: 10 });
  });

  it('시설명 결측·생성자 탈퇴·메모 없음은 폴백으로 렌더된다', () => {
    mockBatchesQuery.mockReturnValue(
      listSuccess([makeBatch({ facilityName: null, submittedByName: null, memo: null })]),
    );
    render(<SubmissionBatchesTab />);

    const row = rowOf('SUB-20260801-001');
    expect(within(row).getByText('시설 100')).toBeInTheDocument();
    // 생성자 '-'·메모 '-' 둘 다 폴백이라 행 안에 '-' 가 2개 나온다.
    expect(within(row).getAllByText('-')).toHaveLength(2);
  });

  it('완료·취소 배치는 배지만 노출하고 REVIEWING 전용 액션(제출 완료·취소)은 없다', () => {
    mockBatchesQuery.mockReturnValue(
      listSuccess([
        makeBatch({ batchId: 2, submissionNo: 'SUB-DONE', completed: true, completedAt: '2026-08-02T09:00:00' }),
        makeBatch({ batchId: 3, submissionNo: 'SUB-CANCEL', cancelled: true, cancelledAt: '2026-08-03T09:00:00' }),
      ]),
    );
    render(<SubmissionBatchesTab />);

    expect(screen.getByText('제출 완료')).toBeInTheDocument();
    expect(screen.getByText('취소됨')).toBeInTheDocument();
    // '제출 완료' 배지는 있어도 REVIEWING 전용 '제출 완료'·'취소' 버튼은 어느 행에도 없다.
    expect(screen.queryByRole('button', { name: '제출 완료' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
    // CSV 는 전 상태 허용 — 완료·취소 두 행 모두 노출한다.
    expect(screen.getAllByRole('button', { name: 'CSV' })).toHaveLength(2);
  });

  it('CSV 클릭 시 batchId 로 다운로드하고 제출번호 규칙 파일명으로 저장한다', async () => {
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch({ batchId: 42, submissionNo: 'SUB-20260801-009' })]));
    render(<SubmissionBatchesTab />);

    fireEvent.click(within(rowOf('SUB-20260801-009')).getByRole('button', { name: 'CSV' }));

    await waitFor(() => {
      expect(mockCsvMutateAsync).toHaveBeenCalledWith({ batchId: 42 });
      expect(mockDownloadBlobFile).toHaveBeenCalledWith(
        'facility-submission-SUB-20260801-009.csv',
        expect.any(Blob),
      );
    });
  });

  it('CSV 다운로드 진행 중이면 CSV 버튼이 비활성화된다', () => {
    mockCsvMutation.mockReturnValue({ mutateAsync: mockCsvMutateAsync, isPending: true });
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch()]));
    render(<SubmissionBatchesTab />);

    expect(screen.getByRole('button', { name: /CSV/ })).toBeDisabled();
  });

  it('CSV 실패 시 안내 토스트를 띄운다', async () => {
    mockCsvMutateAsync.mockRejectedValue(new Error('boom'));
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch()]));
    render(<SubmissionBatchesTab />);

    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        'CSV 다운로드에 실패했어요. 잠시 후 다시 시도해 주세요.',
        { variant: 'error' },
      );
    });
    expect(mockDownloadBlobFile).not.toHaveBeenCalled();
  });

  it('취소 버튼 → 3문단 확인 Dialog → 확인 시 batchId 로 취소하고 성공 토스트를 띄운다', async () => {
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch({ batchId: 7 })]));
    render(<SubmissionBatchesTab />);

    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByText('제출 목록을 취소할까요?')).toBeInTheDocument();
    expect(screen.getByText('취소하면 이 제출 목록은 사용할 수 없게 됩니다.')).toBeInTheDocument();
    expect(screen.getByText("담긴 예약은 다시 '학교에 제출할 예약' 목록으로 돌아갑니다.")).toBeInTheDocument();
    expect(screen.getByText('이 작업은 되돌릴 수 없습니다.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '제출 목록 취소' }));

    await waitFor(() => {
      expect(mockCancelMutateAsync).toHaveBeenCalledWith({ batchId: 7 });
      expect(mockAddToast).toHaveBeenCalledWith('제출 목록이 취소되었어요.');
    });
  });

  it('취소 실패 시 서버 메시지를 우선한 에러 토스트를 띄운다', async () => {
    mockCancelMutateAsync.mockRejectedValue(new Error('이미 완료된 제출 목록입니다.'));
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch()]));
    render(<SubmissionBatchesTab />);

    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    fireEvent.click(screen.getByRole('button', { name: '제출 목록 취소' }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('이미 완료된 제출 목록입니다.', { variant: 'error' });
    });
  });

  it('빈 목록이면 안내 문구를 보여준다', () => {
    mockBatchesQuery.mockReturnValue(listSuccess([]));
    render(<SubmissionBatchesTab />);

    expect(
      screen.getByText("아직 만든 제출 목록이 없어요. '학교 제출 준비' 탭에서 만들 수 있어요."),
    ).toBeInTheDocument();
  });

  it('페이지를 넘기면 다음 page 로 목록을 다시 조회한다', () => {
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch()], 2));
    render(<SubmissionBatchesTab />);

    fireEvent.click(screen.getByRole('button', { name: '2' }));

    expect(mockBatchesQuery).toHaveBeenLastCalledWith({ page: 1, size: 10 });
  });

  it('상세 링크는 batchId 경로를 가리킨다', () => {
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch({ batchId: 55 })]));
    render(<SubmissionBatchesTab />);

    expect(screen.getByRole('link', { name: '상세' })).toHaveAttribute(
      'href',
      '/admin/facility-bookings/submission/55',
    );
  });
});
