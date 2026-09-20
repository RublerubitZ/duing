import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureException: (...args: unknown[]) => captureException(...args) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { RouteErrorView } from '@/app/_components/RouteErrorView';

describe('RouteErrorView', () => {
  it('오류를 Sentry 로 보고하고 다시 시도·홈으로 를 제공한다', async () => {
    const error = new Error('boom');
    const reset = vi.fn();
    render(<RouteErrorView error={error} reset={reset} />);

    expect(captureException).toHaveBeenCalledWith(error);
    expect(screen.getByRole('heading', { level: 1, name: '잠시 문제가 생겼어요' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: '홈으로' })).toHaveAttribute('href', '/');
  });
});
