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
  reconcileSlots,
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

describe('reconcileSlots (M-2 빈 슬롯 키 reconcile)', () => {
  const H1 = makeHero(1, 2); // 서버 displayOrder 2
  const H2 = makeHero(2, 3); // 서버 displayOrder 3
  // 사용자가 empty-3 슬롯(pending draft)을 pos1 로 드래그해 H1·H2 가 뒤로 밀린 로컬 order.
  const draggedOrder = [
    { key: 'empty-3', hero: null },
    { key: 'hero-1', hero: H1 },
    { key: 'hero-2', hero: H2 },
    { key: 'empty-4', hero: null },
    { key: 'empty-5', hero: null },
    { key: 'empty-6', hero: null },
  ];

  it('드래그로 옮긴 빈 슬롯(pending) 키를 옮긴 위치에 보존한다(위치 기반 재생성 안 함)', () => {
    const next = reconcileSlots([H1, H2], draggedOrder);
    // pos1(빈 위치)에 드래그한 pending 키가 그대로 — buildSlots 였다면 empty-1 로 뒤바뀌어 pending 이 유실/점프한다.
    expect(next[0]).toEqual({ key: 'empty-3', hero: null });
    expect(next[1]?.key).toBe('hero-1');
    expect(next[2]?.key).toBe('hero-2');
  });

  it('옮긴 빈 슬롯 위치가 서버 hero 로 채워지면(displaced) 그 키를 버린다 → pending 정리 대상', () => {
    const Hnew = makeHero(9, 1); // 서버가 pos1 을 새 hero 로 채움
    const next = reconcileSlots([Hnew, H1, H2], draggedOrder);
    expect(next[0]?.key).toBe('hero-9');
    // empty-3 키가 어디에도 남지 않는다 → I-8 pending 정리 effect 가 그 draft 를 걷어낸다.
    expect(next.some((slot) => slot.key === 'empty-3')).toBe(false);
  });

  it('prevOrder 가 비면 위치 기반 키를 발급한다(buildSlots 동치)', () => {
    const next = reconcileSlots([makeHero(1, 1)], []);
    expect(next.map((slot) => slot.key)).toEqual([
      'hero-1',
      'empty-2',
      'empty-3',
      'empty-4',
      'empty-5',
      'empty-6',
    ]);
  });

  it('보존된 빈 슬롯 키와 fallback 발급 키가 충돌하지 않는다(드래그 정착 후 비우기 시퀀스)', () => {
    // hero 1개를 pos1→pos2 로 드래그해 정착한 뒤(empty-2 가 pos1 에 보존) 그 hero 를 비운 상태:
    // pos2 가 새로 빈 위치가 되는데, 위치 파생 fallback(empty-2)은 pos1 의 보존 키와 중복된다.
    const settledOrder = [
      { key: 'empty-2', hero: null },
      { key: 'hero-1', hero: makeHero(1, 2) },
      { key: 'empty-3', hero: null },
      { key: 'empty-4', hero: null },
      { key: 'empty-5', hero: null },
      { key: 'empty-6', hero: null },
    ];
    const next = reconcileSlots([], settledOrder); // hero 삭제 반영
    expect(next[0]?.key).toBe('empty-2'); // 보존
    expect(new Set(next.map((slot) => slot.key)).size).toBe(6); // 중복 없음
  });

  it('이미 중복된 prevOrder 키도 다음 reconcile 에서 자가 치유된다', () => {
    const duplicated = [
      { key: 'empty-2', hero: null },
      { key: 'empty-2', hero: null },
      { key: 'empty-3', hero: null },
      { key: 'empty-4', hero: null },
      { key: 'empty-5', hero: null },
      { key: 'empty-6', hero: null },
    ];
    const next = reconcileSlots([], duplicated);
    expect(new Set(next.map((slot) => slot.key)).size).toBe(6);
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

  it('I-3: 이미 pending 으로 시드된 슬롯은 건너뛰고 다음 빈 슬롯에 시드한다', () => {
    const photos = [makePhoto(10), makePhoto(20)];
    const ref = createRef<ActivityHeroSectionHandle>();
    render(<ActivityHeroSection ref={ref} clubId={1} heroActivities={[]} photos={photos} />);

    act(() => {
      ref.current?.promotePhoto(makePhoto(10));
    });
    act(() => {
      ref.current?.promotePhoto(makePhoto(20));
    });

    // 두 번째 승격이 첫 pending 슬롯을 덮어쓰지 않고 다음 빈 슬롯에 시드 → 편집 슬롯 2개.
    expect(screen.getAllByLabelText('제목')).toHaveLength(2);
  });

  it('M-7: pending 으로 시드된 사진은 피커에서도 "사용 중" 으로 비활성 처리된다', () => {
    const photos = [makePhoto(10), makePhoto(20)];
    const ref = createRef<ActivityHeroSectionHandle>();
    render(<ActivityHeroSection ref={ref} clubId={1} heroActivities={[]} photos={photos} />);

    act(() => {
      ref.current?.promotePhoto(makePhoto(10));
    });

    // 다른 빈 슬롯의 피커를 연다.
    const [pickButton] = screen.getAllByRole('button', { name: '사진 선택' });
    if (!pickButton) throw new Error('사진 선택 버튼을 찾지 못했습니다');
    fireEvent.click(pickButton);

    expect(screen.getByText('대표 활동 사진 선택')).toBeInTheDocument();
    // pending clubPhotoId(10)이 usedPhotoIds 에 포함 → "사용 중" 뱃지.
    expect(screen.getByText('사용 중')).toBeInTheDocument();
  });

  it('I-8: 저장 직후 pending 을 즉시 비우지 않고(플래시 방지), 서버 반영 후 정리하며 부활시키지 않는다', async () => {
    const ref = createRef<ActivityHeroSectionHandle>();
    const { rerender } = render(
      <ActivityHeroSection ref={ref} clubId={1} heroActivities={[]} photos={[makePhoto(77)]} />,
    );

    act(() => {
      ref.current?.promotePhoto(makePhoto(77));
    });
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '봄 MT' } });
    fireEvent.change(screen.getByLabelText('설명'), { target: { value: '즐거운 하루' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    });

    // 저장 성공(create) 직후에도 refetch 전까지 슬롯이 빈 상태로 플래시되지 않는다.
    expect(screen.getAllByLabelText('제목')).toHaveLength(1);

    // 서버 반영(hero prop 도착) → pending 정리(슬롯은 hero 로 유지).
    const savedHero = makeHero(77, 1);
    rerender(<ActivityHeroSection ref={ref} clubId={1} heroActivities={[savedHero]} photos={[makePhoto(77)]} />);
    expect(screen.getAllByLabelText('제목')).toHaveLength(1);

    // hero 가 삭제돼 슬롯이 다시 비어도 옛 pending 이 부활하지 않는다.
    rerender(<ActivityHeroSection ref={ref} clubId={1} heroActivities={[]} photos={[makePhoto(77)]} />);
    expect(screen.queryAllByLabelText('제목')).toHaveLength(0);
  });
});
