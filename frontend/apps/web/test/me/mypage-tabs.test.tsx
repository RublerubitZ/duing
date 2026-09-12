import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MyPageTabs } from '../../app/me/_components/MyPageTabs';

const sections = [
  { id: 'clubs', label: '내 동아리' },
  { id: 'apply', label: '지원 현황', count: 2 },
];

describe('MyPageTabs — 활성 인디케이터', () => {
  it('활성 버튼 안에만 인디케이터가 1개 렌더된다', () => {
    render(<MyPageTabs sections={sections} active="clubs" onSelect={vi.fn()} />);

    const activeButton = screen.getByRole('button', { name: '내 동아리' });
    const inactiveButton = screen.getByRole('button', { name: /지원 현황/ });

    expect(document.querySelectorAll('[data-tab-indicator]')).toHaveLength(1);
    expect(activeButton.querySelector('[data-tab-indicator]')).not.toBeNull();
    expect(inactiveButton.querySelector('[data-tab-indicator]')).toBeNull();
  });

  it('활성 표시를 인디케이터가 맡으므로 활성 버튼에 border-ink 를 두지 않는다', () => {
    render(<MyPageTabs sections={sections} active="clubs" onSelect={vi.fn()} />);

    const activeButton = screen.getByRole('button', { name: '내 동아리' });
    // 레이아웃 유지용 투명 보더는 남기고 색 보더만 제거한다(PC 기하 불변).
    expect(activeButton.className).toContain('border-transparent');
    expect(activeButton.className).not.toContain('border-ink');
  });

  it('탭을 누르면 onSelect 가 그 id 로 호출된다', async () => {
    const onSelect = vi.fn();
    render(<MyPageTabs sections={sections} active="clubs" onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /지원 현황/ }));
    expect(onSelect).toHaveBeenCalledWith('apply');
  });
});
