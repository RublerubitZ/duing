import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ClubSummary, RecruitmentDisplayStatus } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    'aria-label'?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { fetchInterestingClubsMock } = vi.hoisted(() => ({ fetchInterestingClubsMock: vi.fn() }));
vi.mock('@/app/_lib/home-data', () => ({ fetchInterestingClubs: fetchInterestingClubsMock }));

import { InterestingClubs } from '@/app/_components/sections/InterestingClubs';

function club(overrides: Partial<ClubSummary> & { id: number }): ClubSummary {
  return {
    name: `동아리${overrides.id}`,
    category: 'ACADEMIC',
    division: null,
    college: null,
    department: null,
    logoUrl: null,
    status: 'ACTIVE',
    tags: [],
    tagline: null,
    centralClub: false,
    weeklyInterestCount: 0,
    activeRecruitment: null,
    ...overrides,
  };
}

function recruiting(displayStatus: RecruitmentDisplayStatus): ClubSummary['activeRecruitment'] {
  return { recruitmentId: 1, displayStatus, startDate: '2026-08-01', endDate: '2026-09-01' };
}

beforeEach(() => {
  fetchInterestingClubsMock.mockReset();
});

describe('InterestingClubs', () => {
  it('관심도 상위 동아리가 상세 링크와 함께 렌더된다', async () => {
    fetchInterestingClubsMock.mockResolvedValue([
      club({ id: 1, name: '호그와트' }),
      club({ id: 2, name: '두잉 동아리' }),
    ]);

    const { container } = render(await InterestingClubs());

    // 데스크탑 카드 + 모바일 행 이중 렌더 — 이름이 두 번 등장한다.
    expect(screen.getAllByText('호그와트').length).toBeGreaterThan(0);
    expect(container.querySelector('a[href="/clubs/1"]')).not.toBeNull();
    expect(container.querySelector('a[href="/clubs/2"]')).not.toBeNull();
  });

  it('주간 관심 인원이 임계값 이상이면 "이번 주에 N명" 문구가 표시된다', async () => {
    fetchInterestingClubsMock.mockResolvedValue([club({ id: 1, weeklyInterestCount: 24 })]);

    render(await InterestingClubs());

    expect(screen.getByText('24명')).toBeInTheDocument();
    expect(screen.getByText(/관심을 보였어요/)).toBeInTheDocument();
  });

  it('주간 관심 인원이 임계값 미만이면 인원 문구를 아예 쓰지 않는다', async () => {
    // "2명이 관심을 보였어요" 는 추천이 아니라 한산해 보이는 역효과라 줄 자체를 뺀다.
    fetchInterestingClubsMock.mockResolvedValue([club({ id: 1, weeklyInterestCount: 2 })]);

    render(await InterestingClubs());

    expect(screen.queryByText(/관심을 보였어요/)).toBeNull();
    expect(screen.queryByText('2명')).toBeNull();
  });

  it('백엔드 전환기라 주간 관심 인원 필드가 없어도 카드가 깨지지 않는다', async () => {
    const withoutCount = club({ id: 1 });
    delete withoutCount.weeklyInterestCount;
    fetchInterestingClubsMock.mockResolvedValue([withoutCount]);

    render(await InterestingClubs());

    expect(screen.getAllByText('동아리1').length).toBeGreaterThan(0);
    expect(screen.queryByText(/관심을 보였어요/)).toBeNull();
  });

  it('내부 정렬 점수는 화면 어디에도 노출하지 않는다', async () => {
    fetchInterestingClubsMock.mockResolvedValue([club({ id: 1, weeklyInterestCount: 24 })]);

    const { container } = render(await InterestingClubs());

    expect(container.textContent).not.toMatch(/관심도 점수|score/i);
    // 조회수 같은 표현도 쓰지 않는다(요구된 톤).
    expect(container.textContent).not.toMatch(/조회수|명이 봤어요/);
  });

  it('모집 상태에 따라 상태 배지가 달라지고, 모집이 없으면 배지가 없다', async () => {
    fetchInterestingClubsMock.mockResolvedValue([
      club({ id: 1, name: '모집중클럽', activeRecruitment: recruiting('OPEN') }),
      club({ id: 2, name: '예정클럽', activeRecruitment: recruiting('UPCOMING') }),
      club({ id: 3, name: '마감클럽', activeRecruitment: recruiting('CLOSED') }),
      club({ id: 4, name: '모집없음클럽' }),
    ]);

    render(await InterestingClubs());

    expect(screen.getAllByText('모집중').length).toBeGreaterThan(0);
    expect(screen.getAllByText('모집예정').length).toBeGreaterThan(0);
    expect(screen.getAllByText('모집마감').length).toBeGreaterThan(0);
  });

  it('보여줄 동아리가 없으면 섹션 자체를 렌더하지 않는다', async () => {
    fetchInterestingClubsMock.mockResolvedValue([]);

    const { container } = render(await InterestingClubs());

    expect(container).toBeEmptyDOMElement();
  });

  it('전체 보기 링크는 아이콘만 있어도 접근명을 갖는다', async () => {
    fetchInterestingClubsMock.mockResolvedValue([club({ id: 1 })]);

    render(await InterestingClubs());

    expect(
      screen.getByRole('link', { name: '관심도가 높은 동아리 전체 보기' }),
    ).toHaveAttribute('href', '/clubs');
  });
});

