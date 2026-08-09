import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockImageUploader = vi.fn();
vi.mock('../../../app/_components/ImageUploader', () => ({
  ImageUploader: (props: {
    value: string;
    onChange: (url: string) => void;
    purpose: string;
    aspectRatio?: string;
    placeholder?: string;
  }) => {
    mockImageUploader(props);
    return (
      <input
        data-testid="logo-uploader"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    );
  },
}));

vi.mock('@duing/hooks', () => ({
  useCreateClubMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useAdminUserSearchQuery: () => ({ data: undefined, isLoading: false }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { AdminClubCreateForm } from '../../../app/admin/clubs/new/_components/AdminClubCreateForm';

describe('AdminClubCreateForm', () => {
  beforeEach(() => {
    mockImageUploader.mockReset();
  });

  it('로고 이미지 영역에 ImageUploader 가 purpose="LOGO" + aspectRatio="1/1" 로 렌더된다', () => {
    render(<AdminClubCreateForm />);
    expect(screen.getByTestId('logo-uploader')).toBeInTheDocument();
    const lastCall = mockImageUploader.mock.calls.at(-1)?.[0];
    expect(lastCall?.purpose).toBe('LOGO');
    expect(lastCall?.aspectRatio).toBe('1/1');
  });

  it('URL input 이 더 이상 존재하지 않는다', () => {
    const { container } = render(<AdminClubCreateForm />);
    expect(container.querySelector('input[type="url"]')).toBeNull();
  });

  it('ImageUploader onChange 가 호출되면 다음 렌더에 새 value 가 전달된다', () => {
    render(<AdminClubCreateForm />);
    const input = screen.getByTestId('logo-uploader');
    fireEvent.change(input, { target: { value: 'https://storage.example.com/x.jpg' } });
    const lastCall = mockImageUploader.mock.calls.at(-1)?.[0];
    expect(lastCall?.value).toBe('https://storage.example.com/x.jpg');
  });

  it('중앙동아리 체크를 해제하면 단과대학과 학과 입력이 나타난다', () => {
    render(<AdminClubCreateForm />);
    expect(screen.getByText('단과대학')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('예: 회계학과 (선택)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.queryByPlaceholderText('예: 회계학과 (선택)')).toBeNull();
    expect(screen.getByText('분과')).toBeInTheDocument();
  });

  it('단과대학을 고르지 않고 제출하면 단과대학 선택을 요구한다', () => {
    render(<AdminClubCreateForm />);
    fireEvent.change(screen.getByPlaceholderText('예: 두잉 코딩 동아리'), {
      target: { value: '회계연구회' },
    });
    fireEvent.click(screen.getByRole('button', { name: '등록' }));

    expect(screen.getByText('단과대 동아리는 단과대학을 선택해주세요.')).toBeInTheDocument();
  });
});
