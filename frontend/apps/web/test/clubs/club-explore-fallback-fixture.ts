import { todayKstDateString } from '@duing/hooks';
import type { ClubSummary, PageResponse } from '@duing/types';

// 동아리 탐색 서버 기본 목록(fallback)·라우트 테스트가 함께 쓰는 운영형 첫 페이지 — 모집 중 1곳·모집 없음 1곳.
// 로고 이미지·이니셜, 한 줄 소개 유무, 단과대·중앙을 함께 지난다. 모집 날짜는 상대 날짜다(절대 날짜는 시한폭탄).
export const clubListPage: PageResponse<ClubSummary> = {
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
