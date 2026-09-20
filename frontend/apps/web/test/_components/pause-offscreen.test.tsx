import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PauseOffscreen } from '../../app/_components/PauseOffscreen';

/** 실제 IntersectionObserverEntry 는 jsdom 에 없다 — 컴포넌트가 읽는 필드만 가진 최소 엔트리로 대체한다. */
type ObservedEntry = { isIntersecting: boolean };
type ObserverCallback = (entries: ObservedEntry[]) => void;

/** 마지막으로 생성된 옵서버의 콜백·observe·disconnect 를 테스트에서 직접 다루기 위한 mock. */
let latestCallback: ObserverCallback | null = null;
const observeMock = vi.fn();
const disconnectMock = vi.fn();

class MockIntersectionObserver {
  constructor(callback: ObserverCallback) {
    latestCallback = callback;
  }
  observe(target: Element) {
    observeMock(target);
  }
  unobserve() {}
  disconnect() {
    disconnectMock();
  }
}

function stubIntersectionObserver() {
  latestCallback = null;
  observeMock.mockClear();
  disconnectMock.mockClear();
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
}

/** 래퍼 div 는 자식의 부모다 — 컴포넌트가 자체 testid 를 달지 않으므로 자식을 통해 집는다. */
function renderWrapper() {
  render(
    <PauseOffscreen>
      <span data-testid="child">티커</span>
    </PauseOffscreen>,
  );
  return screen.getByTestId('child').parentElement;
}

function emit(isIntersecting: boolean) {
  act(() => {
    latestCallback?.([{ isIntersecting }]);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PauseOffscreen', () => {
  it('뷰포트 밖으로 나가면 래퍼에 data-offscreen 이 붙는다', () => {
    stubIntersectionObserver();
    const wrapper = renderWrapper();

    // 관측 대상이 래퍼 자신이어야 자식 섹션의 가시성이 아니라 래퍼 기준으로 판정된다.
    expect(observeMock).toHaveBeenCalledWith(wrapper);
    expect(wrapper).not.toHaveAttribute('data-offscreen');
    emit(false);
    expect(wrapper).toHaveAttribute('data-offscreen');
  });

  it('뷰포트로 돌아오면 data-offscreen 이 사라진다', () => {
    stubIntersectionObserver();
    const wrapper = renderWrapper();

    emit(false);
    expect(wrapper).toHaveAttribute('data-offscreen');
    emit(true);
    expect(wrapper).not.toHaveAttribute('data-offscreen');
  });

  it('IntersectionObserver 미지원이면 속성 없이 그대로 재생한다', () => {
    vi.stubGlobal('IntersectionObserver', undefined);

    expect(() => renderWrapper()).not.toThrow();
    expect(screen.getByTestId('child').parentElement).not.toHaveAttribute('data-offscreen');
  });

  it('언마운트하면 옵서버를 해제한다', () => {
    stubIntersectionObserver();
    const { unmount } = render(
      <PauseOffscreen>
        <span data-testid="child">티커</span>
      </PauseOffscreen>,
    );

    expect(disconnectMock).not.toHaveBeenCalled();
    unmount();
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });
});
