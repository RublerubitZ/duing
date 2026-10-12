import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useParams: () => ({ noticeId: '42' }),
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
}));

import Loading from '@/app/notices/[noticeId]/loading';

describe('app/notices/[noticeId]/loading.tsx — 소식 상세 경로 로딩 경계', () => {
  it('상단 바는 바로, 본문 자리는 지연 래퍼 안의 스켈레톤으로 그린다', () => {
    render(<Loading />);

    expect(screen.getByRole('button', { name: '뒤로' }).closest('.delayed-show')).toBeNull();
    const skeleton = screen.getByRole('status', { name: '공지 불러오는 중' });
    expect(skeleton.parentElement).toHaveClass('delayed-show');
    expect(skeleton).not.toHaveClass('delayed-show');
    expect(screen.queryByRole('status', { name: '페이지 불러오는 중' })).toBeNull();
  });
});
