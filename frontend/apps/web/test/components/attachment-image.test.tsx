import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FederationInquiryAttachment } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockUseFederationInquiryAttachmentQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useFederationInquiryAttachmentQuery: (...args: unknown[]) =>
    mockUseFederationInquiryAttachmentQuery(...args),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

/* ── 테스트 대상 ───────────────────────────────────────────── */
import { AttachmentImage } from '@/app/_components/AttachmentImage';

const INQUIRY_ID = 42;

const attachment: FederationInquiryAttachment = {
  id: 7,
  fileName: '증빙사진.png',
  contentType: 'image/png',
  fileSize: 1024,
};

describe('AttachmentImage', () => {
  beforeEach(() => {
    mockUseFederationInquiryAttachmentQuery.mockReset();
    // jsdom 은 URL.createObjectURL/revokeObjectURL 을 구현하지 않는다 — Blob → objectURL 변환을 스텁한다.
    URL.createObjectURL = vi.fn(() => 'blob:mock-attachment-url');
    URL.revokeObjectURL = vi.fn();
  });

  it('쿼리 성공(Blob) 시 objectURL 을 src 로 하는 img 가 alt=fileName 으로 렌더된다', async () => {
    const blob = new Blob(['image-bytes'], { type: 'image/png' });
    mockUseFederationInquiryAttachmentQuery.mockReturnValue({
      data: blob,
      isLoading: false,
      isError: false,
    });

    render(<AttachmentImage inquiryId={INQUIRY_ID} attachment={attachment} />);

    const image = await screen.findByAltText('증빙사진.png');
    expect(image).toHaveAttribute('src', 'blob:mock-attachment-url');
  });

  it('로딩 중이면 스켈레톤(aria-hidden)을 렌더한다', () => {
    mockUseFederationInquiryAttachmentQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<AttachmentImage inquiryId={INQUIRY_ID} attachment={attachment} />);

    expect(screen.queryByAltText('증빙사진.png')).not.toBeInTheDocument();
    const skeleton = container.querySelector('[aria-hidden]');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveClass('animate-pulse');
  });

  it('에러 시 fileName 텍스트로 폴백한다', async () => {
    mockUseFederationInquiryAttachmentQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<AttachmentImage inquiryId={INQUIRY_ID} attachment={attachment} />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: '증빙사진.png' })).toHaveTextContent('증빙사진.png');
    });
  });
});
