import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NoticeDetail, NoticeContentFormat } from '@duing/types';

// ExploreNav 는 notices/layout.tsx 소유라 상세 페이지 렌더에 포함되지 않는다(스텁 불필요).
vi.mock('../../app/notices/_components/NoticeContent', () => ({
  NoticeContent: ({ content }: { content: string }) => <div data-testid="notice-content">{content}</div>,
}));

const mockUseNoticeDetailQuery = vi.fn();
const mockUseNoticeListQuery = vi.fn();

vi.mock('@duing/hooks', async (importOriginal) => ({
  // 날짜 유틸(formatDateKst 등) 순수 함수는 실제 구현을 그대로 쓴다.
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useNoticeDetailQuery: (...args: unknown[]) => mockUseNoticeDetailQuery(...args),
  useNoticeListQuery: (...args: unknown[]) => mockUseNoticeListQuery(...args),
}));

const mockRouterReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ noticeId: '42' }),
  useRouter: () => ({ replace: mockRouterReplace, back: vi.fn(), push: vi.fn() }),
}));

import NoticeDetailPage from '../../app/notices/[noticeId]/page';

const DEFAULT_CONTENT_FORMAT: NoticeContentFormat = 'MARKDOWN';

function makeDetail(overrides: Partial<NoticeDetail> = {}): NoticeDetail {
  return {
    id: 42,
    title: '공지 제목',
    summary: '공지 요약',
    content: '## 본문 내용\n\n상세 텍스트',
    contentFormat: DEFAULT_CONTENT_FORMAT,
    coverImageUrl: 'https://example.com/cover.jpg',
    linkUrl: null,
    category: 'GENERAL',
    tags: [],
    visibility: null,
    clubScopeRole: null,
    targetClubIds: null,
    notifyOnPublish: false,
    pinned: false,
    expiresAt: null,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    owningClubId: null,
    clubName: null,
    eventInfo: null,
    ...overrides,
  };
}

function detailSuccess(detail: NoticeDetail) {
  return { data: detail, isLoading: false, isSuccess: true, isError: false, error: null };
}

function listSuccess(content: unknown[] = []) {
  return { data: { content, totalPages: 1, totalElements: content.length }, isLoading: false, isSuccess: true, isError: false, error: null };
}

