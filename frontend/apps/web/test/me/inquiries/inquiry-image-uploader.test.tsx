import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockUploadMutateAsync = vi.fn();

vi.mock('@duing/hooks', () => ({
  useFileUploadMutation: () => ({ mutateAsync: mockUploadMutateAsync, isPending: false }),
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

/* ── 테스트 대상 ───────────────────────────────────────────── */
import { InquiryImageUploader } from '@/app/me/inquiries/_components/InquiryImageUploader';

// jsdom 은 URL.createObjectURL/revokeObjectURL 을 구현하지 않는다 — 미리보기 objectURL 생성을 스텁한다.
function makeFile(name: string, sizeBytes: number, type = 'image/png') {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

function getFileInput() {
  return screen.getByTestId('inquiry-image-uploader-input') as HTMLInputElement;
}

describe('InquiryImageUploader', () => {
  beforeEach(() => {
    mockUploadMutateAsync.mockReset();
    mockAddToast.mockReset();
    URL.createObjectURL = vi.fn(() => 'blob:mock-preview-url');
    URL.revokeObjectURL = vi.fn();
  });

  it('5장 초과 선택 시 초과분은 무시되고 onChange 는 최종 5개짜리 배열로 호출된다', async () => {
    const user = userEvent.setup();
    mockUploadMutateAsync.mockImplementation(async ({ file }: { file: File }) => ({
      storageKey: `key-${file.name}`,
      url: `https://cdn.test/${file.name}`,
    }));
    const handleChange = vi.fn();

    render(<InquiryImageUploader attachmentUrls={[]} onChange={handleChange} />);

    const files = Array.from({ length: 6 }, (_, index) => makeFile(`photo-${index}.png`, 100));
    await user.upload(getFileInput(), files);

    expect(mockUploadMutateAsync).toHaveBeenCalledTimes(5);
    expect(handleChange).toHaveBeenLastCalledWith([
      'https://cdn.test/photo-0.png',
      'https://cdn.test/photo-1.png',
      'https://cdn.test/photo-2.png',
      'https://cdn.test/photo-3.png',
      'https://cdn.test/photo-4.png',
    ]);
    expect(mockAddToast).toHaveBeenCalledWith('첨부는 최대 5장까지 가능해요', { variant: 'error' });
  });

  it('5MB 초과 파일은 업로드하지 않고 에러 토스트만 노출한다', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<InquiryImageUploader attachmentUrls={[]} onChange={handleChange} />);

    const oversizedFile = makeFile('huge.png', 5 * 1024 * 1024 + 1);
    await user.upload(getFileInput(), oversizedFile);

    expect(mockUploadMutateAsync).not.toHaveBeenCalled();
    expect(handleChange).not.toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith('5MB 이하 이미지만 업로드할 수 있어요', { variant: 'error' });
  });

  it('항목의 X 버튼을 클릭하면 해당 URL 이 제거된 배열로 onChange 가 호출된다', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <InquiryImageUploader
        attachmentUrls={['https://cdn.test/a.png', 'https://cdn.test/b.png']}
        onChange={handleChange}
      />,
    );

    const removeButtons = screen.getAllByRole('button', { name: '첨부 이미지 삭제' });
    expect(removeButtons).toHaveLength(2);
    await user.click(removeButtons[0]!);

    expect(handleChange).toHaveBeenCalledWith(['https://cdn.test/b.png']);
  });

  it('previewByUrl 매핑이 없는 기존 URL 은 placeholder 로 렌더되고 서버 URL 이 img src 로 쓰이지 않는다', () => {
    const serverUrl = 'https://cdn.test/existing.png';
    render(<InquiryImageUploader attachmentUrls={[serverUrl]} onChange={vi.fn()} />);

    expect(screen.getByText('미리보기 없음')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const images = document.querySelectorAll('img');
    images.forEach((image) => {
      expect(image.getAttribute('src')).not.toBe(serverUrl);
    });
  });
});
