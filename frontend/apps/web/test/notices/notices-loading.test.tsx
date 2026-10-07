import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../app/_components/InfoTabs', () => ({
  InfoTabs: () => <nav aria-label="정보" />,
}));

import Loading from '@/app/notices/loading';

describe('app/notices/loading.tsx — 소식 목록 경로 로딩 경계', () => {
  it('정보 탭 줄은 바로 그리고, 목록 자리는 지연 래퍼 안의 화면 모양 스켈레톤으로 그린다', () => {
    render(<Loading />);

    expect(screen.getByRole('navigation', { name: '정보' }).closest('.delayed-show')).toBeNull();
    const skeleton = screen.getByRole('status', { name: '공지 목록 불러오는 중' });
    expect(skeleton.closest('.delayed-show')).not.toBeNull();
    // 둘 다 animation 축약이라 같은 요소면 delayed-show 가 펄스를 지운다.
    expect(skeleton).not.toHaveClass('delayed-show');
    expect(skeleton).toHaveClass('animate-pulse');
    expect(screen.queryByRole('status', { name: '페이지 불러오는 중' })).toBeNull();
  });
});
