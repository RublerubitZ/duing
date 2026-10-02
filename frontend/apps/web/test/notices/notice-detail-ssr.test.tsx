/**
 * @vitest-environment node
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/notices/42',
  // 정적 렌더 중 클라이언트 컴포넌트가 useSearchParams 를 부르면 가장 가까운 Suspense 경계([noticeId]/loading.tsx)까지
  // 클라이언트 렌더로 넘어가 크롤러가 받는 HTML 에서 본문이 사라진다 — 상세 트리에 들어오면 여기서 깨지게 한다.
  useSearchParams: () => {
    throw new Error('소식 상세 정적 렌더 트리에서 useSearchParams 금지 — ISR HTML 이 로딩 셸로 바뀐다(CSR bailout)');
  },
  useParams: () => ({ noticeId: '42' }),
  useSelectedLayoutSegment: () => null,
}));

import { expiredNoticeDetail, seededNoticeDetailTree } from './notice-detail-tree-fixture';

describe('소식 상세 트리 — 서버 렌더(ISR 정적 생성 회귀)', () => {
  it('HTML 본문·마감 있는 소식을 throw 없이 그리고, 본문은 담고 시각 의존 표시는 뺀다', () => {
    // React 개발 경고(key 누락·잘못된 DOM 속성 등)는 서버 렌더에서 throw 없이 console.error 로만 남는다.
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const html = renderToString(seededNoticeDetailTree());

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
    // Suspense 안 SSR 오류는 renderToString 이 throw·console.error 없이 삼키고 <!--$!--> 표식만 남긴다.
    expect(html).not.toContain('<!--$!-->');
    expect(html).toContain('2026 가을 동아리 박람회 안내');
    expect(html).toContain('박람회 일정과 부스 배치를 안내해요');
    expect(html).toContain('중앙광장');
    expect(html).toContain('부스 신청');
    expect(html).toContain('공지 정보');
    expect(html).not.toContain('D-3');
    expect(html).not.toContain('마감된 공지');
  });

  it('마감이 지난 소식도 서버 HTML 에 만료 배너를 넣지 않는다 — 배너는 하이드레이션 뒤에만', () => {
    const html = renderToString(seededNoticeDetailTree(expiredNoticeDetail));

    expect(html).toContain('2026 가을 동아리 박람회 안내');
    expect(html).not.toContain('마감된 공지');
  });
});
