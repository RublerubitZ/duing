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
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
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
  logoUrl: 'https://files.duings.com/club/logo/test.png',
  status: 'ACTIVE',
  tags: ['재활'],
  centralClub: false,
  description: '<p>함께 <strong>운동</strong>해요</p><p>스트레칭과 테이핑을 배워요</p>',
  coverUrl: 'https://files.duings.com/club/cover/test.jpg',
  snsLinks: [
    { platform: 'INSTAGRAM', label: null, url: 'https://www.instagram.com/motioncare_du' },
  ],
  faqs: [
    {
      question: '운동을 처음 해 봐도 괜찮나요?',
      answer: '기초 스트레칭부터 함께 시작해요.',
      order: 0,
    },
  ],
  leaderId: 7,
  leaderName: '김두잉',
  photos: [
    {
      id: 10,
      storageKey: 'https://files.duings.com/club/photo/test.jpg',
      caption: '정기 스트레칭',
      width: 1200,
      height: 900,
      displayOrder: 0,
    },
  ],
  foundedYear: 2026,
  cohortNumber: null,
  location: null,
  contactPhone: '010-1234-5678',
  contactVisibility: 'PUBLIC',
  activityFrequency: 1,
  activeDays: ['TUESDAY'],
  membershipFeeAmount: 30000,
  feeCycle: 'SEMESTER',
  feeNote: '첫 학기는 면제예요',
  tagline: null,
  highlights: ['꾸준히 운동하고 싶은 분'],
  projects: [{ icon: 'DUMBBELL', title: '재활 스트레칭 세션', subtitle: '매주 화요일 저녁' }],
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
    // React 개발 경고(key 누락·잘못된 DOM 속성 등)는 서버 렌더에서 throw 없이 console.error 로만 남는다.
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <ApiClientProvider client={createApiClient({ baseUrl: 'http://localhost:8080/api/v1' })}>
          <ToastProvider>
            <ClubDetailPage clubId={1} />
          </ToastProvider>
        </ApiClientProvider>
      </QueryClientProvider>,
    );

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
    // Suspense 안 SSR 오류는 renderToString 이 throw·console.error 없이 삼키고 <!--$!--> 표식만 남긴다.
    expect(html).not.toContain('<!--$!-->');
    expect(html).toContain('모션케어');
    expect(html).toContain('함께 운동해요');
    expect(html).toContain('모집중');
    expect(html).not.toContain('모집중 · D-');
    // 첫 화면(히어로·통계·소개 탭·연락처 카드)에 실리는 필드만 단언한다 — 비활성 탭(Q&A·상세정보)은 서버 HTML 에 없다.
    expect(html).toContain(encodeURIComponent('https://files.duings.com/club/cover/test.jpg'));
    expect(html).toContain('src="https://files.duings.com/club/logo/test.png"');
    expect(html).toContain('학기당 30,000원');
    expect(html).toContain('재활 스트레칭 세션');
    expect(html).toContain('꾸준히 운동하고 싶은 분');
    expect(html).toContain('010-1234-5678');
    expect(html).toContain('모션케어 인스타그램');
  });
});
