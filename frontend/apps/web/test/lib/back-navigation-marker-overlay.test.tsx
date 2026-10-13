import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { skipNextOverlayReclaim, useBackDismiss } from '@/app/_lib/backDismiss';
import { installBackNavigationViewTransitionGuard } from '@/app/_lib/backNavigationViewTransition';

const MARKER = 'data-back-navigation';

// back-dismiss.test.tsx 와 같은 도구 — jsdom traversal 은 태스크 큐에 실리므로 popstate 발화를 기다린다.
function nextPopState(): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

async function pressBack() {
  const popped = nextPopState();
  await act(async () => {
    window.history.back();
    await popped;
  });
  await settle();
}

function Overlay() {
  const [open, setOpen] = useState(true);
  useBackDismiss(open, () => setOpen(false));
  return open ? <div data-testid="overlay" /> : null;
}

beforeAll(() => {
  // providers 와 같은 진입점 — 가드가 backDismiss 를 먼저 설치해 오버레이 판정이 마커 리스너 시점에 보인다.
  installBackNavigationViewTransitionGuard();
});

beforeEach(() => {
  window.history.replaceState({ marker: 'prev' }, '', '/test-page');
  window.history.pushState({ marker: 'page' }, '', '/test-page');
});

afterEach(async () => {
  cleanup();
  await settle();
  document.documentElement.removeAttribute(MARKER);
});

describe('뒤로가기 마커 × 오버레이 뒤로가기(실제 backDismiss)', () => {
  it('시트를 뒤로가기로 닫으면 마커를 세우지 않는다 — 닫고 바로 카드를 눌러도 앞으로 이동으로 읽힌다', async () => {
    render(<Overlay />);

    await pressBack();

    expect(document.documentElement.hasAttribute(MARKER)).toBe(false);
  });

  it('페이지가 바뀌는 뒤로가기는 마커를 세운다', async () => {
    // Next 이동 커밋과 같은 모양(__NA)으로 다음 페이지 엔트리를 쌓는다.
    window.history.pushState({ __NA: true }, '', '/next-page');

    await pressBack();

    expect(document.documentElement.hasAttribute(MARKER)).toBe(true);
  });

  it('죽은 엔트리 2-hop — 첫 hop 이 세운 마커를 오버레이 전용 두 번째 hop 이 내리지 않는다', async () => {
    // [page][죽은 시트 엔트리][next-page] — 시트 안 링크로 이동한 경로. 뒤로가기 1회에 두 번 popstate 가 난다.
    const { unmount } = render(<Overlay />);
    skipNextOverlayReclaim();
    unmount();
    await settle();
    window.history.pushState({ __NA: true }, '', '/next-page');

    await pressBack();

    expect(window.history.state).toEqual({ marker: 'page' });
    expect(window.location.pathname).toBe('/test-page');
    expect(document.documentElement.hasAttribute(MARKER)).toBe(true);
  });
});
