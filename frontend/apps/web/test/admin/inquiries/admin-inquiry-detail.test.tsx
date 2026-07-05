import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AdminFederationInquiryDetail } from '@duing/types';

import { ApiError } from '@duing/api';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const mockUseAdminFederationInquiryDetailQuery = vi.fn();
const mockChangeStatusMutateAsync = vi.fn();
const mockAnswerMutateAsync = vi.fn();
const mockUpdateAnswerMutateAsync = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminFederationInquiryDetailQuery: (...args: unknown[]) =>
    mockUseAdminFederationInquiryDetailQuery(...args),
  useChangeFederationInquiryStatusMutation: () => ({
    mutateAsync: mockChangeStatusMutateAsync,
    isPending: false,
  }),
  useAnswerFederationInquiryMutation: () => ({ mutateAsync: mockAnswerMutateAsync, isPending: false }),
  useUpdateFederationInquiryAnswerMutation: () => ({
    mutateAsync: mockUpdateAnswerMutateAsync,
    isPending: false,
  }),
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

/* ── 테스트 대상 ───────────────────────────────────────────── */
import { AdminInquiryDetailPage } from '@/app/admin/inquiries/[inquiryId]/_pages/AdminInquiryDetailPage';

const INQUIRY_ID = 77;

function makeAdminDetail(overrides: Partial<AdminFederationInquiryDetail> = {}): AdminFederationInquiryDetail {
  return {
    id: INQUIRY_ID,
    title: '동아리 등록 문의',
    content: '동아리 등록 절차가 궁금합니다.',
    status: 'RECEIVED',
    version: 3,
    authorName: '김두잉',
    authorStudentId: '2021123456',
    createdAt: '2026-06-01T00:00:00Z',
    answeredAt: null,
    closedReason: null,
    answer: null,
    ...overrides,
  };
}

function detailSuccess(detail: AdminFederationInquiryDetail, refetch = vi.fn()) {
  return { data: detail, isLoading: false, isError: false, error: null, refetch };
}

describe('AdminInquiryDetailPage', () => {
  beforeEach(() => {
    mockUseAdminFederationInquiryDetailQuery.mockReset();
    mockChangeStatusMutateAsync.mockReset();
    mockAnswerMutateAsync.mockReset();
    mockUpdateAnswerMutateAsync.mockReset();
    mockAddToast.mockReset();
  });

  it('RECEIVED 상태에서 "답변 작성" 클릭 시 changeStatus mutateAsync 가 {status: IN_PROGRESS, version: 현재값} 으로 호출된다', async () => {
    const user = userEvent.setup();
    mockUseAdminFederationInquiryDetailQuery.mockReturnValue(
      detailSuccess(makeAdminDetail({ version: 3 })),
    );
    mockChangeStatusMutateAsync.mockResolvedValue(undefined);

    render(<AdminInquiryDetailPage inquiryId={INQUIRY_ID} />);

    await user.click(screen.getByRole('button', { name: '답변 작성' }));

    await waitFor(() => {
      expect(mockChangeStatusMutateAsync).toHaveBeenCalledWith({
        inquiryId: INQUIRY_ID,
        payload: { status: 'IN_PROGRESS', version: 3 },
      });
    });
  });

  it('409(version 충돌) 시 refetch 로 얻은 fresh version 으로 정확히 1회 재시도한다', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue({ data: makeAdminDetail({ version: 4 }) });
    mockUseAdminFederationInquiryDetailQuery.mockReturnValue(
      detailSuccess(makeAdminDetail({ version: 3 }), refetch),
    );
    mockChangeStatusMutateAsync
      .mockRejectedValueOnce(new ApiError(409, '문의가 이미 처리 중입니다.', undefined, undefined))
      .mockResolvedValueOnce(undefined);

    render(<AdminInquiryDetailPage inquiryId={INQUIRY_ID} />);

    await user.click(screen.getByRole('button', { name: '답변 작성' }));

    await waitFor(() => expect(mockChangeStatusMutateAsync).toHaveBeenCalledTimes(2));
    expect(mockChangeStatusMutateAsync).toHaveBeenNthCalledWith(1, {
      inquiryId: INQUIRY_ID,
      payload: { status: 'IN_PROGRESS', version: 3 },
    });
    expect(mockChangeStatusMutateAsync).toHaveBeenNthCalledWith(2, {
      inquiryId: INQUIRY_ID,
      payload: { status: 'IN_PROGRESS', version: 4 },
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('IN_PROGRESS 상태에서 답변 제출이 실패하면 textarea 값이 유지된다', async () => {
    const user = userEvent.setup();
    mockUseAdminFederationInquiryDetailQuery.mockReturnValue(
      detailSuccess(makeAdminDetail({ status: 'IN_PROGRESS' })),
    );
    mockAnswerMutateAsync.mockRejectedValue(new ApiError(500, '답변 등록에 실패했습니다.'));

    render(<AdminInquiryDetailPage inquiryId={INQUIRY_ID} />);

    const textarea = screen.getByLabelText('답변 내용');
    await user.type(textarea, '테스트 답변 내용');
    await user.click(screen.getByRole('button', { name: '답변 등록' }));

    await waitFor(() => {
      expect(mockAnswerMutateAsync).toHaveBeenCalledWith({
        inquiryId: INQUIRY_ID,
        payload: { content: '테스트 답변 내용' },
      });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('답변 등록에 실패했습니다.');
    expect(textarea).toHaveValue('테스트 답변 내용');
  });

  it('detail 조회가 410(INQUIRY_DELETED) 이면 "작성자가 삭제한 문의입니다" 를 보여준다', () => {
    mockUseAdminFederationInquiryDetailQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(410, '삭제된 문의입니다.', undefined, 'INQUIRY_DELETED'),
      refetch: vi.fn(),
    });

    render(<AdminInquiryDetailPage inquiryId={INQUIRY_ID} />);

    expect(screen.getByText('작성자가 삭제한 문의입니다')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← 목록으로' })).toHaveAttribute('href', '/admin/inquiries');
  });
});
