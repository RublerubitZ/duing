import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { createApiClient } from '@duing/api';
import { ApiClientProvider, clubQueryKeys, todayKstDateString } from '@duing/hooks';
import type { ClubDetail } from '@duing/types';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { ClubDetailPage } from '@/app/clubs/[clubId]/_pages/ClubDetailPage';

// 동아리 상세 트리 서버 렌더·하이드레이션 회귀가 함께 쓰는 운영형 픽스처(HTML 소개·모집 중).
// 쓰는 테스트는 next/navigation 을 vi.mock 해야 한다 — 상세 트리가 라우터 훅을 부른다.
export const clubDetail: ClubDetail = {
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
  // page.tsx 가 시드하는 모양 그대로 — 연락처(회장 휴대전화)는 시드에서 빠진다(라우트 테스트가 고정).
  contactPhone: null,
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

/** page.tsx 처럼 상세를 updatedAt 0 으로 시드한 상세 트리 전체 — 부를 때마다 새 캐시라 서버·브라우저 렌더를 따로 흉내 낸다. */
export function seededClubDetailTree() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(clubQueryKeys.detail(1), clubDetail, { updatedAt: 0 });
  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={createApiClient({ baseUrl: 'http://localhost:8080/api/v1' })}>
        <ToastProvider>
          <ClubDetailPage clubId={1} />
        </ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>
  );
}
