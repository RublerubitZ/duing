import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
  it('오프라인에서 내부 라우트 앵커 클릭을 차단하고 React onClick 부수효과도 함께 막는다', async () => {
    mockNavigatorOnLine(false);
    const user = userEvent.setup();
    const clickSpy = vi.fn();
    renderWithGuard(
      <a href="/clubs/1" onClick={clickSpy}>
        동아리로
      </a>,
    );

    await user.click(screen.getByText('동아리로'));

    // stopPropagation 으로 캡처 리스너가 전파를 끊어 React onClick(부수효과) 자체가 실행되지 않는다.
    expect(clickSpy).not.toHaveBeenCalled();
    expect(await screen.findByText('인터넷 연결을 확인해주세요.')).toBeInTheDocument();
  });

  it('온라인이면 개입하지 않아 React onClick 이 정상 실행된다', async () => {
    mockNavigatorOnLine(true);
    const user = userEvent.setup();
    const clickSpy = vi.fn();
    // 가드가 온라인일 때 개입하지 않는지만 검증하므로, 실제 내비게이션은 필요 없다.
    // jsdom 이 내부 라우트 앵커 클릭에서 시도하는 "not implemented: navigation" 콘솔
    // 노이즈를 피하기 위해 href 는 "#" 으로 둔다(가드는 온라인 분기에서 href 를 보기도 전에
    // 반환하므로 검증에 영향 없음).
    renderWithGuard(
      <a href="#" onClick={clickSpy}>
        동아리로
      </a>,
    );
    await user.click(screen.getByText('동아리로'));

    // 가드가 개입하지 않으므로 React onClick(부수효과)이 그대로 실행된다.
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('인터넷 연결을 확인해주세요.')).not.toBeInTheDocument();
  });

  it('오프라인이어도 metaKey(또는 ctrlKey) 클릭은 차단하지 않아 새 탭 등 브라우저 기본 동작을 보존한다', () => {
    mockNavigatorOnLine(false);
    const clickSpy = vi.fn();
    renderWithGuard(
      <a href="/clubs/1" onClick={clickSpy}>
        동아리로
      </a>,
    );

    // userEvent 는 modifier 키 전달이 번거로워, 기존 파일 관행대로 이런 케이스는 fireEvent 로 확실히 전달한다.
    fireEvent.click(screen.getByText('동아리로'), { metaKey: true });

    // 수정자 키 클릭은 가드가 개입하지 않아 React onClick(부수효과)이 그대로 실행된다.
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('인터넷 연결을 확인해주세요.')).not.toBeInTheDocument();
  });

  it('외부 링크·새 탭·다운로드·해시 앵커는 차단하지 않고 onClick 도 그대로 실행된다', async () => {
    mockNavigatorOnLine(false);
    const user = userEvent.setup();
    const clickSpy = vi.fn();
    // jsdom 은 실제 내비게이션을 구현하지 않아 외부/새 탭 앵커 클릭 시 "not implemented:
    // navigation" 콘솔 노이즈를 낸다 — 가드가 의도적으로 개입하지 않는 케이스이므로 실제
    // 내비게이션 시도 자체를 막아 노이즈만 없앤다(가드의 통과 판단 로직에는 영향 없음).
    const preventNativeNavigation = (clickEvent: React.MouseEvent) => {
      clickEvent.preventDefault();
      clickSpy();
    };
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
        <a href="#section" onClick={clickSpy}>
          해시
        </a>
      </>,
    );
    await user.click(screen.getByText('외부'));
    await user.click(screen.getByText('다운로드'));
    await user.click(screen.getByText('새탭'));
    await user.click(screen.getByText('해시'));

    // 가드가 stopPropagation 을 걸지 않았다는 증명 — 오프라인이어도 네 앵커 모두 onClick 이 실행된다.
    expect(clickSpy).toHaveBeenCalledTimes(4);
    expect(screen.queryByText('인터넷 연결을 확인해주세요.')).not.toBeInTheDocument();
  });
});
