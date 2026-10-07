import { renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useEntranceMotion } from '../../app/_lib/useEntranceMotion';

afterEach(() => {
  document.documentElement.removeAttribute('data-back-navigation');
});

function Probe({ isLoading }: { isLoading: boolean }) {
  return <span data-plays={String(useEntranceMotion(isLoading))} />;
}

describe('useEntranceMotion — 마운트 시점에 등장 연출 재생 여부를 고정한다', () => {
  it('앞으로 들어온 마운트(마커 없음)는 데이터가 있어도 참이다', () => {
    const { result } = renderHook(() => useEntranceMotion(false));
    expect(result.current).toBe(true);
  });

  it('뒤로·앞으로 가기 마커가 선 채 데이터와 함께 마운트하면 거짓이다', () => {
    document.documentElement.setAttribute('data-back-navigation', '');
    const { result } = renderHook(() => useEntranceMotion(false));
    expect(result.current).toBe(false);
  });

  it('마커가 서 있어도 데이터를 기다리며 마운트하면(스켈레톤 경유) 참이다', () => {
    document.documentElement.setAttribute('data-back-navigation', '');
    const { result } = renderHook(() => useEntranceMotion(true));
    expect(result.current).toBe(true);
  });

  it('마운트 뒤 마커·로딩이 바뀌어도 값이 그대로다', () => {
    document.documentElement.setAttribute('data-back-navigation', '');
    const { result, rerender } = renderHook(({ isLoading }) => useEntranceMotion(isLoading), {
      initialProps: { isLoading: false },
    });
    expect(result.current).toBe(false);

    document.documentElement.removeAttribute('data-back-navigation');
    rerender({ isLoading: true });
    expect(result.current).toBe(false);
  });

  it('서버 렌더(문서 없음)에서는 참이다 — 서버 HTML 에 연출 클래스가 실린다', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);
    try {
      expect(renderToString(<Probe isLoading={false} />)).toContain('data-plays="true"');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
