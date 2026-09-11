import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => mockUsePathname() }));

import { PageSegment } from '@/app/_components/PageSegment';

describe('PageSegment', () => {
  it('현재 경로 항목에 aria-current 를 붙인다', () => {
    mockUsePathname.mockReturnValue('/facilities');
    render(<PageSegment label="일정·시설" items={[{ label: '일정', href: '/calendar' }, { label: '시설 예약', href: '/facilities' }]} />);
    expect(screen.getByRole('navigation', { name: '일정·시설' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '시설 예약' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '일정' })).not.toHaveAttribute('aria-current');
  });
});
