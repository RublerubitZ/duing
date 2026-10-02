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
  usePathname: () => '/clubs/1',
  // 정적 렌더 중 클라이언트 컴포넌트가 useSearchParams 를 부르면 가장 가까운 Suspense 경계([clubId]/loading.tsx)까지
  // 클라이언트 렌더로 넘어가 크롤러가 받는 HTML 에서 본문이 사라진다 — 상세 트리에 들어오면 여기서 깨지게 한다.
  useSearchParams: () => {
    throw new Error(
      '동아리 상세 정적 렌더 트리에서 useSearchParams 금지 — ISR HTML 이 로딩 셸로 바뀐다(CSR bailout)',
    );
  },
  useParams: () => ({ clubId: '1' }),
  useSelectedLayoutSegment: () => null,
}));

import { seededClubDetailTree } from './club-detail-tree-fixture';

describe('동아리 상세 트리 — 서버 렌더(ISR 정적 생성 회귀)', () => {
  it('HTML 소개·모집 중인 동아리를 throw 없이 그리고, 본문은 담고 D-day 는 뺀다', () => {
    // React 개발 경고(key 누락·잘못된 DOM 속성 등)는 서버 렌더에서 throw 없이 console.error 로만 남는다.
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const html = renderToString(seededClubDetailTree());

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
    expect(html).toContain('모션케어 인스타그램');
  });
});
