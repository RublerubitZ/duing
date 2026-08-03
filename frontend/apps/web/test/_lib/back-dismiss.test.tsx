import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isOverlayOnlyTraversal, useBackDismiss } from '@/app/_lib/backDismiss';

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
    // 이전 페이지 센티넬을 아래에 깐다 — 없으면 히스토리를 한 칸 더 먹는 버그(예: back() 이중 호출)가
    // 같은 값의 엔트리에 흡수돼 단언을 통과해 버린다.
    // URL 도 매번 같은 기준선으로 되돌린다(경로를 바꾸는 테스트가 뒤 테스트에 새지 않게).
    window.history.replaceState({ marker: 'prev' }, '', '/test-page');
    window.history.pushState({ marker: 'page' }, '', '/test-page');
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

    // 회수가 과했는지 센티넬로 확인한다 — 뒤로 1회에 정확히 이전 페이지여야 한다.
    // 한계: jsdom 은 동기 back() 2회를 1칸으로 합쳐 처리하므로(실측), "회수를 2번 하는" 결함은
    // 여기서 잡히지 않는다. 그 축은 실브라우저 QA(닫기 직후 페이지가 유지되는지)가 담당한다.
    const poppedAgain = nextPopState();
    await act(async () => {
      window.history.back();
      await poppedAgain;
    });
    expect(window.history.state).toEqual({ marker: 'prev' });
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

  it('3중 중첩에서 중간을 코드로 닫아도 뒤로가기 1회는 최상단만 닫는다', async () => {
    function Triple() {
      const [lowerOpen, setLowerOpen] = useState(true);
      const [middleOpen, setMiddleOpen] = useState(true);
      const [upperOpen, setUpperOpen] = useState(true);
      useBackDismiss(lowerOpen, () => {
        closeSpy('lower');
        setLowerOpen(false);
      });
      useBackDismiss(middleOpen, () => {
        closeSpy('middle');
        setMiddleOpen(false);
      });
      useBackDismiss(upperOpen, () => {
        closeSpy('upper');
        setUpperOpen(false);
      });
      return (
        <>
          <button type="button" onClick={() => setMiddleOpen(false)}>
            중간 닫기
          </button>
          <span data-testid="open">{[lowerOpen && 'lower', upperOpen && 'upper'].filter(Boolean).join(',')}</span>
        </>
      );
    }

    const { getByRole, getByTestId } = render(<Triple />);
    // 중간만 코드로 닫는다 — 히스토리에 주인 없는 엔트리가 남는다.
    await act(async () => {
      getByRole('button').click();
    });
    await settle();

    await pressBack();

    // 최상단만 닫히고, 죽은 엔트리 아래의 오버레이는 살아 있어야 한다.
    expect(closeSpy.mock.calls.flat()).toEqual(['upper']);
    expect(getByTestId('open').textContent).toBe('lower');
    // 남아 있는 오버레이의 엔트리 위에 앉아 있어야 다음 뒤로가기가 그 오버레이 몫이 된다.
    expect(window.history.state.__overlayId).toEqual(expect.any(Number));

    await pressBack();
    expect(closeSpy.mock.calls.flat()).toEqual(['upper', 'lower']);
    expect(window.history.state).toEqual({ marker: 'page' });
  });

  it('이전 문서 토큰이 붙은 엔트리는 ID 가 겹쳐도 죽은 엔트리로 본다', async () => {
    // 다음에 발급될 오버레이 ID 를 알아내려고 한 번 열었다 닫는다.
    const probe = render(<Overlay name="probe" />);
    const probeId: number = window.history.state.__overlayId;
    probe.unmount();
    await settle();

    // 이전 문서가 남긴 엔트리 — 토큰만 다르고 ID 는 바로 다음 오버레이와 정확히 겹친다.
    // 토큰 대조가 없으면 이 엔트리를 살아 있는 오버레이로 오판해 뒤로가기가 아무 일도 하지 않는다.
    window.history.pushState({ __overlayToken: 'stale-doc', __overlayId: probeId + 1 }, '');
    closeSpy.mockClear();

    render(<Overlay name="a" />);
    expect(window.history.state.__overlayId).toBe(probeId + 1);

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

  it('Next 가 replace 로 state 를 갈아치워도 엔트리를 회수한다', async () => {
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
    // Next 의 HistoryUpdater 재현 — navigate/refresh/서버액션 경로는 커스텀 state 를 보존하지 않는다.
    window.history.replaceState({ __NA: true, tree: ['fake'] }, '');
    // 우리 마커가 다시 얹혀 있어야 한다.
    expect(window.history.state.__overlayId).toEqual(expect.any(Number));

    const popped = nextPopState();
    await act(async () => {
      getByRole('button').click();
      await popped;
    });
    await settle();

    expect(window.history.state).toEqual({ marker: 'page' });
  });

  it('시트 안에서 URL 이 바뀌었으면 닫을 때 그 URL 을 유지한다', async () => {
    function UrlSyncingSheet() {
      const [open, setOpen] = useState(true);
      useBackDismiss(open, () => setOpen(false));
      return open ? (
        <>
          <button
            type="button"
            // 실제 소비처(router.replace)와 같은 모양 — 경로는 그대로 두고 쿼리만 바꾼다.
            onClick={() => window.history.replaceState({}, '', `${window.location.pathname}?cat=A`)}
          >
            필터
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            닫기
          </button>
        </>
      ) : null;
    }

    const { getByText } = render(<UrlSyncingSheet />);
    await act(async () => {
      getByText('필터').click();
    });
    expect(window.location.search).toBe('?cat=A');

    const popped = nextPopState();
    await act(async () => {
      getByText('닫기').click();
      await popped;
    });
    await settle();

    // 시트만 닫혔을 뿐인데 필터가 초기화되면 안 된다.
    expect(window.location.search).toBe('?cat=A');
    expect(window.history.state.__overlayId).toBeUndefined();
  });

  it('앞으로 가기로 죽은 엔트리에 올라오면 되돌려 보내지 않는다', async () => {
    const { unmount } = render(<Overlay name="a" />);
    // 시트를 연 채 언마운트 — 주인 없는 엔트리가 남는다(페이지 이동 상황과 동일).
    unmount();
    await settle();
    // 그 위에 다음 페이지 엔트리를 쌓는다.
    window.history.pushState({ marker: 'next-page' }, '');

    const backPopped = nextPopState();
    await act(async () => {
      window.history.back();
      await backPopped;
    });
    await settle();

    const forwardPopped = nextPopState();
    await act(async () => {
      window.history.forward();
      await forwardPopped;
    });
    await settle();

    // 앞으로 가기가 자동 스킵에 되감기면 다음 페이지에 영원히 도달할 수 없다.
    expect(window.history.state).toEqual({ marker: 'next-page' });
  });

  it('onClose 가 열린 뒤에 붙어도 엔트리를 등록한다', async () => {
    function LateClose({ ready }: { ready: boolean }) {
      useBackDismiss(true, ready ? () => closeSpy('late') : null);
      return <div data-testid="late" />;
    }

    const { rerender } = render(<LateClose ready={false} />);
    rerender(<LateClose ready />);

    await pressBack();

    expect(closeSpy).toHaveBeenCalledWith('late');
  });

  // next-view-transitions 는 popstate 마다 전환을 시작하고 pathname/hash 변경 effect 에서만 끝낸다.
  // URL 이 그대로인 오버레이 닫기에서 전환이 시작되면 끝나지 않아 화면이 스냅샷에 묶이고 4초 뒤
  // TimeoutError 로 중단된다(실브라우저 실측). 그래서 이 경우에만 전환을 억제한다.
  it('오버레이만 닫는 뒤로가기는 페이지 전환 억제 신호를 켠다', async () => {
    render(<Overlay name="a" />);
    const observed: boolean[] = [];
    // 모듈 리스너보다 나중에 등록되므로 모듈이 판정을 마친 뒤에 실행된다.
    const probe = () => observed.push(isOverlayOnlyTraversal());
    window.addEventListener('popstate', probe);
    await pressBack();
    window.removeEventListener('popstate', probe);

    expect(observed).toEqual([true]);
    // 같은 태스크가 끝나면 해제돼 이후 내비게이션에 영향을 주지 않는다.
    expect(isOverlayOnlyTraversal()).toBe(false);
  });

  it('오버레이를 닫으면서 페이지도 바뀌는 이동은 전환을 억제하지 않는다', async () => {
    // 이전 페이지(다른 경로) → 현재 페이지 → 오버레이 순으로 쌓고, 두 칸을 한 번에 되돌아간다.
    window.history.replaceState({ marker: 'prev-page' }, '', '/prev-page');
    window.history.pushState({ marker: 'page' }, '', '/current-page');
    render(<Overlay name="a" />);

    const observed: boolean[] = [];
    const probe = () => observed.push(isOverlayOnlyTraversal());
    window.addEventListener('popstate', probe);

    const popped = nextPopState();
    await act(async () => {
      window.history.go(-2);
      await popped;
    });
    await settle();
    window.removeEventListener('popstate', probe);

    // 오버레이는 닫히지만 페이지가 실제로 바뀌었으므로 전환은 정상적으로 돌아야 한다.
    expect(closeSpy).toHaveBeenCalledWith('a');
    expect(window.location.pathname).toBe('/prev-page');
    expect(observed[0]).toBe(false);
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
