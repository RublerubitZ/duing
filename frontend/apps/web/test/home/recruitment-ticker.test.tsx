import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClubSummary } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ href, children, ...anchorProps }: React.ComponentPropsWithoutRef<'a'>) => (
    <a href={href} {...anchorProps}>
      {children}
    </a>
  ),
}));

const mockFetchUpcomingDeadlineClubs = vi.fn<(size: number) => Promise<ClubSummary[]>>();

vi.mock('../../app/_lib/home-data', () => ({
  fetchUpcomingDeadlineClubs: (size: number) => mockFetchUpcomingDeadlineClubs(size),
}));

import { RecruitmentTicker } from '../../app/_components/sections/RecruitmentTicker';

// 티커는 서버에서 new Date() 를 쓰므로, 실제 오늘 기준 상대 날짜(로컬 달력)로 픽스처를 만든다.
function isoInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function makeSummary(id: number, name: string, endDate: string | null): ClubSummary {
  return {
    id,
    name,
    category: 'ACADEMIC',
    division: '학술분과',
    college: null,
    department: null,
    logoUrl: null,
    status: 'ACTIVE',
    tags: [],
    tagline: null,
    centralClub: true,
    activeRecruitment:
      endDate === null
        ? null
        : { recruitmentId: 1, displayStatus: 'OPEN', startDate: isoInDays(-10), endDate },
  };
}

describe('RecruitmentTicker (server component)', () => {
  /** 스크린리더에 남는(복제가 아닌) 항목만 골라낸다 — 복제는 조상 span 이 aria-hidden 이다. */
  function announced(name: string): HTMLElement[] {
    return screen.getAllByText(name).filter((el) => el.closest('[aria-hidden="true"]') === null);
  }

  /**
   * 마퀴가 1초에 지나가는 항목 수 — 눈에 보이는 속도의 대용이다.
   * 트랙은 한 카피를 두 번 이어 붙이고 한 주기에 정확히 한 카피(-50%)를 지나가므로,
   * 렌더된 항목 수의 절반이 한 주기 분량이다.
   */
  function itemsPerSecond(distinctClubCount: number): number {
    const track = document.querySelector<HTMLElement>('[style*="animation-duration"]');
    if (track === null) throw new Error('마퀴 트랙을 찾지 못했다');
    const durationSeconds = Number.parseFloat(track.style.animationDuration);
    // 트랙의 직계 자식 하나가 항목 칩 하나다(원본 + 복제).
    const renderedItems = track.children.length;
    if (renderedItems === 0)
      throw new Error(`항목이 렌더되지 않았다(동아리 ${distinctClubCount}곳)`);
    return renderedItems / 2 / durationSeconds;
  }

  it('마감 D-7 이내 모집을 배지로 렌더하고, 복제본은 스크린리더에서 감춘다', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([
      makeSummary(1, '알파', isoInDays(2)),
      makeSummary(2, '베타', isoInDays(5)),
    ]);

    const Component = await RecruitmentTicker();
    render(<>{Component}</>);

    expect(screen.getAllByText('알파').length).toBeGreaterThan(1);
    // 몇 번을 되풀이하든 읽히는 것은 동아리당 한 번뿐이어야 한다.
    expect(announced('알파')).toHaveLength(1);
    expect(announced('베타')).toHaveLength(1);
  });

  it('모집이 한 곳뿐이어도 한 카피가 8개가 되도록 채워 마퀴 이음매에 빈 띠가 생기지 않는다', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([makeSummary(1, '외톨이', isoInDays(1))]);

    const Component = await RecruitmentTicker();
    render(<>{Component}</>);

    // 한 카피 최소 8개 × seamless 루프용 2배 = 16. 이 수가 줄면 넓은 폭에서 이음매가 벌어진다.
    expect(screen.getAllByText('외톨이')).toHaveLength(16);
    expect(announced('외톨이')).toHaveLength(1);
  });

  it('모집이 6곳이어도 채움이 걸린다 — 기준을 딱 맞추면 배수가 1 이라 그냥 지나간다', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce(
      Array.from({ length: 6 }, (_, index) => makeSummary(index + 1, `여섯${index}`, isoInDays(2))),
    );

    const Component = await RecruitmentTicker();
    render(<>{Component}</>);

    // 6곳 × 되풀이 2배 = 12개가 한 카피, 트랙에는 그 두 배가 깔린다.
    expect(screen.getAllByText('여섯0')).toHaveLength(4);
    expect(announced('여섯0')).toHaveLength(1);
  });

  it('되풀이로 채워도 흐르는 속도는 채우기 전과 같다 — 길이 배수만큼 재생 시간도 늘어난다', async () => {
    /** 채움이 없었을 때의 속도(항목/초) — 개당 2.6s, 최소 12s 라는 원래 규칙 그대로. */
    const speedWithoutFill = (clubCount: number) =>
      clubCount / Math.max(12, Math.round(clubCount * 2.6));

    // 1곳(8배로 채워짐)·2곳(4배)·8곳(채움 없음) 모두 자기 기준 속도를 지켜야 한다.
    for (const clubCount of [1, 2, 8]) {
      mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce(
        Array.from({ length: clubCount }, (_, index) =>
          makeSummary(index + 1, `동아리${clubCount}-${index}`, isoInDays(2)),
        ),
      );
      const Component = await RecruitmentTicker();
      const { unmount } = render(<>{Component}</>);

      // 하한(12s)에 채운 길이를 그대로 맡기면 1곳은 8배, 2곳은 4배 빨라진다.
      expect(itemsPerSecond(clubCount)).toBeCloseTo(speedWithoutFill(clubCount), 5);
      unmount();
    }
  });

  it('섹션 라벨은 "마감 임박 동아리", 전체 보기는 아이콘만 있는 링크라 접근명을 가진다', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([makeSummary(3, '감마', isoInDays(3))]);

    const Component = await RecruitmentTicker();
    render(<>{Component}</>);

    expect(screen.getByText('마감 임박 동아리')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '마감 임박 동아리 전체 보기' })).toHaveAttribute(
      'href',
      '/clubs?recruitment=available',
    );
  });

  it('마감 D-8 이상만 있으면(윈도우 밖) 섹션이 미렌더된다', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([makeSummary(4, '머나먼', isoInDays(30))]);

    const Component = await RecruitmentTicker();

    expect(Component).toBeNull();
  });

  it('데이터가 0건이면 섹션 자체가 미렌더', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([]);

    const Component = await RecruitmentTicker();

    expect(Component).toBeNull();
  });
});
