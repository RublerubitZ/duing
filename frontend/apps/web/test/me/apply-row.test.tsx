import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApplyRow } from '../../app/me/applications/_components/ApplyRow';
import type { App } from '../../app/me/applications/_constants/data';

const app: App = {
  id: '1',
  name: '두잉 개발 동아리',
  cat: '학술',
  tag: '사이드 프로젝트 모임',
  appliedDate: '2026.06.10',
  appliedAt: '2026-06-10',
  division: '중앙',
  department: '',
  files: [],
  memo: '',
  steps: [
    { label: '서류접수', date: '06.10', state: 'done' },
    { label: '서류심사', date: '06.14', state: 'current' },
    { label: '면접/인터뷰', date: '06.20', state: 'pending' },
    { label: '최종발표', date: '06.25', state: 'pending' },
  ],
  status: 'doc-review',
  right: { eyebrow: '서류 결과', value: '06.14', sub: '발표 예정' },
  logo: { kind: 'wordmark', text: '두', bg: '#1F4A36', fg: '#fff' },
};

describe('ApplyRow — 반응형 카드 reflow 구조', () => {
  it('동아리명과 영역 클래스(로고/정보/타임라인/상태)를 렌더한다', () => {
    const { container } = render(<ApplyRow app={app} isActive={false} onOpen={vi.fn()} />);
    expect(screen.getByText('두잉 개발 동아리')).toBeInTheDocument();

    const row = container.querySelector('.apply-row');
    expect(row).not.toBeNull();
    for (const area of ['.ar-logo', '.ar-info', '.ar-timeline', '.ar-status']) {
      expect(row?.querySelector(area)).not.toBeNull();
    }
  });

  it('화살표는 모바일에서 숨긴다(hidden, md:grid)', () => {
    const { container } = render(<ApplyRow app={app} isActive={false} onOpen={vi.fn()} />);
    const arrow = container.querySelector('.ar-arrow');
    expect(arrow).not.toBeNull();
    expect(arrow?.className).toContain('hidden');
    expect(arrow?.className).toContain('md:grid');
  });

  it('클릭 시 onOpen 을 해당 id 로 호출한다', () => {
    const onOpen = vi.fn();
    const { container } = render(<ApplyRow app={app} isActive={false} onOpen={onOpen} />);
    container.querySelector<HTMLElement>('.apply-row')?.click();
    expect(onOpen).toHaveBeenCalledWith('1');
  });
});
