import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockMutateAsync = vi.fn();
const mockUseFileUploadMutation = vi.fn();

vi.mock('@duing/hooks', () => ({
  useFileUploadMutation: () => mockUseFileUploadMutation(),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { ImageUploader } from '../../app/_components/ImageUploader';
import { IMAGE_UPLOAD_POLICY } from '../../app/_components/imageUploadPolicy';

function setMutationState(state: {
  isPending?: boolean;
  isError?: boolean;
  errorMessage?: string;
}) {
  mockUseFileUploadMutation.mockReturnValue({
    mutateAsync: mockMutateAsync,
    isPending: state.isPending ?? false,
    isError: state.isError ?? false,
    error: state.errorMessage ? new Error(state.errorMessage) : null,
  });
}

function makeFile(name: string, type: string, size: number): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe('ImageUploader', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset();
    mockUseFileUploadMutation.mockReset();
    setMutationState({});
  });

  it('5MB + 1 byte 파일을 선택하면 inline 에러를 표시하고 서버 호출이 일어나지 않는다', async () => {
    const onChange = vi.fn();
    render(<ImageUploader value="" onChange={onChange} purpose="NOTICE_COVER" />);
    const input = screen.getByTestId('image-uploader-input') as HTMLInputElement;
    const oversize = makeFile('big.jpg', 'image/jpeg', IMAGE_UPLOAD_POLICY.maxBytes + 1);
    fireEvent.change(input, { target: { files: [oversize] } });
    expect(await screen.findByText(/5MB 이하여야 합니다/)).toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('image/gif 파일을 선택하면 inline 에러를 표시한다', async () => {
    const onChange = vi.fn();
    render(<ImageUploader value="" onChange={onChange} purpose="NOTICE_COVER" />);
    const input = screen.getByTestId('image-uploader-input') as HTMLInputElement;
    const gif = makeFile('a.gif', 'image/gif', 1024);
    fireEvent.change(input, { target: { files: [gif] } });
    expect(await screen.findByText(/지원하지 않는 이미지 형식/)).toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('정상 JPG 를 선택하면 mutateAsync 호출 후 onChange 가 발생한다', async () => {
    const onChange = vi.fn();
    mockMutateAsync.mockResolvedValue({ url: 'https://cdn.example.com/uploaded.jpg' });
    render(<ImageUploader value="" onChange={onChange} purpose="NOTICE_COVER" />);
    const input = screen.getByTestId('image-uploader-input') as HTMLInputElement;
    const jpg = makeFile('a.jpg', 'image/jpeg', 1024);
    fireEvent.change(input, { target: { files: [jpg] } });
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({ file: jpg, purpose: 'NOTICE_COVER' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://cdn.example.com/uploaded.jpg'));
  });

  it('서버 에러 메시지를 그대로 표시한다', () => {
    setMutationState({ isError: true, errorMessage: '이미지 크기는 5MB 이하여야 합니다.' });
    render(<ImageUploader value="" onChange={vi.fn()} purpose="NOTICE_COVER" />);
    expect(screen.getByText('이미지 크기는 5MB 이하여야 합니다.')).toBeInTheDocument();
  });

  it('value 가 있으면 제거 버튼을 노출하고 클릭 시 onChange("") 호출', () => {
    const onChange = vi.fn();
    render(<ImageUploader value="https://cdn.example.com/x.jpg" onChange={onChange} purpose="NOTICE_COVER" />);
    fireEvent.click(screen.getByRole('button', { name: '제거' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('aspectRatio="1/1" 가 전달되면 컨테이너에 aspect-square 클래스가 적용된다', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ImageUploader value="" onChange={onChange} purpose="LOGO" aspectRatio="1/1" placeholder="로고" />,
    );
    expect(container.querySelector('.aspect-square')).not.toBeNull();
    expect(container.querySelector('.aspect-\\[16\\/9\\]')).toBeNull();
  });
});

describe('ImageUploader (floating variant)', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset();
    mockUseFileUploadMutation.mockReset();
    setMutationState({});
  });

  it('교체 버튼 클릭 시 숨겨진 파일 선택 input 이 열린다', () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
    render(
      <ImageUploader variant="floating" value="https://cdn.example.com/x.jpg" onChange={vi.fn()} purpose="COVER" />,
    );
    fireEvent.click(screen.getByRole('button', { name: '이미지 교체' }));
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('제거 버튼 클릭 시 onChange("") 가 호출된다', () => {
    const onChange = vi.fn();
    render(
      <ImageUploader variant="floating" value="https://cdn.example.com/x.jpg" onChange={onChange} purpose="COVER" />,
    );
    fireEvent.click(screen.getByRole('button', { name: '이미지 제거' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('업로드 중이면 교체·제거 버튼이 모두 disabled 된다', () => {
    setMutationState({ isPending: true });
    render(
      <ImageUploader variant="floating" value="https://cdn.example.com/x.jpg" onChange={vi.fn()} purpose="COVER" />,
    );
    expect(screen.getByRole('button', { name: '이미지 교체' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '이미지 제거' })).toBeDisabled();
  });

  it('value 가 없으면 제거 버튼을 노출하지 않는다', () => {
    render(<ImageUploader variant="floating" value="" onChange={vi.fn()} purpose="LOGO" dense />);
    expect(screen.getByRole('button', { name: '이미지 교체' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '이미지 제거' })).toBeNull();
  });
});
