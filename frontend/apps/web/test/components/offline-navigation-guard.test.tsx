import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { OfflineNavigationGuard } from '@/app/_components/OfflineNavigationGuard';

function mockNavigatorOnLine(value: boolean) {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(value);
}

afterEach(() => vi.restoreAllMocks());

function renderWithGuard(anchor: React.ReactNode) {
  return render(
    <ToastProvider>
      <OfflineNavigationGuard />
      {anchor}
    </ToastProvider>,
  );
}

describe('OfflineNavigationGuard', () => {
  it('오프라인에서 내부 라우트 앵커 클릭을 차단하고 토스트를 띄운다', async () => {
    mockNavigatorOnLine(false);
    const user = userEvent.setup();
    renderWithGuard(<a href="/clubs/1">동아리로</a>);

    const clickListener = vi.fn();
    document.querySelector('a')?.addEventListener('click', (clickEvent) => {
      clickListener(clickEvent.defaultPrevented);
    });
    await user.click(screen.getByText('동아리로'));

    expect(clickListener).toHaveBeenCalledWith(true); // defaultPrevented
    expect(await screen.findByText('인터넷 연결을 확인해주세요.')).toBeInTheDocument();
  });

  it('온라인이면 개입하지 않는다', async () => {
    mockNavigatorOnLine(true);
    const user = userEvent.setup();
    // 가드가 온라인일 때 개입하지 않는지만 검증하므로, 실제 내비게이션은 필요 없다.
    // jsdom 이 내부 라우트 앵커 클릭에서 시도하는 "not implemented: navigation" 콘솔
    // 노이즈를 피하기 위해 href 는 "#" 으로 둔다(가드는 온라인 분기에서 href 를 보기도 전에
    // 반환하므로 검증에 영향 없음).
    renderWithGuard(<a href="#">동아리로</a>);
    await user.click(screen.getByText('동아리로'));
    expect(screen.queryByText('인터넷 연결을 확인해주세요.')).not.toBeInTheDocument();
  });

  it('외부 링크·새 탭·다운로드·해시 앵커는 차단하지 않는다', async () => {
    mockNavigatorOnLine(false);
    const user = userEvent.setup();
    // jsdom 은 실제 내비게이션을 구현하지 않아 외부/새 탭 앵커 클릭 시 "not implemented:
    // navigation" 콘솔 노이즈를 낸다 — 가드가 의도적으로 개입하지 않는 케이스이므로 실제
    // 내비게이션 시도 자체를 막아 노이즈만 없앤다(가드의 통과 판단 로직에는 영향 없음).
    const preventNativeNavigation = (clickEvent: React.MouseEvent) => clickEvent.preventDefault();
    renderWithGuard(
      <>
        <a href="https://example.com" onClick={preventNativeNavigation}>
          외부
        </a>
        <a href="/file.zip" download onClick={preventNativeNavigation}>
          다운로드
        </a>
        <a href="/docs" target="_blank" rel="noreferrer" onClick={preventNativeNavigation}>
          새탭
        </a>
        <a href="#section">해시</a>
      </>,
    );
    await user.click(screen.getByText('외부'));
    await user.click(screen.getByText('다운로드'));
    await user.click(screen.getByText('새탭'));
    await user.click(screen.getByText('해시'));
    expect(screen.queryByText('인터넷 연결을 확인해주세요.')).not.toBeInTheDocument();
  });
});
