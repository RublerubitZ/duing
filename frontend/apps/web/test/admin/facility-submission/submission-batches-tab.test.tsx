import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionBatchSummary } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockBatchesQuery = vi.fn();
const mockCancelMutation = vi.fn();
const mockCsvMutation = vi.fn();
const mockCompleteMutation = vi.fn();
const mockCancelMutateAsync = vi.fn();
const mockCsvMutateAsync = vi.fn();
const mockCompleteMutateAsync = vi.fn();
const mockAddToast = vi.fn();
const mockDownloadBlobFile = vi.fn();

vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useSubmissionBatchesQuery: (...args: unknown[]) => mockBatchesQuery(...args),
  useCancelSubmissionBatchMutation: () => mockCancelMutation(),
  useDownloadSubmissionCsvMutation: () => mockCsvMutation(),
  useCompleteSubmissionBatchMutation: () => mockCompleteMutation(),
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
    clubNames: ['가온', '바람'],
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

const listSuccess = (batches: SubmissionBatchSummary[], totalPages = 1) => ({
  data: { content: batches, page: 0, size: 10, totalElements: batches.length, totalPages, hasNext: false },
  isLoading: false,
  isSuccess: true,
  isError: false,
  error: null,
  refetch: vi.fn(),
});

/** 배치의 행(<tr>) — 제출번호는 제목 또는 "번호 · 생성자" 서브에 섞여 있어 부분 일치로 찾는다. */
function rowOf(submissionNo: string): HTMLElement {
  const cell = screen.getByText(submissionNo, { exact: false });
  const row = cell.closest('tr');
  if (row === null) throw new Error(`행(${submissionNo})을 찾지 못했습니다`);
  return row;
}

