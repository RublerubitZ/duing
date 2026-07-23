import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ClubHeroActivity } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
// TanStack 내부는 건드리지 않고 커스텀 훅만 부분 mock(레포 관례) — importOriginal 로 나머지 export 유지.
const mockUseClubHeroActivitiesQuery = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useClubHeroActivitiesQuery: (...args: unknown[]) => mockUseClubHeroActivitiesQuery(...args),
}));

/* ── 테스트 대상 ───────────────────────────────────────────── */
import { ClubDetailHeroActivities } from '@/app/clubs/[clubId]/_components/ClubDetailHeroActivities';

type HeroQueryState = {
  data: ClubHeroActivity[] | undefined;
  isLoading: boolean;
  isError: boolean;
};

function mockHeroQuery(state: HeroQueryState) {
  mockUseClubHeroActivitiesQuery.mockReturnValue(state);
}

const make = (id: number, order: number): ClubHeroActivity => ({
  id,
  clubPhotoId: id,
  storageKey: `k${id}.jpg`,
  caption: null,
  width: null,
  height: null,
  title: `활동${id}`,
  description: `설명${id}`,
  displayOrder: order,
});

describe('ClubDetailHeroActivities', () => {
  beforeEach(() => {
    mockUseClubHeroActivitiesQuery.mockReset();
  });

  it('로딩 중에는 섹션 자리에 스켈레톤만 보인다(delayed-show)', () => {
    mockHeroQuery({ data: undefined, isLoading: true, isError: false });
    render(<ClubDetailHeroActivities clubId={1} />);
    expect(screen.getByRole('status', { name: '대표 활동 불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByText('대표 활동')).not.toBeInTheDocument();
  });

  it('0개면 섹션을 렌더하지 않는다', () => {
    mockHeroQuery({ data: [], isLoading: false, isError: false });
    const { container } = render(<ClubDetailHeroActivities clubId={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('에러면 조용히 미렌더(랜딩 강등)', () => {
    mockHeroQuery({ data: undefined, isLoading: false, isError: true });
    const { container } = render(<ClubDetailHeroActivities clubId={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('데이터가 있으면 헤더 고정 문구 + 벤토·스와이프 래퍼를 렌더하고, 카드 클릭 시 라이트박스에 제목·설명이 뜬다', () => {
    mockHeroQuery({ data: [make(1, 1), make(2, 2)], isLoading: false, isError: false });
    render(<ClubDetailHeroActivities clubId={1} />);
    expect(screen.getByText('대표 활동')).toBeInTheDocument();
    expect(screen.getByText('동아리의 다양한 활동과 분위기를 만나보세요.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '활동1 자세히 보기' })[0]!);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('활동1')).toBeInTheDocument();
    expect(within(dialog).getByText('설명1')).toBeInTheDocument();
  });
});