describe('NoticeDetailPage (재설계)', () => {
  it('제목과 리드(summary)가 렌더링된다', () => {
    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({ title: '봄 축제 공지', summary: '봄 축제 일정 안내' })));
    mockUseNoticeListQuery.mockReturnValue(listSuccess());

    render(<NoticeDetailPage />);

    expect(screen.getByRole('heading', { level: 1, name: /봄 축제 공지/ })).toBeInTheDocument();
    expect(screen.getByText('봄 축제 일정 안내')).toBeInTheDocument();
  });

  it('eventInfo 가 있으면 "한눈에 보기" 카드가, 없으면 "공지 정보" 카드가 보인다', () => {
    mockUseNoticeListQuery.mockReturnValue(listSuccess());

    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({
      eventInfo: { startAt: '2026-09-25T10:00:00', endAt: '2026-09-27T18:00:00', location: '중앙광장', host: '학생자치회', audience: '재학생' },
    })));
    const withEvent = render(<NoticeDetailPage />);
    // 모바일 요약(NoticeEventSummary)·데스크탑 카드(NoticeEventCard)가 둘 다 DOM 에 있어(CSS 로만 분기) 2개씩.
    expect(screen.getAllByText('한눈에 보기').length).toBeGreaterThan(0);
    expect(screen.getAllByText('중앙광장').length).toBeGreaterThan(0);
    withEvent.unmount();

    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({ eventInfo: null })));
    render(<NoticeDetailPage />);
    expect(screen.getByText('공지 정보')).toBeInTheDocument();
  });

  it('linkUrl 이 있으면 "원문 보기" 링크가 노출된다', () => {
    mockUseNoticeListQuery.mockReturnValue(listSuccess());
    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({ linkUrl: 'https://example.com' })));

    render(<NoticeDetailPage />);

    const link = screen.getByRole('link', { name: /원문 보기/ });
    expect(link).toHaveAttribute('href', 'https://example.com');
  });

  it('관련 공지가 있으면 같은 카테고리 다른 공지가 노출된다', () => {
    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({ id: 42, category: 'FAIR' })));
    mockUseNoticeListQuery.mockReturnValue(listSuccess([
      { id: 42, title: '자기 자신', category: 'FAIR', createdAt: '2026-05-02T00:00:00Z', summary: '', coverImageUrl: '', linkUrl: null, tags: [], pinned: false, expiresAt: null },
      { id: 99, title: '다른 박람회 공지', category: 'FAIR', createdAt: '2026-05-03T00:00:00Z', summary: '', coverImageUrl: '', linkUrl: null, tags: [], pinned: false, expiresAt: null },
    ]));

    render(<NoticeDetailPage />);

    expect(screen.getByText('다른 박람회 공지')).toBeInTheDocument();
    expect(screen.queryByText('자기 자신')).not.toBeInTheDocument();
  });

  it('expiresAt 이 과거이면 "마감된 공지" 배너가 보인다', () => {
    mockUseNoticeListQuery.mockReturnValue(listSuccess());
    const pastDate = new Date(Date.now() - 86_400_000).toISOString();
    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({ expiresAt: pastDate })));

    render(<NoticeDetailPage />);

    expect(screen.getByText(/마감된 공지/)).toBeInTheDocument();
  });

  // 목록으로 자동 리다이렉트하던 것을 제자리 "볼 수 없음" 화면으로 바꿨다 — 주소가 유지돼야
  // 사용자가 무슨 일이 일어났는지 알 수 있고, 뒤로가기가 리다이렉트에 삼켜지지 않는다.
  it('403 에러이면 리다이렉트 없이 "볼 수 없음" 화면을 제자리에 보여준다', () => {
    mockRouterReplace.mockReset();
    mockUseNoticeListQuery.mockReturnValue(listSuccess());
    mockUseNoticeDetailQuery.mockReturnValue({ data: undefined, isLoading: false, isSuccess: false, isError: true, error: { status: 403 } });

    render(<NoticeDetailPage />);

    expect(screen.getByRole('heading', { level: 1, name: '이 소식은 지금 볼 수 없어요' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '소식 목록으로' })).toHaveAttribute('href', '/notices');
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  // 서버가 "볼 수 없는 공지"를 미존재와 같은 404 로 답하도록 바뀌었다(열거 방지) — 403 과 404 의
  // 화면이 한 글자라도 달라지면 그 차이가 곧 존재 여부를 알려주므로 완전히 같은 화면이어야 한다.
  it('404 에러여도 403 과 똑같은 "볼 수 없음" 화면을 보여준다', () => {
    mockRouterReplace.mockReset();
    mockUseNoticeListQuery.mockReturnValue(listSuccess());
    mockUseNoticeDetailQuery.mockReturnValue({ data: undefined, isLoading: false, isSuccess: false, isError: true, error: { status: 404 } });

    render(<NoticeDetailPage />);

    expect(screen.getByRole('heading', { level: 1, name: '이 소식은 지금 볼 수 없어요' })).toBeInTheDocument();
    expect(screen.getByText('삭제됐거나 볼 수 없는 소식이에요.')).toBeInTheDocument();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  // 403·404 가 아닌 실패(네트워크·5xx)는 "볼 수 없음" 이 아니라 기존 오류 문구로 남는다.
  it('500 에러는 "볼 수 없음" 이 아니라 오류 문구로 남는다', () => {
    mockUseNoticeListQuery.mockReturnValue(listSuccess());
    mockUseNoticeDetailQuery.mockReturnValue({ data: undefined, isLoading: false, isSuccess: false, isError: true, error: { status: 500 } });

    render(<NoticeDetailPage />);

    expect(screen.getByText('공지를 불러오지 못했습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: '이 소식은 지금 볼 수 없어요' })).not.toBeInTheDocument();
  });

  it('startAt 이 null 이어도 크래시 없이 "종료 일시까지" 로 렌더한다(prod 공지 14 재현)', () => {
    mockUseNoticeListQuery.mockReturnValue(listSuccess());
    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({
      linkUrl: 'https://forms.example.com/apply',
      eventInfo: { startAt: null, endAt: '2026-09-16T23:59:00', location: null, host: null, audience: null },
    })));

    render(<NoticeDetailPage />);

    // 모바일 요약 + 데스크탑 카드 + 모바일 하단 바가 같은 문구를 쓴다.
    expect(screen.getAllByText('9.16(수) 23:59까지')).toHaveLength(3);
    expect(screen.queryByText(/일시적인 오류/)).not.toBeInTheDocument();
  });
});
