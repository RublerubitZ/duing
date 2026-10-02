import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { todayKstDateString } from '@duing/hooks';
import type { ClubSummary, PageResponse } from '@duing/types';

import { ClubExploreFallback } from '@/app/clubs/_components/ClubExploreFallback';

// 서버 렌더 테스트(club-explore-fallback-ssr)와 같은 운영형 요약 2곳(모집 중 1·모집 없음 1).
const page: PageResponse<ClubSummary> = {
  content: [
    {
      id: 1,
      name: '모션케어',
      category: 'SPORTS',
      division: null,
      college: 'REHABILITATION',
      department: '물리치료학과',
      logoUrl: 'https://files.duings.com/club/logo/test.png',
      status: 'ACTIVE',
      tags: ['재활'],
      tagline: '함께 운동해요',
      centralClub: false,
      weeklyInterestCount: 12,
      activeRecruitment: {
        recruitmentId: 100,
        displayStatus: 'OPEN',
        startDate: todayKstDateString(new Date(Date.now() - 2 * 86_400_000)),
        endDate: todayKstDateString(new Date(Date.now() + 3 * 86_400_000)),
      },
    },
    {
      id: 2,
      name: '비호상록회',
      category: 'VOLUNTEER',
      division: '사회',
      college: null,
      department: null,
      logoUrl: null,
      status: 'ACTIVE',
      tags: [],
      tagline: null,
      centralClub: true,
      weeklyInterestCount: 0,
      activeRecruitment: null,
    },
  ],
  page: 0,
  size: 20,
  totalElements: 166,
  totalPages: 9,
  hasNext: true,
};

// 조상 관계(깜빡임 래퍼 아래인지)는 서버 문자열로 볼 수 없어 jsdom 에서 단언한다.
describe('ClubExploreFallback — 구조', () => {
  it('카드·제목·컨트롤 행은 깜빡이지 않는다 — 깜빡이는 것은 빈 회색 자리(검색 2·사이드바 1)뿐', () => {
    const { container } = render(<ClubExploreFallback page={page} />);

    for (const link of screen.getAllByRole('link', { name: /모션케어/ })) {
      expect(link.closest('.animate-pulse')).toBeNull();
    }
    const pulsing = container.querySelectorAll('.animate-pulse');
    expect(pulsing).toHaveLength(3);
    for (const placeholder of pulsing) expect(placeholder).toBeEmptyDOMElement();
  });

  it('카드 위 행을 실제 페이지 문구로 그린다 — 제목·카운트/정렬 행·필터 버튼·카테고리 레일', () => {
    render(<ClubExploreFallback page={page} />);

    expect(screen.getAllByRole('heading', { level: 1 }).map((heading) => heading.textContent)).toEqual([
      '166개 동아리를 둘러보세요',
      '동아리 탐색',
    ]);
    expect(screen.getByText('2개')).toBeInTheDocument();
    expect(screen.getByText('· 현재 페이지 (전체 166개)')).toBeInTheDocument();
    expect(screen.getByText('찜한 동아리')).toBeInTheDocument();
    expect(screen.getAllByText('추천순')).toHaveLength(2); // 데스크탑·모바일
    expect(screen.getByRole('button', { name: '필터' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation')).getAllByRole('button').map((tab) => tab.textContent),
    ).toEqual(['전체', '학술', '창작', '예술', '운동', '봉사', '종교', '취미', '기타']);
  });
});
