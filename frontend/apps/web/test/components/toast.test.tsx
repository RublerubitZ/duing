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

  it('동일 문구+variant 토스트가 이미 떠 있으면 다시 addToast 해도 추가되지 않는다(dedupe)', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger message="인터넷 연결을 확인해주세요." />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: '띄우기' }));
    await user.click(screen.getByRole('button', { name: '띄우기' }));

    expect(screen.getAllByText('인터넷 연결을 확인해주세요.')).toHaveLength(1);
  });

  it('문구가 다르면 dedupe 되지 않고 각각 표시된다', async () => {
    function TwoTriggers() {
      const { addToast } = useToast();
      return (
        <>
          <button type="button" onClick={() => addToast('안내 A', { variant: 'error' })}>
            A 띄우기
          </button>
          <button type="button" onClick={() => addToast('안내 B', { variant: 'error' })}>
            B 띄우기
          </button>
        </>
      );
    }
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TwoTriggers />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'A 띄우기' }));
    await user.click(screen.getByRole('button', { name: 'B 띄우기' }));

    expect(screen.getByText('안내 A')).toBeInTheDocument();
    expect(screen.getByText('안내 B')).toBeInTheDocument();
  });

  it('dedupe 로 스킵된 호출은 새 타이머를 걸지 않아 기존 토스트가 원래 durationMs 대로만 닫힌다', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger message="잠깐 알림" durationMs={3000} />
      </ToastProvider>,
    );

    act(() => {
      screen.getByRole('button', { name: '띄우기' }).click();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // 2초 시점에 동일 문구로 재클릭 — dedupe 로 스킵되어야 하며, 스킵된 호출이 새 타이머를
    // 걸었다면(예: 재클릭 시점부터 다시 3000ms) 원래 타이머(총 3000ms)보다 늦게 사라진다.
    act(() => {
      screen.getByRole('button', { name: '띄우기' }).click();
    });
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(screen.getByText('잠깐 알림')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('잠깐 알림')).not.toBeInTheDocument();
  });
});
