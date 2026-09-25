import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

import { AdSenseLoader, isAdSenseAllowedPath } from '@/app/_components/AdSenseLoader';

// React 19 는 <script async src> 를 렌더 위치와 무관하게 document.head 로 호이스팅한다 —
// 컨테이너가 아니라 head 를 본다. 언마운트해도 제거되지 않으므로 케이스마다 직접 걷어낸다.
function hoistedAdSenseScripts(): HTMLScriptElement[] {
  return Array.from(document.head.querySelectorAll<HTMLScriptElement>('script[src*="adsbygoogle"]'));
}

describe('AdSenseLoader — 공개 화면에서만 광고 로더를 싣는다', () => {
  afterEach(() => {
    hoistedAdSenseScripts().forEach((script) => script.remove());
  });

  it.each([
    '/',
    '/clubs',
    '/clubs/1',
    '/notices',
    '/notices/14',
    '/calendar',
    '/facilities',
    '/faq',
    '/introduce',
    '/terms',
  ])('공개 탐색 경로 %s 는 허용된다', (pathname) => {
    expect(isAdSenseAllowedPath(pathname)).toBe(true);
  });

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
  ])('개인정보·인증 화면 %s 는 거부된다', (pathname) => {
    expect(isAdSenseAllowedPath(pathname)).toBe(false);
  });

  // 부원 전용 공지·일정은 MemberAccessGuard 뒤 회원 전용 화면이다 — /clubs 허용 프리픽스에 묻히면 안 된다.
  it('동아리 부원 전용 영역은 /clubs 허용 판정보다 먼저 거부된다', () => {
    expect(isAdSenseAllowedPath('/clubs/1/member')).toBe(false);
    expect(isAdSenseAllowedPath('/clubs/1/member/notices')).toBe(false);
    // 세그먼트 경계 — 'member' 로 시작만 하는 다른 하위 경로까지 막지는 않는다.
    expect(isAdSenseAllowedPath('/clubs/1/membership-x')).toBe(true);
  });

  it('허용 프리픽스와 글자만 겹치는 경로는 세그먼트가 달라 거부된다', () => {
    // startsWith('/clubs') 만으로 판정하면 이런 경로까지 광고가 붙는다.
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
