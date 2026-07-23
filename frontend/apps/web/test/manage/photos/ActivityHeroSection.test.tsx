import { createRef } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClubHeroActivity, ClubPhoto } from '@duing/types';

const mockUploadMutateAsync = vi.fn();
const mockCreatePhotoMutateAsync = vi.fn();
const mockReorderMutateAsync = vi.fn();
const mockGenericMutateAsync = vi.fn();

vi.mock('@duing/hooks', async (importOriginal) => {
  const base = { isPending: false, isError: false, error: null };
  return {
    ...(await importOriginal<typeof import('@duing/hooks')>()),
    useCreateHeroActivityMutation: () => ({ mutateAsync: mockGenericMutateAsync, ...base }),
    useUpdateHeroActivityMutation: () => ({ mutateAsync: mockGenericMutateAsync, ...base }),
    useDeleteHeroActivityMutation: () => ({ mutateAsync: mockGenericMutateAsync, ...base }),
    useReorderHeroActivitiesMutation: () => ({ mutateAsync: mockReorderMutateAsync, ...base }),
    useCreatePhotoMutation: () => ({ mutateAsync: mockCreatePhotoMutateAsync, ...base }),
    useFileUploadMutation: () => ({ mutateAsync: mockUploadMutateAsync, ...base }),
  };
});

import {
  ActivityHeroSection,
  slotsToReorderPayload,
  type ActivityHeroSectionHandle,
} from '../../../app/manage/clubs/[clubId]/photos/_components/ActivityHeroSection';

function makeHero(id: number, displayOrder: number): ClubHeroActivity {
  return {
    id,
    clubPhotoId: id * 10,
    storageKey: `key/${id}.jpg`,
    caption: null,
    width: null,
    height: null,
    title: `제목${id}`,
    description: `설명${id}`,
    displayOrder,
  };
}

function makePhoto(id: number): ClubPhoto {
  return { id, storageKey: `photo/${id}.jpg`, caption: null, width: null, height: null, displayOrder: id };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUploadMutateAsync.mockResolvedValue({ storageKey: 'key/new.jpg', url: 'https://cdn/new.jpg' });
  mockCreatePhotoMutateAsync.mockResolvedValue(makePhoto(500));
  mockReorderMutateAsync.mockResolvedValue(undefined);
  mockGenericMutateAsync.mockResolvedValue(undefined);
});

describe('slotsToReorderPayload', () => {
  it('스왑된 순서를 index+1 displayOrder 로 매핑한다', () => {
    const swapped = [makeHero(2, 2), makeHero(1, 1)];
    expect(slotsToReorderPayload(swapped)).toEqual([
      { heroActivityId: 2, displayOrder: 1 },
      { heroActivityId: 1, displayOrder: 2 },
    ]);
  });

  it('빈 슬롯(null)은 건너뛰고 채워진 항목만 현재 index+1 로 반환한다', () => {
    const slots = [makeHero(1, 1), null, makeHero(3, 3)];
    expect(slotsToReorderPayload(slots)).toEqual([
      { heroActivityId: 1, displayOrder: 1 },
      { heroActivityId: 3, displayOrder: 3 },
    ]);
  });

  it('6칸 전량 채워진 경우 1..6 을 순서대로 반환한다', () => {
    const slots = [1, 2, 3, 4, 5, 6].map((n) => makeHero(n, n));
    expect(slotsToReorderPayload(slots)).toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => ({ heroActivityId: n, displayOrder: n })),
    );
  });
});

describe('ActivityHeroSection', () => {
  it('6개 슬롯을 렌더하고 등록 수 n/6 과 빈 슬롯 플레이스홀더를 보인다', () => {
    const heroes = [makeHero(1, 1), makeHero(2, 2), makeHero(3, 3)];
    const photos = [makePhoto(10), makePhoto(20), makePhoto(30), makePhoto(99)];
    render(<ActivityHeroSection clubId={1} heroActivities={heroes} photos={photos} />);

    expect(screen.getByText('등록 3/6')).toBeInTheDocument();
    // 빈 슬롯 3개 → 플레이스홀더 3회
    expect(screen.getAllByText('사진을 선택하세요')).toHaveLength(3);
    // 채워진 슬롯 3개 → 제목 입력 3개
    expect(screen.getAllByLabelText('제목')).toHaveLength(3);
  });

  it('빈 슬롯의 "사진 선택"으로 피커가 열리고 사용 중 사진은 비활성·뱃지 표시된다', () => {
    const heroes = [makeHero(1, 1)]; // clubPhotoId 10 사용 중
    const photos = [makePhoto(10), makePhoto(20)];
    render(<ActivityHeroSection clubId={1} heroActivities={heroes} photos={photos} />);

    const [pickButton] = screen.getAllByRole('button', { name: '사진 선택' });
    if (!pickButton) throw new Error('사진 선택 버튼을 찾지 못했습니다');
    fireEvent.click(pickButton);

    expect(screen.getByText('대표 활동 사진 선택')).toBeInTheDocument();
    expect(screen.getByText('사용 중')).toBeInTheDocument();
    expect(screen.getByLabelText('사용 중인 사진')).toBeDisabled();
    // 미사용 사진은 선택 가능
    expect(screen.getByLabelText('이 사진 선택')).toBeEnabled();
  });

  it('새 사진 업로드 서버 실패 시 다이얼로그 안에 에러를 표시하고 다이얼로그를 유지한다', async () => {
    mockUploadMutateAsync.mockRejectedValueOnce(new Error('업로드 서버 오류'));
    const heroes = [makeHero(1, 1)];
    const photos = [makePhoto(10)];
    render(<ActivityHeroSection clubId={1} heroActivities={heroes} photos={photos} />);

    const [pickButton] = screen.getAllByRole('button', { name: '사진 선택' });
    if (!pickButton) throw new Error('사진 선택 버튼을 찾지 못했습니다');
    fireEvent.click(pickButton);

    const fileInput = screen.getByLabelText('새 사진 업로드');
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // 서버 실패 메시지가 다이얼로그 내부에 노출되고 다이얼로그는 열린 채 유지된다.
    expect(await within(screen.getByRole('dialog')).findByText('업로드 서버 오류')).toBeInTheDocument();
    expect(screen.getByText('대표 활동 사진 선택')).toBeInTheDocument();
  });

  it('promotePhoto 는 첫 빈 슬롯에 사진을 시드해 편집 상태로 전환한다', () => {
    const heroes = [makeHero(1, 1), makeHero(2, 2), makeHero(3, 3)];
    const photos = [makePhoto(10), makePhoto(20), makePhoto(30), makePhoto(77)];
    const ref = createRef<ActivityHeroSectionHandle>();
    render(<ActivityHeroSection ref={ref} clubId={1} heroActivities={heroes} photos={photos} />);

    // 초기: 채워진 슬롯 3개만 편집(제목 입력 3개)
    expect(screen.getAllByLabelText('제목')).toHaveLength(3);

    act(() => {
      ref.current?.promotePhoto(makePhoto(77));
    });

    // 첫 빈 슬롯이 pendingPhoto 시드로 편집 상태 전환 → 제목 입력 4개
    expect(screen.getAllByLabelText('제목')).toHaveLength(4);
  });
});
