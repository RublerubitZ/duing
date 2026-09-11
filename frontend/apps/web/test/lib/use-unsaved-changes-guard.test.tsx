import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('@/app/_lib/useGuardedRouter', () => ({
  useGuardedRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

import { useUnsavedChangesGuard } from '@/app/_lib/useUnsavedChangesGuard';

function Probe({ dirty }: { dirty: boolean }) {
  const { leaveDialog } = useUnsavedChangesGuard(dirty);
  return (
    <div>
      <a href="/manage/clubs/1">대시보드</a>
      {/* 활성 탭처럼 지금 주소와 같은 링크. jsdom 은 실제 내비게이션을 구현하지 않아 기본 동작만 끈다
          (capture 단계의 가드 판정은 이 핸들러보다 먼저 끝나므로 판정에 영향이 없다). */}
      <a
        href={`${window.location.pathname}${window.location.search}`}
        onClick={(event) => event.preventDefault()}
      >
        현재 탭
      </a>
      {leaveDialog}
    </div>
  );
}

describe('useUnsavedChangesGuard', () => {
  beforeEach(() => {
    push.mockReset();
  });

  it('dirty 면 내부 링크 클릭을 가로채 확인 후 이동한다', async () => {
    const user = userEvent.setup();
    render(<Probe dirty />);
    await user.click(screen.getByRole('link', { name: '대시보드' }));
    expect(screen.getByRole('dialog', { name: '저장하지 않은 변경이 있어요' })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '나가기' }));
    expect(push).toHaveBeenCalledWith('/manage/clubs/1');
  });

  it('dirty 가 아니면 가로채지 않는다', async () => {
    const user = userEvent.setup();
    render(<Probe dirty={false} />);
    await user.click(screen.getByRole('link', { name: '대시보드' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dirty 여도 지금 보고 있는 주소와 같은 링크(활성 탭)는 가로채지 않는다', async () => {
    const user = userEvent.setup();
    render(<Probe dirty />);
    await user.click(screen.getByRole('link', { name: '현재 탭' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('dirty 면 beforeunload 를 막는다', () => {
    render(<Probe dirty />);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
