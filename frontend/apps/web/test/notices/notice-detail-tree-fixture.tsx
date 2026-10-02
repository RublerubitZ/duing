import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { createApiClient } from '@duing/api';
import { ApiClientProvider, noticeQueryKeys } from '@duing/hooks';
import type { NoticeDetail } from '@duing/types';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { NoticeDetailPage } from '@/app/notices/[noticeId]/_pages/NoticeDetailPage';

import { kstWallClock } from './kst-wall-clock';

// 소식 상세 트리 서버 렌더·하이드레이션 회귀가 함께 쓰는 운영형 픽스처(HTML 본문·마감 3일 전·고정 공지).
// 쓰는 테스트는 next/navigation 을 vi.mock 해야 한다 — 상세 트리가 useParams({ noticeId: '42' })·라우터 훅을 부른다.

export const noticeDetail: NoticeDetail = {
  id: 42,
  title: '2026 가을 동아리 박람회 안내',
  summary: '박람회 일정과 부스 배치를 안내해요',
  content:
    '<p>올해 박람회는 <strong>중앙광장</strong>에서 열려요.</p><ul><li><p>부스 신청</p></li><li><p>공연 신청</p></li></ul><img src="https://files.duings.com/notice/test.jpg" alt="부스 배치도">',
  contentFormat: 'HTML',
  coverImageUrl: 'https://files.duings.com/notice/cover.jpg',
  linkUrl: 'https://www.daegu.ac.kr',
  category: 'FAIR',
  tags: ['박람회'],
  visibility: null,
  clubScopeRole: null,
  targetClubIds: null,
  notifyOnPublish: false,
  pinned: true,
  expiresAt: kstWallClock(3 * 86_400_000),
  createdAt: '2026-09-20T00:00:00Z',
  updatedAt: '2026-09-20T00:00:00Z',
  owningClubId: null,
  clubName: null,
  eventInfo: null,
};

/** 마감이 2시간 지난 같은 소식 — 만료 배너가 서버 HTML 에 없고 하이드레이션 뒤에만 붙는지 본다. */
export const expiredNoticeDetail: NoticeDetail = { ...noticeDetail, expiresAt: kstWallClock(-2 * 3_600_000) };

/** page.tsx 처럼 상세를 updatedAt 0 으로 시드한 상세 트리 전체 — 부를 때마다 새 캐시라 서버·브라우저 렌더를 따로 흉내 낸다. */
export function seededNoticeDetailTree(notice: NoticeDetail = noticeDetail) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(noticeQueryKeys.detail(42), notice, { updatedAt: 0 });
  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={createApiClient({ baseUrl: 'http://localhost:8080/api/v1' })}>
        <ToastProvider>
          <NoticeDetailPage />
        </ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>
  );
}
