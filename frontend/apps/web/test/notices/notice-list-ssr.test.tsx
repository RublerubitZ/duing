/**
 * @vitest-environment node
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/notices',
  // 정적 렌더 중 클라이언트 컴포넌트가 useSearchParams 를 부르면 가장 가까운 Suspense 경계(notices/loading.tsx)까지
  // 클라이언트 렌더로 넘어가 크롤러가 받는 HTML 에서 목록이 사라진다 — 목록 트리에 들어오면 여기서 깨지게 한다.
  useSearchParams: () => {
    throw new Error('소식 목록 정적 렌더 트리에서 useSearchParams 금지 — ISR HTML 이 로딩 셸로 바뀐다(CSR bailout)');
  },
  useParams: () => ({}),
  useSelectedLayoutSegment: () => null,
}));

import { seededNoticeListTree } from './notice-list-tree-fixture';

describe('소식 목록 트리 — 서버 렌더(ISR 정적 생성 회귀)', () => {
  it('시드된 첫 페이지를 throw 없이 그리고, 제목·상세 링크는 담고 NEW 배지는 뺀다', () => {
    // React 개발 경고(key 누락·잘못된 DOM 속성 등)는 서버 렌더에서 throw 없이 console.error 로만 남는다.
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const html = renderToString(seededNoticeListTree());

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
    // Suspense 안 SSR 오류는 renderToString 이 삼키고 <!--$!--> 표식만 남긴다.
    expect(html).not.toContain('<!--$!-->');
    expect(html).toContain('두잉 이용 안내');
    expect(html).toContain('가을 동아리 박람회 안내');
    expect(html).toContain('지원사업 신청 안내');
    expect(html).toContain('href="/notices/17"');
    expect(html).not.toContain('>NEW<');
  });
});
