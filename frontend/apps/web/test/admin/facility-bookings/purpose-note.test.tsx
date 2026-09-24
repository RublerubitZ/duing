import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PurposeNote } from '@/app/admin/facility-bookings/_components/PurposeNote';

// PurposeNote 의 접힘 값은 모듈 스코프 메모리(memoryFallback)에도 미러되어 케이스 사이에 남는다.
// 아래 케이스는 모두 토글로 시작하거나 서버 스냅샷만 보므로 영향이 없다. "저장값 '1' 로 마운트하면 접힘" 같은
// 케이스를 추가할 때는 `vi.resetModules()` + `await import(...)` 로 모듈을 새로 받아야 한다.
const STORAGE_KEY = 'duing:admin:purpose-note:collapsed';

describe('PurposeNote', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('기본은 펼침이고, 접기를 누르면 본문이 사라지고 저장되며 리렌더 후에도 접힘이 유지된다', () => {
    const { rerender, unmount } = render(<PurposeNote>예약을 검토해 승인 또는 거절해요.</PurposeNote>);

    expect(screen.getByText('예약을 검토해 승인 또는 거절해요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '접기' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: '접기' }));

    expect(screen.queryByText('예약을 검토해 승인 또는 거절해요.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '화면 안내 보기' })).toHaveAttribute('aria-expanded', 'false');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');

    rerender(<PurposeNote>다른 탭 안내</PurposeNote>);
    expect(screen.queryByText('다른 탭 안내')).not.toBeInTheDocument();
    unmount();

    // 새로 마운트해도 저장값으로 접힘 유지 → 펼치면 본문 복귀.
    render(<PurposeNote>다시 마운트</PurposeNote>);
    fireEvent.click(screen.getByRole('button', { name: '화면 안내 보기' }));
    expect(screen.getByText('다시 마운트')).toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('0');
  });

  it('localStorage 저장이 실패해도(차단 환경) 접기·펼치기는 메모리 상태로 동작한다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    render(<PurposeNote>안내 본문</PurposeNote>);

    fireEvent.click(screen.getByRole('button', { name: '접기' }));
    expect(screen.queryByText('안내 본문')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '화면 안내 보기' }));
    expect(screen.getByText('안내 본문')).toBeInTheDocument();
  });

  it('서버 스냅샷은 항상 펼침이다 — 저장값이 접힘이어도 SSR 마크업은 본문을 싣는다(하이드레이션 안전)', async () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    const { renderToString } = await import('react-dom/server');

    const html = renderToString(<PurposeNote>서버 본문</PurposeNote>);

    expect(html).toContain('서버 본문');
  });
});
