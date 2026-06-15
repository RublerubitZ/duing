import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToastProvider, useToast } from '@/app/_components/toast/ToastProvider';

function Trigger({ message, durationMs }: { message: string; durationMs?: number }) {
  const { addToast } = useToast();
  return (
    <button type="button" onClick={() => addToast(message, { variant: 'error', durationMs })}>
      띄우기
    </button>
  );
}

describe('ToastProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('addToast 로 띄운 메시지를 화면에 보여준다', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger message="저장됐어요" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: '띄우기' }));
    expect(screen.getByText('저장됐어요')).toBeInTheDocument();
  });

  it('닫기 버튼을 누르면 토스트가 사라진다', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger message="안내 메시지" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: '띄우기' }));
    await user.click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(screen.queryByText('안내 메시지')).not.toBeInTheDocument();
  });

  it('durationMs 가 지나면 자동으로 사라진다', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger message="잠깐 알림" durationMs={3000} />
      </ToastProvider>,
    );

    act(() => {
      screen.getByRole('button', { name: '띄우기' }).click();
    });
    expect(screen.getByText('잠깐 알림')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText('잠깐 알림')).not.toBeInTheDocument();
  });
});
