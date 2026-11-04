import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useSelectedLayoutSegment: () => null,
}));

import { AdSenseLoader, isAdSenseAllowedPath } from '@/app/_components/AdSenseLoader';

// React 19 는 <script async src> 를 렌더 위치와 무관하게 document.head 로 호이스팅한다 —
// 컨테이너가 아니라 head 를 본다. 언마운트해도 제거되지 않으므로 케이스마다 직접 걷어낸다.
function hoistedAdSenseScripts(): HTMLScriptElement[] {
  return Array.from(document.head.querySelectorAll<HTMLScriptElement>('script[src*="adsbygoogle"]'));
}

describe('AdSenseLoader — 게시자 콘텐츠가 있는 공개 화면에서만 광고 로더를 싣는다', () => {
  afterEach(() => {
    hoistedAdSenseScripts().forEach((script) => script.remove());
  });

  it.each(['/', '/clubs', '/notices', '/introduce', '/terms', '/faq'])(
    '경로만으로 게시자 콘텐츠가 있는 공개 화면 %s 는 레이아웃이 싣는다',
    (pathname) => {
      expect(isAdSenseAllowedPath(pathname)).toBe(true);
    },
  );

  // 상세는 같은 경로가 없는·숨긴·삭제된 자원의 noindex 셸이 되기도 하고, 동아리 상세는 소개 한 줄뿐인 곳도 있다 —
  // 서버 조회 결과를 아는 page.tsx 가 콘텐츠가 있을 때만 싣는다(레이아웃은 싣지 않는다).
  // '/clubs/(...)clubs/1' 은 인터셉트 결과 경로 — 주소로 직접 열면 데이터 없는 noindex 셸이 200 으로 열린다.
  it.each(['/clubs/1', '/notices/14', '/clubs/999999', '/notices/10', '/clubs/(...)clubs/1'])(
    '상세 %s 는 레이아웃이 싣지 않는다 — 페이지가 판단한다',
    (pathname) => {
      expect(isAdSenseAllowedPath(pathname)).toBe(false);
    },
  );

  it.each([
    '/manage/1',
    '/admin',
    '/me',
    '/me/settings',
    '/apply/1',
    '/notifications',
    '/login',
    '/signup',
    '/join/ABCD1234',
    '/403',
    // 전역 404 렌더 — useRoutePathname 이 서버 프리렌더와 같은 '/_not-found' 로 접는다(404 화면엔 광고를 싣지 않는다).
    '/_not-found',
  ])('개인정보·인증 화면 %s 는 거부된다', (pathname) => {
    expect(isAdSenseAllowedPath(pathname)).toBe(false);
  });

  // 게시자 콘텐츠가 없는 공개 화면 — 예약 현황·캠퍼스 일정은 도구 화면이다.
  it.each(['/facilities', '/facilities/1', '/calendar'])(
    '게시자 콘텐츠가 없는 도구 화면 %s 는 거부된다',
    (pathname) => {
      expect(isAdSenseAllowedPath(pathname)).toBe(false);
    },
  );

  it('동아리 부원 전용 영역과 그 밖의 상세 하위 경로도 거부된다', () => {
    expect(isAdSenseAllowedPath('/clubs/1/member')).toBe(false);
    expect(isAdSenseAllowedPath('/clubs/1/member/notices')).toBe(false);
    expect(isAdSenseAllowedPath('/clubs/1/membership-x')).toBe(false);
  });

  it('허용 경로와 글자만 겹치는 경로는 거부된다', () => {
    expect(isAdSenseAllowedPath('/clubsecret')).toBe(false);
    expect(isAdSenseAllowedPath('/terms-of-nothing')).toBe(false);
  });

  it('운영 콘솔(/manage/1)에서는 로더 스크립트를 head 에 넣지 않는다', () => {
    mockUsePathname.mockReturnValue('/manage/1');

    render(<AdSenseLoader />);

    expect(hoistedAdSenseScripts()).toHaveLength(0);
  });

  it('ISR 재생성 경로(/index)는 홈으로 접혀 로더를 head 에 평문 async 스크립트로 싣는다', () => {
    mockUsePathname.mockReturnValue('/index');

    render(<AdSenseLoader />);

    const hoisted = hoistedAdSenseScripts();
    expect(hoisted).toHaveLength(1);
    const loaderScript = hoisted[0];
    // React 가 호이스팅한 리소스 스크립트는 async 를 속성으로만 남긴다(프로퍼티는 미설정) — 직렬화되는 쪽을 본다.
    expect(loaderScript?.hasAttribute('async')).toBe(true);
    expect(loaderScript?.getAttribute('crossorigin')).toBe('anonymous');
    expect(loaderScript?.src).toContain('client=ca-pub-3402309590379365');
  });
});
