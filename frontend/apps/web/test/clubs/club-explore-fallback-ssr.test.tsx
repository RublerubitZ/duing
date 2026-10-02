/**
 * @vitest-environment node
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { todayKstDateString } from '@duing/hooks';
import type { ClubSummary, PageResponse } from '@duing/types';

import { ClubExploreFallback } from '@/app/clubs/_components/ClubExploreFallback';

// 운영형 요약 2곳(모집 중 1·모집 없음 1) — 로고 이미지·이니셜, 한 줄 소개 유무, 단과대·중앙을 함께 지난다.
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

// 빌드·재생성 중 서버에서 그려진다 — throw 하면 빌드가 깨지거나 재생성이 실패한다.
describe('ClubExploreFallback — 서버 렌더', () => {
  it('기본 목록 카드(이름·한 줄 소개·상세 링크)와 실제 제목을 경고 없이 담는다', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const html = renderToString(<ClubExploreFallback page={page} />);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
    expect(html).toContain('모션케어');
    expect(html).toContain('함께 운동해요');
    expect(html).toContain('href="/clubs/1"');
    expect(html).toContain('166개 동아리를 둘러보세요');
    expect(html).toContain('동아리 탐색');
  });

  it('데이터가 없으면 지금 스켈레톤을 그린다', () => {
    const html = renderToString(<ClubExploreFallback page={null} />);

    expect(html).toContain('동아리 목록 불러오는 중');
    expect(html).not.toContain('href="/clubs/');
  });
});
