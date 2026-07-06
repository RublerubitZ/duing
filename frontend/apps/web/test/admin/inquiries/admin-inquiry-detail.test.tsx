import { render, screen, waitFor, within } from '@testing-library/react';
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
const mockUseFederationInquiryAttachmentQuery = vi.fn();

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
  // AttachmentImage(첨부 그리드)가 내부에서 사용 — 이 파일의 테스트는 첨부 렌더 여부만 확인한다.
  useFederationInquiryAttachmentQuery: (...args: unknown[]) => mockUseFederationInquiryAttachmentQuery(...args),
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
    attachments: [],
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
    mockUseFederationInquiryAttachmentQuery.mockReset();
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
        payload: { content: '테스트 답변 내용', version: 3 },
      });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('답변 등록에 실패했습니다.');
    expect(textarea).toHaveValue('테스트 답변 내용');
  });

  it('IN_PROGRESS 문의에는 접수로 되돌리기 버튼이 노출된다', () => {
    mockUseAdminFederationInquiryDetailQuery.mockReturnValue(
      detailSuccess(makeAdminDetail({ status: 'IN_PROGRESS' })),
    );

    render(<AdminInquiryDetailPage inquiryId={INQUIRY_ID} />);

    expect(screen.getByRole('button', { name: '접수로 되돌리기' })).toBeInTheDocument();
  });

  it('RECEIVED 문의에는 접수로 되돌리기 버튼이 노출되지 않는다', () => {
    mockUseAdminFederationInquiryDetailQuery.mockReturnValue(
      detailSuccess(makeAdminDetail({ status: 'RECEIVED' })),
    );

    render(<AdminInquiryDetailPage inquiryId={INQUIRY_ID} />);

    expect(screen.queryByRole('button', { name: '접수로 되돌리기' })).not.toBeInTheDocument();
  });

  it('접수로 되돌리기를 클릭하면 RECEIVED 전환이 현재 version과 함께 요청되고 성공 토스트가 뜬다', async () => {
    const user = userEvent.setup();
    mockUseAdminFederationInquiryDetailQuery.mockReturnValue(
      detailSuccess(makeAdminDetail({ status: 'IN_PROGRESS', version: 3 })),
    );
    mockChangeStatusMutateAsync.mockResolvedValue(undefined);

    render(<AdminInquiryDetailPage inquiryId={INQUIRY_ID} />);

    await user.click(screen.getByRole('button', { name: '접수로 되돌리기' }));

    await waitFor(() => {
      expect(mockChangeStatusMutateAsync).toHaveBeenCalledWith({
        inquiryId: INQUIRY_ID,
        payload: { status: 'RECEIVED', version: 3 },
      });
    });
    expect(mockAddToast).toHaveBeenCalledWith('접수 상태로 되돌렸어요');
  });

  it('되돌리기 409 충돌 시 최신 version으로 정확히 1회 재시도한다', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue({ data: makeAdminDetail({ status: 'IN_PROGRESS', version: 4 }) });
    mockUseAdminFederationInquiryDetailQuery.mockReturnValue(
      detailSuccess(makeAdminDetail({ status: 'IN_PROGRESS', version: 3 }), refetch),
    );
    mockChangeStatusMutateAsync
      .mockRejectedValueOnce(new ApiError(409, '문의가 이미 처리 중입니다.', undefined, undefined))
      .mockResolvedValueOnce(undefined);

    render(<AdminInquiryDetailPage inquiryId={INQUIRY_ID} />);

    await user.click(screen.getByRole('button', { name: '접수로 되돌리기' }));

    await waitFor(() => expect(mockChangeStatusMutateAsync).toHaveBeenCalledTimes(2));
    expect(mockChangeStatusMutateAsync).toHaveBeenNthCalledWith(1, {
      inquiryId: INQUIRY_ID,
      payload: { status: 'RECEIVED', version: 3 },
    });
    expect(mockChangeStatusMutateAsync).toHaveBeenNthCalledWith(2, {
      inquiryId: INQUIRY_ID,
      payload: { status: 'RECEIVED', version: 4 },
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('문의 종결 확인 시 현재 version이 함께 전송된다', async () => {
    const user = userEvent.setup();
    mockUseAdminFederationInquiryDetailQuery.mockReturnValue(
      detailSuccess(makeAdminDetail({ status: 'RECEIVED', version: 3 })),
    );
    mockChangeStatusMutateAsync.mockResolvedValue(undefined);

    render(<AdminInquiryDetailPage inquiryId={INQUIRY_ID} />);

    await user.click(screen.getByRole('button', { name: '종료' }));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '종료' }));

    await waitFor(() => {
      expect(mockChangeStatusMutateAsync).toHaveBeenCalledWith({
        inquiryId: INQUIRY_ID,
        payload: { status: 'CLOSED', closedReason: undefined, version: 3 },
      });
    });
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

  it('attachments 가 있는 detail 이면 첨부 이미지 그리드가 렌더된다', () => {
    mockUseFederationInquiryAttachmentQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    mockUseAdminFederationInquiryDetailQuery.mockReturnValue(
      detailSuccess(
        makeAdminDetail({
          attachments: [
            { id: 1, fileName: '증빙1.png', contentType: 'image/png', fileSize: 100 },
            { id: 2, fileName: '증빙2.png', contentType: 'image/png', fileSize: 200 },
          ],
        }),
      ),
    );

    render(<AdminInquiryDetailPage inquiryId={INQUIRY_ID} />);

    expect(screen.getByText('첨부 이미지')).toBeInTheDocument();
    expect(screen.getByText('증빙1.png')).toBeInTheDocument();
    expect(screen.getByText('증빙2.png')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });
});
