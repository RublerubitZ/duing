import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ApiError } from '@duing/api';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockCreateMutateAsync = vi.fn();
// InquiryCreatePage 가 렌더하는 InquiryImageUploader 가 내부에서 사용.
const mockUploadMutateAsync = vi.fn();

vi.mock('@duing/hooks', () => ({
  useCreateFederationInquiryMutation: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
  useFileUploadMutation: () => ({ mutateAsync: mockUploadMutateAsync, isPending: false }),
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
  useOptionalToast: () => mockAddToast,
}));

const mockRouterPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

/* ── 테스트 대상 ───────────────────────────────────────────── */
import { InquiryCreatePage } from '@/app/me/inquiries/new/_pages/InquiryCreatePage';

async function fillAndSubmit(title: string, content: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('제목'), title);
  await user.type(screen.getByLabelText('내용'), content);
  await user.click(screen.getByRole('button', { name: '등록' }));
}

function makeFile(name: string, sizeBytes = 100, type = 'image/png') {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

describe('InquiryCreatePage', () => {
  beforeEach(() => {
    mockCreateMutateAsync.mockReset();
    mockUploadMutateAsync.mockReset();
    mockAddToast.mockReset();
    mockRouterPush.mockReset();
    // jsdom 은 URL.createObjectURL/revokeObjectURL 을 구현하지 않는다 — 업로더의 미리보기 생성을 스텁한다.
    URL.createObjectURL = vi.fn(() => 'blob:mock-preview-url');
    URL.revokeObjectURL = vi.fn();
  });

  it('제출하면 create mutateAsync 가 {title, content} 로 호출된다', async () => {
    mockCreateMutateAsync.mockResolvedValue(1);
    render(<InquiryCreatePage />);

    await fillAndSubmit('문의 제목입니다', '문의 내용입니다');

    expect(mockCreateMutateAsync).toHaveBeenCalledWith({
      title: '문의 제목입니다',
      content: '문의 내용입니다',
    });
  });

  it('성공하면 생성된 문의 상세로 이동한다', async () => {
    mockCreateMutateAsync.mockResolvedValue(55);
    render(<InquiryCreatePage />);

    await fillAndSubmit('문의 제목입니다', '문의 내용입니다');

    expect(mockRouterPush).toHaveBeenCalledWith('/me/inquiries/55');
  });

  it('첨부 이미지 2개를 올린 상태로 제출하면 create mutateAsync 인자에 attachmentUrls 2개가 포함된다', async () => {
    const user = userEvent.setup();
    mockCreateMutateAsync.mockResolvedValue(1);
    mockUploadMutateAsync.mockImplementation(async ({ file }: { file: File }) => ({
      storageKey: `key-${file.name}`,
      url: `https://cdn.test/${file.name}`,
    }));
    render(<InquiryCreatePage />);

    const fileInput = screen.getByTestId('inquiry-image-uploader-input');
    await user.upload(fileInput, [makeFile('a.png'), makeFile('b.png')]);

    await fillAndSubmit('문의 제목입니다', '문의 내용입니다');

    expect(mockCreateMutateAsync).toHaveBeenCalledWith({
      title: '문의 제목입니다',
      content: '문의 내용입니다',
      attachmentUrls: ['https://cdn.test/a.png', 'https://cdn.test/b.png'],
    });
  });

  it('처리 대기 문의 초과(409) 시 배너(role=alert)에 에러 메시지가 노출된다', async () => {
    mockCreateMutateAsync.mockRejectedValue(
      new ApiError(409, '처리 대기 중인 문의가 많아 새 문의를 등록할 수 없습니다.', undefined, undefined),
    );
    render(<InquiryCreatePage />);

    await fillAndSubmit('문의 제목입니다', '문의 내용입니다');

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('처리 대기 중인 문의가 많아 새 문의를 등록할 수 없습니다.');
  });
});
