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
// 편집 모드에서 첨부 변경 토글을 켜면 실제 InquiryImageUploader 가 렌더되며 사용한다.
const mockUploadMutateAsync = vi.fn();

vi.mock('@duing/hooks', async (importOriginal) => ({
  // 날짜 유틸(formatDateKst 등) 순수 함수는 실제 구현을 그대로 쓴다.
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useFederationInquiryDetailQuery: (...args: unknown[]) => mockUseFederationInquiryDetailQuery(...args),
  useUpdateFederationInquiryMutation: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
  useDeleteFederationInquiryMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // AttachmentImage(첨부 그리드)가 내부에서 사용 — 이 파일의 테스트는 첨부 렌더 개수만 확인한다.
  useFederationInquiryAttachmentQuery: (...args: unknown[]) => mockUseFederationInquiryAttachmentQuery(...args),
  useFileUploadMutation: () => ({ mutateAsync: mockUploadMutateAsync, isPending: false }),
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
  useOptionalToast: () => mockAddToast,
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
    mockUploadMutateAsync.mockReset();
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

  it('첨부 변경 토글을 켜고 업로드 없이 저장하면 update payload 의 attachmentUrls 는 빈 배열로 전송된다', async () => {
    const user = userEvent.setup();
    mockUpdateMutateAsync.mockResolvedValue(undefined);
    mockUseFederationInquiryAttachmentQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    mockUseFederationInquiryDetailQuery.mockReturnValue(
      detailSuccess(
        makeDetail({
          status: 'RECEIVED',
          attachments: [{ id: 1, fileName: '사진1.png', contentType: 'image/png', fileSize: 100 }],
        }),
      ),
    );

    render(<InquiryDetailPage inquiryId={INQUIRY_ID} />);

    await user.click(screen.getByRole('button', { name: '수정' }));
    await user.click(screen.getByRole('button', { name: '첨부 변경' }));
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1));
    const lastCall = mockUpdateMutateAsync.mock.calls.at(-1)?.[0];
    expect(lastCall?.payload).toMatchObject({ attachmentUrls: [] });
  });

  it('첨부 변경 토글 ON + 미업로드 상태이면 "기존 첨부가 모두 삭제됩니다" 경고가 노출된다', async () => {
    const user = userEvent.setup();
    mockUseFederationInquiryAttachmentQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    mockUseFederationInquiryDetailQuery.mockReturnValue(
      detailSuccess(
        makeDetail({
          status: 'RECEIVED',
          attachments: [{ id: 1, fileName: '사진1.png', contentType: 'image/png', fileSize: 100 }],
        }),
      ),
    );

    render(<InquiryDetailPage inquiryId={INQUIRY_ID} />);

    await user.click(screen.getByRole('button', { name: '수정' }));
    expect(
      screen.queryByText('새 첨부가 없어 저장하면 기존 첨부가 모두 삭제됩니다'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '첨부 변경' }));

    expect(
      screen.getByText('새 첨부가 없어 저장하면 기존 첨부가 모두 삭제됩니다'),
    ).toBeInTheDocument();
  });
});
