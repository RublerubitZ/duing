import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRoutePathname } from '../../app/_lib/useRoutePathname';

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: usePathnameMock }));

describe('useRoutePathname — 프리렌더 경로 정규화', () => {
  it.each([
    // ISR 재생성 중 넘어오는 Next 내부 경로(#950)
    ['/index', '/'],
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
});
