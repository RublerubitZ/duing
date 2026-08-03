import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import type { ClubPhoto } from '@duing/types';

const mockUpdateMutateAsync = vi.fn();
const mockDeleteMutateAsync = vi.fn();

vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useUpdatePhotoMutation: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
  useDeletePhotoMutation: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false }),
}));

import { ActivityPhotoCard } from '../../../app/manage/clubs/[clubId]/photos/_components/ActivityPhotoCard';

function makePhoto(overrides: Partial<ClubPhoto> = {}): ClubPhoto {
  return {
    id: 42,
    storageKey: 'https://cdn.example.com/42.jpg',
    caption: '기존 캡션',
    width: null,
    height: null,
    displayOrder: 0,
    ...overrides,
  };
}

function renderCard(props: {
  photo?: ClubPhoto;
  onPromote?: (photo: ClubPhoto) => void;
  promoteDisabled?: boolean;
  alreadyFeatured?: boolean;
}) {
  const photo = props.photo ?? makePhoto();
  return render(
    <DndContext>
      <SortableContext items={[photo.id]}>
        <ActivityPhotoCard
          clubId={1}
          photo={photo}
          onPromote={props.onPromote ?? (() => {})}
          promoteDisabled={props.promoteDisabled ?? false}
          alreadyFeatured={props.alreadyFeatured ?? false}
        />
      </SortableContext>
    </DndContext>,
  );
}

beforeEach(() => {
  mockUpdateMutateAsync.mockReset().mockResolvedValue(undefined);
  mockDeleteMutateAsync.mockReset().mockResolvedValue(undefined);
});

describe('ActivityPhotoCard', () => {
  it('대표로 지정·캡션·삭제·드래그 핸들 액션을 노출한다', () => {
    renderCard({});
    expect(screen.getByRole('button', { name: '대표로 지정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '캡션 편집' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사진 삭제' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '드래그하여 순서 변경' })).toBeInTheDocument();
  });

  it('빈 슬롯이 없으면 대표로 지정이 비활성·안내 title 을 갖고 onPromote 를 부르지 않는다', () => {
    const onPromote = vi.fn();
    renderCard({ onPromote, promoteDisabled: true });
    const promoteButton = screen.getByRole('button', { name: '대표로 지정' });
    expect(promoteButton).toBeDisabled();
    expect(promoteButton).toHaveAttribute('title');
    fireEvent.click(promoteButton);
    expect(onPromote).not.toHaveBeenCalled();
  });

  it('I-4: 이미 대표 활동으로 사용 중인 사진은 대표로 지정이 비활성·안내 title 이고 onPromote 를 부르지 않는다', () => {
    const onPromote = vi.fn();
    renderCard({ onPromote, alreadyFeatured: true });
    const promoteButton = screen.getByRole('button', { name: '대표로 지정' });
    expect(promoteButton).toBeDisabled();
    expect(promoteButton.getAttribute('title')).toMatch(/사용 중/);
    fireEvent.click(promoteButton);
    expect(onPromote).not.toHaveBeenCalled();
  });

  it('M-6: 대표로 지정이 비활성이면 aria-describedby 로 사유를 스크린리더에 노출한다(title 미표시 브라우저 대비)', () => {
    renderCard({ promoteDisabled: true });
    const promoteButton = screen.getByRole('button', { name: '대표로 지정' });
    // title 은 유지하되, 안 뜨는 브라우저 대비로 aria-describedby 참조 요소에 사유를 담아 읽히게 한다.
    expect(promoteButton).toHaveAttribute('title');
    const describedby = promoteButton.getAttribute('aria-describedby');
    expect(describedby).toBeTruthy();
    const reason = describedby ? document.getElementById(describedby) : null;
    expect(reason).toHaveTextContent('빈 대표 활동 슬롯이 없어요');
  });

  it('M-6: 활성(등록 가능) 상태에서는 aria-describedby 를 붙이지 않는다', () => {
    renderCard({});
    expect(screen.getByRole('button', { name: '대표로 지정' })).not.toHaveAttribute('aria-describedby');
  });

  it('대표로 지정 클릭 시 onPromote 에 사진을 전달한다', () => {
    const onPromote = vi.fn();
    const photo = makePhoto({ id: 7 });
    renderCard({ photo, onPromote });
    fireEvent.click(screen.getByRole('button', { name: '대표로 지정' }));
    expect(onPromote).toHaveBeenCalledWith(photo);
  });

  it('캡션 편집 다이얼로그에서 저장하면 updatePhoto 를 호출한다', async () => {
    renderCard({ photo: makePhoto({ id: 9, caption: '' }) });
    fireEvent.click(screen.getByRole('button', { name: '캡션 편집' }));
    fireEvent.change(screen.getByLabelText('캡션'), { target: { value: '봄 나들이' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() =>
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
        photoId: 9,
        payload: { caption: '봄 나들이' },
      }),
    );
  });

  it('캡션 저장 실패 시 다이얼로그 안에 에러를 표시하고 다이얼로그를 유지한다', async () => {
    mockUpdateMutateAsync.mockRejectedValueOnce(new Error('캡션 저장 서버 오류'));
    renderCard({ photo: makePhoto({ id: 9, caption: '' }) });
    fireEvent.click(screen.getByRole('button', { name: '캡션 편집' }));
    fireEvent.change(screen.getByLabelText('캡션'), { target: { value: '봄 나들이' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    // 에러는 다이얼로그 내부에 표시(T8 교훈 — 전역 조회 금지)되고, 다이얼로그는 열린 채 유지된다.
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('캡션 저장 서버 오류')).toBeInTheDocument();
    expect(screen.getByLabelText('캡션')).toBeInTheDocument();
  });

  it('삭제 확인 흐름 — 확인 클릭 시 deletePhoto 를 사진 id 로 호출한다', async () => {
    renderCard({ photo: makePhoto({ id: 13 }) });
    fireEvent.click(screen.getByRole('button', { name: '사진 삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(mockDeleteMutateAsync).toHaveBeenCalledWith(13));
  });

  it('대표 활동 참조(409) 삭제 실패 시 모달을 유지하고 모달 안에서 안내한다', async () => {
    mockDeleteMutateAsync.mockRejectedValueOnce(
      new Error('대표 활동에 사용 중인 사진입니다. 대표 활동에서 먼저 해제해주세요.'),
    );
    renderCard({});
    fireEvent.click(screen.getByRole('button', { name: '사진 삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    // 공통 규칙(B안) — 실패해도 닫지 않고 모달 안에서 알린다.
    const dialog = await screen.findByRole('dialog');
    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent(/대표 활동에 사용 중인 사진입니다/);
    // 카드 영역에 그리면 오버레이·aria-hidden 뒤에 갇힌다 — 접근 가능한 위치인지 확인한다.
    expect(alert.closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByText('이 사진을 삭제할까요?')).toBeInTheDocument();
  });

  it('삭제 실패 후 취소하면 오류가 초기화된다', async () => {
    mockDeleteMutateAsync.mockRejectedValueOnce(new Error('삭제에 실패했습니다.'));
    renderCard({});
    fireEvent.click(screen.getByRole('button', { name: '사진 삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    fireEvent.click(screen.getByRole('button', { name: '사진 삭제' }));

    const reopened = await screen.findByRole('dialog');
    expect(within(reopened).queryByRole('alert')).not.toBeInTheDocument();
  });
});
