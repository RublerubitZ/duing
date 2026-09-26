import { renderHook } from '@testing-library/react';
import { NOT_FOUND_SEGMENT_KEY } from 'next/dist/shared/lib/segment';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoutePathname } from '../../app/_lib/useRoutePathname';

const { usePathnameMock, useSelectedLayoutSegmentMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string>(),
  useSelectedLayoutSegmentMock: vi.fn<() => string | null>(),
}));
vi.mock('next/navigation', () => ({
  usePathname: usePathnameMock,
  useSelectedLayoutSegment: useSelectedLayoutSegmentMock,
}));

beforeEach(() => {
  useSelectedLayoutSegmentMock.mockReturnValue(null);
});

describe('useRoutePathname — 프리렌더 경로 정규화', () => {
  it.each([
    // ISR 재생성 중 넘어오는 Next 내부 경로(#950)
    ['/index', '/'],
    // 합성 케이스 — 슬래시를 먼저 접어 '/index' 로 수렴시킨 뒤 '/' 로 접는다
    ['/index/', '/'],
    // skipTrailingSlashRedirect(PostHog 프록시, #750) 때문에 슬래시 URL 이 리다이렉트 없이
    // 그대로 서빙된다 — 프리렌더 셸은 무슬래시 경로로 렌더돼 있어, 접지 않으면 경로 파생
    // 렌더(BottomNav 가시성)가 갈려 hydration mismatch(React #418)가 난다.
    ['/clubs/53/', '/clubs/53'],
    ['/clubs/53', '/clubs/53'],
    ['/', '/'],
  ])('%s → %s', (rawPathname, normalizedPathname) => {
    usePathnameMock.mockReturnValue(rawPathname);
    const { result } = renderHook(() => useRoutePathname());
    expect(result.current).toBe(normalizedPathname);
  });

  it.each(['me', '(home)', 'calendar'])('세그먼트가 %s 면 404 로 접지 않는다', (segment) => {
    usePathnameMock.mockReturnValue('/me/applications');
    useSelectedLayoutSegmentMock.mockReturnValue(segment);
    const { result } = renderHook(() => useRoutePathname());
    expect(result.current).toBe('/me/applications');
  });
});

describe('useRoutePathname — 전역 404', () => {
  // 모든 404 는 `/_not-found` 로 프리렌더한 HTML 한 장이라 서버 렌더의 경로가 `/_not-found` 다 — 브라우저의 실제
  // 주소를 쓰면 탭 경로 아래 404 에서 BottomNav·AdSenseLoader 가 갈려 #418 이 난다(2026-09-26 실측).
  // 앱 코드는 리터럴을 쓰고 Next 내부 모듈을 import 하지 않는다 — Next 가 세그먼트 이름을 바꾸거나 옮기면 여기서 실패한다.
  it('Next 의 전역 404 세그먼트 키가 훅이 접는 값과 같다', () => {
    expect(NOT_FOUND_SEGMENT_KEY).toBe('/_not-found');
  });

  // 가드가 정규화보다 먼저라 '/index'·끝 슬래시 주소도 그대로 '/_not-found' 로 접힌다.
  it.each(['/me/no-such', '/calendar/no-such', '/facilities/1/2', '/no-such-page', '/clubs/53/', '/index'])(
    '404 렌더(세그먼트 /_not-found)면 실제 주소 %s 대신 /_not-found 를 돌려준다',
    (rawPathname) => {
      usePathnameMock.mockReturnValue(rawPathname);
      useSelectedLayoutSegmentMock.mockReturnValue('/_not-found');
      const { result } = renderHook(() => useRoutePathname());
      expect(result.current).toBe('/_not-found');
    },
  );
});