describe('SubmissionBatchesTab', () => {
  beforeEach(() => {
    mockBatchesQuery.mockReset();
    mockCancelMutation.mockReset();
    mockCsvMutation.mockReset();
    mockCompleteMutation.mockReset();
    mockCancelMutateAsync.mockReset();
    mockCsvMutateAsync.mockReset();
    mockCompleteMutateAsync.mockReset();
    mockAddToast.mockReset();
    mockDownloadBlobFile.mockReset();
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch()]));
    mockCancelMutation.mockReturnValue({ mutateAsync: mockCancelMutateAsync, isPending: false });
    mockCsvMutation.mockReturnValue({ mutateAsync: mockCsvMutateAsync, isPending: false });
    mockCompleteMutation.mockReturnValue({ mutateAsync: mockCompleteMutateAsync, isPending: false });
    mockCancelMutateAsync.mockResolvedValue(undefined);
    mockCsvMutateAsync.mockResolvedValue(new Blob(['csv'], { type: 'text/csv' }));
  });

  it('REVIEWING 배치 행이 메모 제목·제출번호·시설·건수·생성일·제출 대기 배지로 렌더된다', () => {
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch()]));
    render(<SubmissionBatchesTab />);

    const row = rowOf('SUB-20260801-001');
    // 메모=제목 승격(개편 스펙 §5) — 제출번호·생성자는 서브 표기로 내려간다.
    expect(within(row).getByText('8월 1차 제출')).toBeInTheDocument();
    expect(within(row).getByText('SUB-20260801-001 · 관리자')).toBeInTheDocument();
    expect(within(row).getByText('강당')).toBeInTheDocument();
    expect(within(row).getByText('3건')).toBeInTheDocument();
    expect(within(row).getByText('2026.08.02')).toBeInTheDocument();
    expect(within(row).getByText('제출 대기')).toBeInTheDocument();
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
    // 메모 없음 → 제출번호가 제목으로 승격되고, 서브는 생성자 폴백 '-' 하나만 남는다.
    expect(within(row).getByText('SUB-20260801-001')).toBeInTheDocument();
    expect(within(row).getAllByText('-')).toHaveLength(1);
  });

  it('동아리 컬럼에 포함 동아리명을 표시하고, clubNames 결측(구버전 응답)·빈 배열 행은 - 로 표시한다', () => {
    mockBatchesQuery.mockReturnValue(
      listSuccess([
        makeBatch(),
        makeBatch({ batchId: 2, submissionNo: 'SUB-LEGACY', clubNames: undefined }),
        makeBatch({ batchId: 3, submissionNo: 'SUB-EMPTY', clubNames: [] }),
      ]),
    );
    render(<SubmissionBatchesTab />);

    expect(screen.getByText('동아리')).toBeInTheDocument();
    expect(within(rowOf('SUB-20260801-001')).getByText('가온 · 바람')).toBeInTheDocument();
    expect(within(rowOf('SUB-LEGACY')).getByText('-')).toBeInTheDocument();
    expect(within(rowOf('SUB-EMPTY')).getByText('-')).toBeInTheDocument();
  });

  it('진행 중 배치는 생성 후 경과 일수를 표기하고 3일 이상이면 경고색으로 강조한다', () => {
    // 절대 날짜 하드코딩 금지(타임밤) — 4일 전 생성 시각을 만들어 단언한다.
    const fourDaysAgoIso = new Date(Date.now() - 4 * 86_400_000).toISOString();
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch({ submittedAt: fourDaysAgoIso })]));
    render(<SubmissionBatchesTab />);

    const agingLabel = screen.getByText('생성 4일 경과');
    expect(agingLabel).toHaveClass('text-[#8E6620]');
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
    expect(screen.queryByRole('button', { name: '완료 처리' })).not.toBeInTheDocument();
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

  it('CSV 진행 중 스피너는 실제 내려받는 행에만 붙는다', () => {
    // 중복 발사 방지로 비활성은 전 행이지만, 스피너까지 전 행에 돌면 무엇을 받는지 알 수 없다.
    mockCsvMutation.mockReturnValue({
      mutateAsync: mockCsvMutateAsync,
      isPending: true,
      variables: { batchId: 2 },
    });
    mockBatchesQuery.mockReturnValue(
      listSuccess([
        makeBatch({ batchId: 1, submissionNo: 'SUB-OTHER' }),
        makeBatch({ batchId: 2, submissionNo: 'SUB-DOWNLOADING' }),
      ]),
    );
    render(<SubmissionBatchesTab />);

    // 스피너 svg 는 aria-hidden 이라 역할로 못 잡는다 — 회전 클래스로 존재만 확인한다.
    expect(rowOf('SUB-DOWNLOADING').querySelector('.animate-spin')).not.toBeNull();
    expect(rowOf('SUB-OTHER').querySelector('.animate-spin')).toBeNull();
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
    expect(screen.getByText("담긴 예약은 다시 '미제출 예약' 목록으로 돌아갑니다.")).toBeInTheDocument();
    expect(
      screen.getByText('이 작업은 되돌릴 수 없습니다. CSV 는 취소 후에도 다시 받을 수 있어요.'),
    ).toBeInTheDocument();

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

  it('제출 완료 버튼 → 확인 Dialog 제목과 안내 3줄 문구를 보여준다', () => {
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch()]));
    render(<SubmissionBatchesTab />);

    fireEvent.click(screen.getByRole('button', { name: '완료 처리' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('학교 제출을 완료하시겠습니까?')).toBeInTheDocument();
    // 두 행위 구분 경고(개편 스펙 §5) — 오프라인 제출과 시스템 완료 처리의 혼동 방지 카피.
    expect(within(dialog).getByText(/학교 제출\(오프라인\)/)).toBeInTheDocument();
    expect(within(dialog).getByText(/별개입니다/)).toBeInTheDocument();
    expect(
      within(dialog).getByText('• 제출 가능한 예약은 학교 등록 완료 상태로 변경됩니다.'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('• 이미 취소되었거나 상태가 변경된 예약은 자동으로 제외됩니다.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('• 완료된 제출 목록은 다시 취소할 수 없습니다.')).toBeInTheDocument();
  });

  it('확인 시 batchId 로 완료하고, 스킵 0 이면 완료 토스트만 띄우고 결과 Dialog 는 열지 않는다', async () => {
    mockCompleteMutateAsync.mockResolvedValue({
      totalCount: 3,
      confirmedCount: 3,
      skippedCount: 0,
      completedAt: '2026-08-01T11:00:00',
      skippedBookings: [],
    });
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch({ batchId: 9 })]));
    render(<SubmissionBatchesTab />);

    fireEvent.click(screen.getByRole('button', { name: '완료 처리' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '완료 처리' }));

    await waitFor(() => {
      expect(mockCompleteMutateAsync).toHaveBeenCalledWith({ batchId: 9 });
      expect(mockAddToast).toHaveBeenCalledWith('학교 제출이 완료되었습니다.');
    });
    expect(mockAddToast).toHaveBeenCalledTimes(1);
    // 스킵 0 은 결과 Dialog 를 열지 않는다(제외 안내 문구 없음).
    expect(screen.queryByText(/이번 제출에서 제외되었습니다/)).not.toBeInTheDocument();
  });

  it('스킵이 있으면 확인 Dialog 를 닫고 결과 Dialog 에 수치 문구와 제외 행(원문 사유)을 보여준다', async () => {
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
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch()]));
    render(<SubmissionBatchesTab />);

    fireEvent.click(screen.getByRole('button', { name: '완료 처리' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '완료 처리' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          '학교 제출이 완료되었습니다. 총 5건 중 3건이 학교 등록 완료되었습니다. 2건은 상태가 변경되어 이번 제출에서 제외되었습니다.',
        ),
      ).toBeInTheDocument();
    });
    // 목록 탭은 bookingsById 미공급 → 예약번호·원문 사유로 표기(FE 매핑 금지, reason 응답 그대로).
    expect(screen.getByText('예약 #123 · 취소됨')).toBeInTheDocument();
    expect(screen.getByText('예약 #124 · 시간이 겹치는 다른 예약이 확정됨')).toBeInTheDocument();
    // 확인 Dialog 문구는 사라진다.
    expect(screen.queryByText('학교 제출을 완료하시겠습니까?')).not.toBeInTheDocument();
  });

  it('완료 실패 시 서버 메시지를 우선한 토스트를 띄우고 확인 Dialog 를 유지한다', async () => {
    mockCompleteMutateAsync.mockRejectedValue(new Error('이미 취소된 제출 목록입니다'));
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch()]));
    render(<SubmissionBatchesTab />);

    fireEvent.click(screen.getByRole('button', { name: '완료 처리' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '완료 처리' }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('이미 취소된 제출 목록입니다', { variant: 'error' });
    });
    // 실패해도 확인 Dialog 는 닫히지 않는다.
    expect(screen.getByText('학교 제출을 완료하시겠습니까?')).toBeInTheDocument();
  });

  it('빈 목록이면 빈 상태 안내와 준비 탭 이동 링크를 보여준다', () => {
    mockBatchesQuery.mockReturnValue(listSuccess([]));
    render(<SubmissionBatchesTab />);

    expect(screen.getByText('아직 만든 제출 목록이 없어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '제출 준비로 이동' })).toHaveAttribute(
      'href',
      expect.stringContaining('/admin/facility-bookings?tab=prepare'),
    );
  });

  it('statusFilter=REVIEWING 이면 진행 중만 조회하고 빈 상태 문구도 진행 중 기준으로 바뀐다', () => {
    mockBatchesQuery.mockReturnValue(listSuccess([]));
    render(<SubmissionBatchesTab statusFilter="REVIEWING" />);

    expect(mockBatchesQuery).toHaveBeenCalledWith({ page: 0, size: 10, status: 'REVIEWING' });
    expect(screen.getByText('진행 중인 제출 목록이 없어요')).toBeInTheDocument();
  });

  it('페이지를 넘기면 다음 page 로 목록을 다시 조회한다', () => {
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch()], 2));
    render(<SubmissionBatchesTab />);

    fireEvent.click(screen.getByRole('button', { name: '2' }));

    expect(mockBatchesQuery).toHaveBeenLastCalledWith({ page: 1, size: 10 });
  });

  it('진행 중(REVIEWING) 행은 제출 정보 보기(전사 콕핏) 링크를 노출하고 상세는 없다', () => {
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch({ batchId: 55 })]));
    render(<SubmissionBatchesTab />);

    expect(screen.getByRole('link', { name: '제출 정보 보기' })).toHaveAttribute(
      'href',
      '/admin/facility-bookings/submission/55/transcribe',
    );
    expect(screen.queryByRole('link', { name: '상세' })).not.toBeInTheDocument();
  });

  it('완료·취소 행은 읽기 전용 상세 링크를 노출하고 전사 콕핏 링크는 없다', () => {
    mockBatchesQuery.mockReturnValue(
      listSuccess([makeBatch({ batchId: 55, completed: true, completedAt: '2026-08-02T09:00:00' })]),
    );
    render(<SubmissionBatchesTab statusFilter="ARCHIVED" />);

    expect(screen.getByRole('link', { name: '상세' })).toHaveAttribute(
      'href',
      '/admin/facility-bookings/submission/55',
    );
    expect(screen.queryByRole('link', { name: '제출 정보 보기' })).not.toBeInTheDocument();
  });

  it('statusFilter 를 조회 status 파라미터로 그대로 넘긴다(이력 탭 ARCHIVED 분리)', () => {
    mockBatchesQuery.mockReturnValue(listSuccess([makeBatch()]));
    render(<SubmissionBatchesTab statusFilter="ARCHIVED" />);

    // 이력 탭은 완료·취소만(ARCHIVED) 서버에서 걸러야 페이지네이션이 진행 중 배치와 어긋나지 않는다.
    expect(mockBatchesQuery).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ARCHIVED' }),
    );
  });
});
