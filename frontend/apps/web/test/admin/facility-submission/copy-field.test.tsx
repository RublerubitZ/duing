import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CopyField } from '@/app/admin/facility-bookings/submission/_components/CopyField';

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  return writeText;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('CopyField', () => {
  it('클릭하면 값을 클립보드에 복사한다', () => {
    const writeText = stubClipboard();
    render(<CopyField label="사용 시설명" value="세미나실 A" />);

    fireEvent.click(screen.getByRole('button', { name: /사용 시설명 복사/ }));

    expect(writeText).toHaveBeenCalledWith('세미나실 A');
  });

  it('복사 직후 완료 표시를 보였다가 잠시 뒤 되돌린다', () => {
    vi.useFakeTimers();
    stubClipboard();
    render(<CopyField label="사용 목적" value="정기 합주" />);
    const button = screen.getByRole('button', { name: /사용 목적 복사/ });

    // 복사 전 — 완료 아이콘(체크) 없음.
    expect(button.querySelector('.bg-sage-mist')).toBeNull();

    fireEvent.click(button);
    // 복사 직후 — 완료 표시(sage-mist 배경).
    expect(button.querySelector('.bg-sage-mist')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(button.querySelector('.bg-sage-mist')).toBeNull();
  });
});
