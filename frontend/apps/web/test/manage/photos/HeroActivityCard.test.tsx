import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockCreateMutateAsync = vi.fn();
const mockUpdateMutateAsync = vi.fn();
const mockDeleteMutateAsync = vi.fn();

vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useCreateHeroActivityMutation: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
  useUpdateHeroActivityMutation: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
  useDeleteHeroActivityMutation: () => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

import { HeroActivityCard } from '@/app/_components/HeroActivityCard';
import { HeroActivityEditor } from '../../../app/manage/clubs/[clubId]/photos/_components/HeroActivityEditor';

beforeEach(() => {
  mockCreateMutateAsync.mockReset().mockResolvedValue(undefined);
  mockUpdateMutateAsync.mockReset().mockResolvedValue(undefined);
  mockDeleteMutateAsync.mockReset().mockResolvedValue(undefined);
});

describe('HeroActivityCard', () => {
  it('번호 배지·플레이스홀더(빈 제목/사진)와 입력된 제목·설명을 렌더한다', () => {
    const { rerender } = render(
      <HeroActivityCard slotNumber={3} imageUrl={null} title="" description="" />,
    );
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('사진을 선택하세요')).toBeInTheDocument();
    expect(screen.getByText('제목')).toBeInTheDocument();

    rerender(
      <HeroActivityCard
        slotNumber={3}
        imageUrl="https://cdn.example.com/a.jpg"
        title="봄 워크숍"
        description="1박 2일 신입 MT"
      />,
    );
    expect(screen.getByText('봄 워크숍')).toBeInTheDocument();
    expect(screen.getByText('1박 2일 신입 MT')).toBeInTheDocument();
  });

  it('slotNumber 미전달 시 번호 배지를 렌더하지 않는다(학생 화면)', () => {
    render(<HeroActivityCard imageUrl="a.jpg" title="데모데이" description="설명" />);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('size big 이면 제목이 확대 스케일로 렌더된다', () => {
    render(<HeroActivityCard imageUrl="a.jpg" title="데모데이" description="설명" size="big" />);
    expect(screen.getByText('데모데이').className).toContain('text-[22px]');
  });
});

describe('HeroActivityEditor (신규 슬롯)', () => {
  it('제목이 비어 있으면 인라인 에러를 보이고 create 를 호출하지 않는다', () => {
    render(
      <HeroActivityEditor
        clubId={1}
        slotNumber={2}
        hero={null}
        pendingPhoto={{ clubPhotoId: 55, storageKey: 'k/55.jpg' }}
        dragHandle={<span data-testid="handle" />}
        onPickPhoto={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('설명'), { target: { value: '설명입니다' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(screen.getByText('제목을 입력해주세요.')).toBeInTheDocument();
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  });

  it('저장 성공 시 displayOrder=slotNumber 페이로드로 create 를 호출하고 onSaved 를 부른다', async () => {
    const onSaved = vi.fn();
    render(
      <HeroActivityEditor
        clubId={1}
        slotNumber={4}
        hero={null}
        pendingPhoto={{ clubPhotoId: 77, storageKey: 'k/77.jpg' }}
        dragHandle={<span data-testid="handle" />}
        onPickPhoto={() => {}}
        onSaved={onSaved}
      />,
    );
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '여름 캠프' } });
    fireEvent.change(screen.getByLabelText('설명'), { target: { value: '해변에서 1박' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        clubPhotoId: 77,
        title: '여름 캠프',
        description: '해변에서 1박',
        displayOrder: 4,
      }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
