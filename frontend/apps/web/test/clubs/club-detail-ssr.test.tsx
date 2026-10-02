/**
 * @vitest-environment node
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@duing/api';
import { ApiClientProvider, clubQueryKeys, todayKstDateString } from '@duing/hooks';
import type { ClubDetail } from '@duing/types';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/clubs/1',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ clubId: '1' }),
  useSelectedLayoutSegment: () => null,
}));

import { ClubDetailPage } from '@/app/clubs/[clubId]/_pages/ClubDetailPage';

const clubDetail: ClubDetail = {
  id: 1,
  name: '모션케어',
  category: 'SPORTS',
  division: null,
  college: null,
  department: null,
  logoUrl: null,
  status: 'ACTIVE',
  tags: ['재활'],
  centralClub: false,
  description: '<p>함께 <strong>운동</strong>해요</p><p>스트레칭과 테이핑을 배워요</p>',
  coverUrl: null,
  snsLinks: [],
  faqs: [],
  leaderId: null,
  leaderName: null,
  photos: [],
  foundedYear: 2026,
  cohortNumber: null,
  location: null,
  contactPhone: null,
  contactVisibility: 'PUBLIC',
  activityFrequency: 1,
  activeDays: ['TUESDAY'],
  membershipFeeAmount: null,
  feeCycle: 'NONE',
  feeNote: null,
  tagline: null,
  highlights: [],
  projects: [],
  useGeneration: false,
  activeRecruitment: {
    id: 100,
    recruitmentId: 100,
    title: '가을 부원 모집',
    startDate: todayKstDateString(new Date(Date.now() - 2 * 86_400_000)),
    endDate: todayKstDateString(new Date(Date.now() + 3 * 86_400_000)),
    displayStatus: 'OPEN',
    capacity: 40,
    useInterview: false,
    targetRole: 'MEMBER',
    applicationMode: 'SELF',
    externalFormUrl: null,
    interviewStartDate: null,
    interviewEndDate: null,
    applicantCount: null,
  },
};

describe('동아리 상세 트리 — 서버 렌더(ISR 정적 생성 회귀)', () => {
  it('HTML 소개·모집 중인 동아리를 throw 없이 그리고, 본문은 담고 D-day 는 뺀다', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(clubQueryKeys.detail(1), clubDetail, { updatedAt: 0 });

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <ApiClientProvider client={createApiClient({ baseUrl: 'http://localhost:8080/api/v1' })}>
          <ToastProvider>
            <ClubDetailPage clubId={1} />
          </ToastProvider>
        </ApiClientProvider>
      </QueryClientProvider>,
    );

    expect(html).toContain('모션케어');
    expect(html).toContain('함께 운동해요');
    expect(html).toContain('모집중');
    expect(html).not.toContain('모집중 · D-');
  });
});
