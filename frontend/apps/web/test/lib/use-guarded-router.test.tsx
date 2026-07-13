import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';

const pushSpy = vi.fn();
const replaceSpy = vi.fn();
const backSpy = vi.fn();
const refreshSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushSpy,
    replace: replaceSpy,
    back: backSpy,
    forward: vi.fn(),
    refresh: refreshSpy,
    prefetch: vi.fn(),
  }),
}));

function mockNavigatorOnLine(value: boolean) {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(value);
}

afterEach(() => {
  vi.restoreAllMocks();
  pushSpy.mockClear();
  replaceSpy.mockClear();
  backSpy.mockClear();
  refreshSpy.mockClear();
});

function GuardedCaller({ action }: { action: 'push' | 'replace' | 'back' | 'refresh' }) {
  const router = useGuardedRouter();
  return (
    <button
      onClick={() => {
        if (action === 'push') router.push('/clubs/1');
        else if (action === 'replace') router.replace('/clubs/1');
        else if (action === 'back') router.back();
        else router.refresh();
      }}
    >
      이동
    </button>
  );
}

describe('useGuardedRouter', () => {
  it('오프라인이면 push를 차단하고 토스트를 띄운다', async () => {
    mockNavigatorOnLine(false);
    render(
      <ToastProvider>
        <GuardedCaller action="push" />
      </ToastProvider>,
    );
    act(() => {
      screen.getByText('이동').click();
    });
    expect(pushSpy).not.toHaveBeenCalled();
    expect(await screen.findByText('인터넷 연결을 확인해주세요.')).toBeInTheDocument();
  });

  it('오프라인이면 replace도 차단한다', () => {
    mockNavigatorOnLine(false);
    render(
      <ToastProvider>
        <GuardedCaller action="replace" />
      </ToastProvider>,
    );
    act(() => {
      screen.getByText('이동').click();
    });
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('온라인이면 push/replace를 그대로 통과시킨다', () => {
    mockNavigatorOnLine(true);
    render(
      <ToastProvider>
        <GuardedCaller action="push" />
      </ToastProvider>,
    );
    act(() => {
      screen.getByText('이동').click();
    });
    expect(pushSpy).toHaveBeenCalledWith('/clubs/1');
  });

  it('온라인이면 replace를 그대로 통과시킨다', () => {
    mockNavigatorOnLine(true);
    render(
      <ToastProvider>
        <GuardedCaller action="replace" />
      </ToastProvider>,
    );
    act(() => {
      screen.getByText('이동').click();
    });
    expect(replaceSpy).toHaveBeenCalledWith('/clubs/1');
  });

  it('back 등 나머지 메서드는 오프라인에서도 통과한다 (히스토리/캐시 기반)', () => {
    mockNavigatorOnLine(false);
    render(
      <ToastProvider>
        <GuardedCaller action="back" />
      </ToastProvider>,
    );
    act(() => {
      screen.getByText('이동').click();
    });
    expect(backSpy).toHaveBeenCalled();
  });

  it('오프라인이면 refresh를 무토스트로 차단한다', () => {
    mockNavigatorOnLine(false);
    render(
      <ToastProvider>
        <GuardedCaller action="refresh" />
      </ToastProvider>,
    );
    act(() => {
      screen.getByText('이동').click();
    });
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('인터넷 연결을 확인해주세요.')).not.toBeInTheDocument();
  });

  it('온라인이면 refresh를 그대로 통과시킨다', () => {
    mockNavigatorOnLine(true);
    render(
      <ToastProvider>
        <GuardedCaller action="refresh" />
      </ToastProvider>,
    );
    act(() => {
      screen.getByText('이동').click();
    });
    expect(refreshSpy).toHaveBeenCalled();
  });

  it('ToastProvider 밖에서도 throw하지 않고 오프라인 push를 차단한다', () => {
    mockNavigatorOnLine(false);
    expect(() => {
      render(<GuardedCaller action="push" />);
      act(() => {
        screen.getByText('이동').click();
      });
    }).not.toThrow();
    expect(pushSpy).not.toHaveBeenCalled();
  });
});
