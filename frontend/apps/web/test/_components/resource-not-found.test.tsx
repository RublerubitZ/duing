import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { ResourceNotFound } from '@/app/_components/ResourceNotFound';

describe('ResourceNotFound', () => {
  it('제목·설명·주 행동 링크를 그린다', () => {
    render(
      <ResourceNotFound
        title="이 동아리는 지금 볼 수 없어요"
        description="삭제됐거나 승인 대기 중일 수 있어요."
        actionHref="/clubs"
        actionLabel="동아리 탐색으로"
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: '이 동아리는 지금 볼 수 없어요' })).toBeInTheDocument();
    expect(screen.getByText('삭제됐거나 승인 대기 중일 수 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '동아리 탐색으로' })).toHaveAttribute('href', '/clubs');
  });
});
