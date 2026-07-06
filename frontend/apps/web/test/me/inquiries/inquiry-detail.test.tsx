import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FederationInquiryDetail } from '@duing/types';

import { ApiError } from '@duing/api';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const mockUseFederationInquiryDetailQuery = vi.fn();
const mockUpdateMutateAsync = vi.fn();
const mockUseFederationInquiryAttachmentQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useFederationInquiryDetailQuery: (...args: unknown[]) => mockUseFederationInquiryDetailQuery(...args),
  useUpdateFederationInquiryMutation: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
  useDeleteFederationInquiryMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // AttachmentImage(첨부 그리드)가 내부에서 사용 — 이 파일의 테스트는 첨부 렌더 개수만 확인한다.
  useFederationInquiryAttachmentQuery: (...args: unknown[]) => mockUseFederationInquiryAttachmentQuery(...args),
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

/* ── 테스트 대상 ───────────────────────────────────────────── */
import { InquiryDetailPage } from '@/app/me/inquiries/[inquiryId]/_pages/InquiryDetailPage';

const INQUIRY_ID = 10;

function makeDetail(overrides: Partial<FederationInquiryDetail> = {}): FederationInquiryDetail {
  return {
    id: INQUIRY_ID,
    title: '동아리 등록 절차 문의',
    content: '동아리 등록 절차가 궁금합니다.',
    status: 'RECEIVED',
    createdAt: '2026-06-01T00:00:00Z',
    closedReason: null,
    answer: null,
    attachments: [],
    ...overrides,
  };
}

function detailSuccess(detail: FederationInquiryDetail) {
  return { data: detail, isLoading: false, isError: false, error: null, refetch: vi.fn() };
}

describe('InquiryDetailPage', () => {
  beforeEach(() => {
    mockUseFederationInquiryDetailQuery.mockReset();
    mockUpdateMutateAsync.mockReset();
    mockUseFederationInquiryAttachmentQuery.mockReset();
    mockAddToast.mockReset();
  });

  it('RECEIVED 상태이면 수정·삭제 버튼과 "방학 중" 안내가 노출된다', () => {
    mockUseFederationInquiryDetailQuery.mockReturnValue(detailSuccess(makeDetail({ status: 'RECEIVED' })));

    render(<InquiryDetailPage inquiryId={INQUIRY_ID} />);

    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
    expect(screen.getByText(/방학 중/)).toBeInTheDocument();
  });

  it('IN_PROGRESS 상태이면 수정 버튼은 노출되지 않고 "작성 중" 안내가 노출된다', () => {
    mockUseFederationInquiryDetailQuery.mockReturnValue(detailSuccess(makeDetail({ status: 'IN_PROGRESS' })));

    render(<InquiryDetailPage inquiryId={INQUIRY_ID} />);

    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
    expect(screen.getByText(/작성 중/)).toBeInTheDocument();
  });

  it('CLOSED + 답변 없음이면 "답변 없이 종료된" 문구와 closedReason 이 노출된다', () => {
    mockUseFederationInquiryDetailQuery.mockReturnValue(
      detailSuccess(
        makeDetail({
          status: 'CLOSED',
          answer: null,
          closedReason: '문의 내용을 확인할 수 없습니다.',
        }),
      ),
    );

    render(<InquiryDetailPage inquiryId={INQUIRY_ID} />);

    expect(screen.getByText(/답변 없이 종료된/)).toBeInTheDocument();
    expect(screen.getByText('종료 사유: 문의 내용을 확인할 수 없습니다.')).toBeInTheDocument();
  });

  it('ANSWERED 이면 답변 카드에 "총동아리연합회" 가 노출된다', () => {
    mockUseFederationInquiryDetailQuery.mockReturnValue(
      detailSuccess(
        makeDetail({
          status: 'ANSWERED',
          answer: {
            content: '문의 주신 내용 확인했습니다.',
            answeredAt: '2026-06-05T00:00:00Z',
            updatedAt: '2026-06-05T00:00:00Z',
          },
        }),
      ),
    );

    render(<InquiryDetailPage inquiryId={INQUIRY_ID} />);

    expect(screen.getByText('총동아리연합회')).toBeInTheDocument();
    expect(screen.getByText('문의 주신 내용 확인했습니다.')).toBeInTheDocument();
  });

  it('detailQuery 가 에러(404 등)이면 "문의를 찾을 수 없습니다" 와 목록 링크가 노출된다', () => {
    mockUseFederationInquiryDetailQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(404, '문의를 찾을 수 없습니다.'),
      refetch: vi.fn(),
    });

    render(<InquiryDetailPage inquiryId={INQUIRY_ID} />);

    expect(screen.getByText('문의를 찾을 수 없습니다.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← 내 문의 목록으로' })).toHaveAttribute(
      'href',
      '/me/inquiries',
    );
  });

  it('attachments 2개인 detail 이면 첨부 이미지 2개가 렌더된다', () => {
    mockUseFederationInquiryAttachmentQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    mockUseFederationInquiryDetailQuery.mockReturnValue(
      detailSuccess(
        makeDetail({
          attachments: [
            { id: 1, fileName: '사진1.png', contentType: 'image/png', fileSize: 100 },
            { id: 2, fileName: '사진2.png', contentType: 'image/png', fileSize: 200 },
          ],
        }),
      ),
    );

    render(<InquiryDetailPage inquiryId={INQUIRY_ID} />);

    expect(screen.getByText('사진1.png')).toBeInTheDocument();
    expect(screen.getByText('사진2.png')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('수정 모드에서 첨부 변경 토글을 켜지 않고 저장하면 update payload 에 attachmentUrls 필드가 없다', async () => {
    const user = userEvent.setup();
    mockUpdateMutateAsync.mockResolvedValue(undefined);
    mockUseFederationInquiryDetailQuery.mockReturnValue(
      detailSuccess(makeDetail({ status: 'RECEIVED' })),
    );

    render(<InquiryDetailPage inquiryId={INQUIRY_ID} />);

    await user.click(screen.getByRole('button', { name: '수정' }));
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1));
    const lastCall = mockUpdateMutateAsync.mock.calls.at(-1)?.[0];
    expect(lastCall?.payload).not.toHaveProperty('attachmentUrls');
  });
});
