import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBackDismiss } from '@/app/_lib/backDismiss';

// jsdom 의 traversal 은 태스크 큐에 실린다(실측 ~3ms · 매크로태스크 2틱). 고정 지연 대신
// popstate 발화 자체를 기다려야 안정적이다.
function nextPopState(): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
  });
}

// 닫기 콜백(마이크로태스크)과 죽은 엔트리 자동 스킵이 예약한 추가 traversal 까지 흘려보낸다.
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

describe('jsdom 히스토리 가정', () => {
  it('pushState 후 back() 이 popstate 를 발화하고 이전 state 로 되돌린다', async () => {
    window.history.replaceState({ marker: 'base' }, '');
    window.history.pushState({ marker: 'pushed' }, '');
    expect(window.history.state).toEqual({ marker: 'pushed' });

    const popped = vi.fn();
    window.addEventListener('popstate', popped);
    await pressBack();
    window.removeEventListener('popstate', popped);

    expect(popped).toHaveBeenCalledTimes(1);
    expect(window.history.state).toEqual({ marker: 'base' });
  });
});

type OverlayProps = { name: string; refuseClose?: boolean };

const closeSpy = vi.fn();

// 실제 소비처와 같은 모양 — 열림 상태를 스스로 들고, onClose 로 닫는다.
function Overlay({ name, refuseClose = false }: OverlayProps) {
  const [open, setOpen] = useState(true);
  useBackDismiss(open, () => {
    closeSpy(name);
    if (!refuseClose) setOpen(false);
  });
  return open ? <div data-testid={`overlay-${name}`} /> : null;
}

