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
});
