import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { createApiClient } from '@duing/api';
import { ApiClientProvider, noticeQueryKeys } from '@duing/hooks';
import type { NoticeCardItem, PageResponse } from '@duing/types';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { DEFAULT_NOTICE_LIST_PARAMS } from '@/app/notices/_lib/noticeListDefaults';
import { NoticePage } from '@/app/notices/_pages/NoticePage';

// 소식 목록 트리 서버 렌더·하이드레이션 회귀가 함께 쓰는 운영형 픽스처(고정 공지 1·막 올라온 공지 1·지난 공지 1).
// 쓰는 테스트는 next/navigation 을 vi.mock 해야 한다 — 탭(InfoTabs)이 경로 훅을 부른다.

function notice(overrides: Partial<NoticeCardItem>): NoticeCardItem {
  return {
    id: 1,
    title: '',
    summary: '',
    coverImageUrl: 'https://files.duings.com/notice/cover.jpg',
    linkUrl: null,
    category: 'GENERAL',
    tags: [],
    pinned: false,
    expiresAt: null,
    createdAt: '2026-08-31T03:22:07Z',
    owningClubId: null,
    clubName: null,
    ...overrides,
  };
}

export const noticeListPage: PageResponse<NoticeCardItem> = {
  content: [
    notice({ id: 1, title: '두잉 이용 안내', summary: '동아리 탐색과 지원 방법', pinned: true }),
    // 작성 직후 — NEW 배지 대상(7일 이내). 하이드레이션 뒤에만 붙어야 한다.
    notice({ id: 17, title: '가을 동아리 박람회 안내', summary: '박람회 일정과 부스 배치', category: 'FAIR', createdAt: new Date().toISOString() }),
    notice({ id: 7, title: '지원사업 신청 안내', summary: '동아리 지원금 신청 절차', category: 'FUNDING', createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString() }),
  ],
  page: 0,
  size: 20,
  totalElements: 3,
  totalPages: 1,
  hasNext: false,
};

/** page.tsx 처럼 목록 첫 진입 키를 updatedAt 0 으로 시드한 목록 트리 — 부를 때마다 새 캐시라 서버·브라우저 렌더를 따로 흉내 낸다. */
export function seededNoticeListTree() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(noticeQueryKeys.list(DEFAULT_NOTICE_LIST_PARAMS), noticeListPage, { updatedAt: 0 });
  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={createApiClient({ baseUrl: 'http://localhost:8080/api/v1' })}>
        <ToastProvider>
          <NoticePage />
        </ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>
  );
}