describe('useBackDismiss', () => {
  beforeEach(() => {
    closeSpy.mockClear();
    window.history.replaceState({ marker: 'page' }, '');
  });

  afterEach(async () => {
    cleanup();
    // 언마운트 정리가 예약한 back() 을 흘려보낸 뒤 다음 테스트로 넘어간다.
    await settle();
  });

  it('열리면 히스토리 엔트리를 1개 push 하고, 뒤로가기 1회에 닫힌다', async () => {
    const { queryByTestId } = render(<Overlay name="a" />);
    expect(queryByTestId('overlay-a')).not.toBeNull();
    // 기존 state 를 보존한 채 마커만 얹는다 — Next 의 __NA·내부 트리가 유실되면 안 된다.
    expect(window.history.state).toEqual({
      marker: 'page',
      __overlayToken: expect.any(String),
      __overlayId: expect.any(Number),
    });

    await pressBack();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(queryByTestId('overlay-a')).toBeNull();
    // 페이지 엔트리로 되돌아왔다 — 마커가 없다.
    expect(window.history.state).toEqual({ marker: 'page' });
  });

  it('중첩 오버레이는 최상단부터 순차적으로 닫힌다', async () => {
    const { queryByTestId } = render(
      <>
        <Overlay name="a" />
        <Overlay name="b" />
      </>,
    );

    await pressBack();
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenLastCalledWith('b');
    expect(queryByTestId('overlay-a')).not.toBeNull();
    expect(queryByTestId('overlay-b')).toBeNull();

    await pressBack();
    expect(closeSpy).toHaveBeenLastCalledWith('a');
    expect(queryByTestId('overlay-a')).toBeNull();
    expect(window.history.state).toEqual({ marker: 'page' });
  });

  it('코드로 닫으면 엔트리를 회수해 다음 뒤로가기는 페이지 몫이 된다', async () => {
    function CodeClosed() {
      const [open, setOpen] = useState(true);
      useBackDismiss(open, () => setOpen(false));
      return open ? (
        <button type="button" onClick={() => setOpen(false)}>
          닫기
        </button>
      ) : null;
    }

    const { getByRole } = render(<CodeClosed />);
    const popped = nextPopState();
    await act(async () => {
      getByRole('button').click();
      await popped;
    });
    await settle();

    // 우리 엔트리가 회수돼 페이지 엔트리 위에 앉아 있다.
    expect(window.history.state).toEqual({ marker: 'page' });
  });

  it('중간 오버레이를 코드로 닫아도 죽은 뒤로가기가 생기지 않는다', async () => {
    function Pair() {
      const [lowerOpen, setLowerOpen] = useState(true);
      const [upperOpen, setUpperOpen] = useState(true);
      useBackDismiss(lowerOpen, () => setLowerOpen(false));
      useBackDismiss(upperOpen, () => {
        closeSpy('upper');
        setUpperOpen(false);
      });
      return (
        <button type="button" onClick={() => setLowerOpen(false)}>
          아래 닫기
        </button>
      );
    }

    const { getByRole } = render(<Pair />);
    // 아래(중간) 오버레이만 코드로 닫는다 — 히스토리에는 주인 없는 엔트리가 남는다.
    await act(async () => {
      getByRole('button').click();
    });
    await settle();

    // 뒤로가기 1회로 위 오버레이가 닫히고, 죽은 엔트리는 자동 스킵돼 페이지 엔트리까지 내려온다.
    await pressBack();

    expect(closeSpy).toHaveBeenCalledWith('upper');
    expect(window.history.state).toEqual({ marker: 'page' });
  });

  it('이전 문서 토큰이 붙은 엔트리는 죽은 엔트리로 보고 건너뛴다', async () => {
    render(<Overlay name="a" />);
    // 오버레이 엔트리 아래에 이전 문서의 잔존 엔트리가 있는 상황을 만든다.
    const overlayState: unknown = window.history.state;
    window.history.replaceState({ __overlayToken: 'stale-doc', __overlayId: 99 }, '');
    window.history.pushState(overlayState, '');

    await pressBack();

    expect(closeSpy).toHaveBeenCalledWith('a');
    expect(window.history.state).toEqual({ marker: 'page' });
  });

  it('소비처가 닫기를 거부하면 엔트리를 다시 push 한다', async () => {
    const { queryByTestId } = render(<Overlay name="a" refuseClose />);

    await pressBack();
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(queryByTestId('overlay-a')).not.toBeNull();
    expect(window.history.state.__overlayId).toEqual(expect.any(Number));

    // 여전히 열려 있으므로 두 번째 뒤로가기도 시트가 먹는다.
    await pressBack();
    expect(closeSpy).toHaveBeenCalledTimes(2);
    expect(queryByTestId('overlay-a')).not.toBeNull();
  });

  it('죽은 엔트리가 많아도 자동 스킵은 10회로 제한된다', async () => {
    render(<Overlay name="a" />);
    const backSpy = vi.spyOn(window.history, 'back');
    for (let index = 0; index < 15; index += 1) {
      window.history.pushState({ __overlayToken: 'stale-doc', __overlayId: index }, '');
    }

    await pressBack();
    await settle();
    await settle();

    // 테스트가 부른 1회 + 자동 스킵 정확히 10회 — 더 적으면 스킵이 죽은 것이고, 더 많으면 상한이 샌 것이다.
    expect(backSpy.mock.calls.length).toBe(11);
    // 15개를 다 건너뛰지는 못했으므로 여전히 잔존 엔트리 위에 있다.
    expect(window.history.state.__overlayToken).toBe('stale-doc');
    backSpy.mockRestore();
  });

  it('오버레이를 여러 번 열고 닫아도 popstate 리스너는 추가로 등록되지 않는다', async () => {
    // 첫 마운트에서 설치가 끝난 상태를 만든 뒤부터 관찰한다.
    cleanup();
    const addListenerSpy = vi.spyOn(window, 'addEventListener');
    for (let index = 0; index < 3; index += 1) {
      const { unmount } = render(<Overlay name={`loop-${index}`} />);
      unmount();
      await settle();
    }

    const popstateRegistrations = addListenerSpy.mock.calls.filter(([type]) => type === 'popstate');
    expect(popstateRegistrations).toHaveLength(0);
    addListenerSpy.mockRestore();
  });
});
