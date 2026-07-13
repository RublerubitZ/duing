import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { OfflineBanner } from '@/app/_components/OfflineBanner';

function mockNavigatorOnLine(value: boolean) {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(value);
}

afterEach(() => vi.restoreAllMocks());

describe('OfflineBanner', () => {
  it('온라인이면 live region 래퍼는 있지만 문구는 없다', () => {
    // role="status" 래퍼는 상시 마운트한다 — 콘텐츠와 함께 삽입되면 스크린리더가 공지를
    // 놓치는 조합이 있어, 빈 래퍼를 미리 띄워두고 문구만 토글한다.
    mockNavigatorOnLine(true);
    render(<OfflineBanner />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.queryByText('인터넷 연결을 확인해주세요.')).not.toBeInTheDocument();
  });

  it('오프라인 전환 시 배너를 띄우고 복귀 시 제거한다', () => {
    mockNavigatorOnLine(false);
    render(<OfflineBanner />);
    act(() => window.dispatchEvent(new Event('offline')));
    expect(screen.getByRole('status')).toHaveTextContent('인터넷 연결을 확인해주세요.');

    mockNavigatorOnLine(true);
    act(() => window.dispatchEvent(new Event('online')));
    expect(screen.queryByText('인터넷 연결을 확인해주세요.')).not.toBeInTheDocument();
  });
});
