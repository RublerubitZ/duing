import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ClubHeroActivity } from '@duing/types';

const mockCreateMutateAsync = vi.fn();
const mockUpdateMutateAsync = vi.fn();
const mockDeleteMutateAsync = vi.fn();

vi.mock('@duing/hooks', async (importOriginal) => {
  const base = { isPending: false, isError: false, error: null };
  return {
    ...(await importOriginal<typeof import('@duing/hooks')>()),
    useCreateHeroActivityMutation: () => ({ mutateAsync: mockCreateMutateAsync, ...base }),
    useUpdateHeroActivityMutation: () => ({ mutateAsync: mockUpdateMutateAsync, ...base }),
    useDeleteHeroActivityMutation: () => ({ mutateAsync: mockDeleteMutateAsync, ...base }),
  };
});

import { HeroActivityEditor } from '../../../app/manage/clubs/[clubId]/photos/_components/HeroActivityEditor';

function makeHero(): ClubHeroActivity {
  return {
    id: 5,
    clubPhotoId: 50,
    storageKey: 'key/5.jpg',
    caption: null,
    width: null,
    height: null,
    title: '기존 제목',
    description: '기존 설명',
    displayOrder: 1,
  };
}

beforeEach(() => {
  mockCreateMutateAsync.mockReset().mockResolvedValue(undefined);
  mockUpdateMutateAsync.mockReset().mockResolvedValue(undefined);
  mockDeleteMutateAsync.mockReset().mockResolvedValue(undefined);
});

describe('HeroActivityEditor', () => {
  it('I-2: 비우기 삭제 실패 시 ConfirmDialog 를 유지하고 모달 안에서 안내한다', async () => {
    mockDeleteMutateAsync.mockRejectedValueOnce(new Error('삭제 서버 오류'));
    render(
      <HeroActivityEditor
        clubId={1}
        slotNumber={1}
        hero={makeHero()}
        dragHandle={<span />}
        onPickPhoto={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '비우기' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '비우기' }));

    // 공통 규칙(B안) — 에디터 본문에 그리면 오버레이·aria-hidden 뒤에 갇힌다.
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('삭제 서버 오류');
    expect(alert.closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('I-5: 수정 경로에서 제목을 비우고 저장하면 검증 에러를 내고 PATCH 하지 않는다', async () => {
    render(
      <HeroActivityEditor
        clubId={1}
        slotNumber={1}
        hero={makeHero()}
        dragHandle={<span />}
        onPickPhoto={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('제목을 입력해주세요.')).toBeInTheDocument();
    expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
  });

  it('I-5: 수정 경로에서 설명을 비우고 저장하면 검증 에러를 내고 PATCH 하지 않는다', async () => {
    render(
      <HeroActivityEditor
        clubId={1}
        slotNumber={1}
        hero={makeHero()}
        dragHandle={<span />}
        onPickPhoto={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('설명'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('설명을 입력해주세요.')).toBeInTheDocument();
    expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
  });

  it('I-6: 신규 저장 시 onBeforeSave(정렬 flush)를 먼저 부른 뒤 create 한다', async () => {
    const callOrder: string[] = [];
    // flush 기록을 마이크로태스크 뒤로 미뤄, 구현이 await 를 빼먹으면 create 가 먼저 기록되게 한다.
    const onBeforeSave = vi.fn(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      callOrder.push('flush');
    });
    mockCreateMutateAsync.mockImplementation(() => {
      callOrder.push('create');
      return Promise.resolve(undefined);
    });

    render(
      <HeroActivityEditor
        clubId={1}
        slotNumber={2}
        hero={null}
        pendingPhoto={{ clubPhotoId: 77, storageKey: 'photo/77.jpg' }}
        dragHandle={<span />}
        onPickPhoto={() => {}}
        onBeforeSave={onBeforeSave}
      />,
    );

    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '봄 MT' } });
    fireEvent.change(screen.getByLabelText('설명'), { target: { value: '즐거운 하루' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalled());
    expect(onBeforeSave).toHaveBeenCalled();
    expect(callOrder).toEqual(['flush', 'create']);
  });
});