describe('InterestingClubs — 로고 폴백', () => {
  function clubWith(logoUrl: string | null): ClubSummary {
    return club({ id: 9, name: '로고클럽', logoUrl });
  }

  it('로고 이미지가 실패하면 깨진 이미지 대신 이니셜로 떨어진다', async () => {
    // 삭제된 스토리지 URL 에서 깨진 이미지 아이콘이 그대로 노출되던 것을 공용 ClubLogo 로 막았다.
    fetchInterestingClubsMock.mockResolvedValue([clubWith('https://cdn.example.test/gone.png')]);

    const { container } = render(await InterestingClubs());

    const logos = container.querySelectorAll('img[src="https://cdn.example.test/gone.png"]');
    expect(logos).not.toHaveLength(0);
    for (const logo of logos) fireEvent.error(logo);

    expect(container.querySelectorAll('img[src="https://cdn.example.test/gone.png"]')).toHaveLength(0);
    expect(screen.getAllByText('로').length).toBeGreaterThan(0);
  });

  it('로고가 없으면 처음부터 이니셜을 그린다', async () => {
    fetchInterestingClubsMock.mockResolvedValue([clubWith(null)]);

    const { container } = render(await InterestingClubs());

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getAllByText('로').length).toBeGreaterThan(0);
  });

  it('PC 카드는 md 2×2·lg 4열이고, lg 부터 컨테이너 쿼리로 카드 폭에 비례해 통째로 줄어든다', async () => {
    fetchInterestingClubsMock.mockResolvedValue([clubWith(null)]);

    const { container } = render(await InterestingClubs());

    // CSS 만으로 이뤄진 수정이라 클래스 불변식으로 잡는다 — md 에서 4열로 되돌리면 배지가 카드 밖으로
    // 튀고(768 실측 36px), cqw 루트를 빼면 1024 에서 카드가 세로로 길어진다(비율 0.76).
    const grid = container.querySelector('.md\\:grid-cols-2');
    expect(grid).toHaveClass('lg:grid-cols-4');
    const wrapper = grid?.firstElementChild;
    expect(wrapper).toHaveClass('lg:[container-type:inline-size]');
    const card = wrapper?.firstElementChild;
    expect(card).toHaveClass('text-[16px]', 'lg:text-[5.614cqw]', 'lg:min-h-[101.75cqw]', 'h-full');
  });
});
