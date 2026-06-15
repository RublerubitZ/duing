import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminPromotionSummary } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('../../../app/_components/ImageWithFallback', () => ({
  ImageWithFallback: () => <div data-testid="image-fallback" />,
}));

import { AdminPromotionsTable } from '../../../app/admin/promotions/_components/AdminPromotionsTable';

function makeRow(overrides: Partial<AdminPromotionSummary>): AdminPromotionSummary {
  return {
    id: 1,
    club: null,
    title: '테스트 배너',
    bannerImageUrl: null,
    linkUrl: null,
    active: true,
    displayOrder: 0,
    createdBy: { id: 99, name: '관리자' },
    createdAt: '2026-06-01T00:00:00',
    updatedAt: '2026-06-01T00:00:00',
    tag: null,
    subtitle: null,
    ctaLabel: null,
    emoji: null,
    palette: 'INK',
    startAt: null,
    endAt: null,
    renderMode: 'SYSTEM_COMPOSED',
    imageAltText: null,
    notice: null,
    linkType: 'NONE',
    ...overrides,
  };
}

describe('AdminPromotionsTable — renderMode 배지', () => {
  it('SYSTEM_COMPOSED 행은 SYSTEM 배지가 표시된다', () => {
    render(
      <AdminPromotionsTable
        items={[makeRow({ id: 1, renderMode: 'SYSTEM_COMPOSED' })]}
        onDeleteClick={vi.fn()}
      />,
    );
    expect(screen.getByText('SYSTEM')).toBeInTheDocument();
  });

  it('FULL_BLEED_IMAGE 행은 FULL_BLEED 배지가 표시된다', () => {
    render(
      <AdminPromotionsTable
        items={[makeRow({ id: 2, renderMode: 'FULL_BLEED_IMAGE' })]}
        onDeleteClick={vi.fn()}
      />,
    );
    expect(screen.getByText('FULL_BLEED')).toBeInTheDocument();
  });

  it('두 모드가 섞인 목록도 각각 올바른 배지로 표시된다', () => {
    render(
      <AdminPromotionsTable
        items={[
          makeRow({ id: 1, renderMode: 'SYSTEM_COMPOSED' }),
          makeRow({ id: 2, renderMode: 'FULL_BLEED_IMAGE' }),
        ]}
        onDeleteClick={vi.fn()}
      />,
    );
    expect(screen.getByText('SYSTEM')).toBeInTheDocument();
    expect(screen.getByText('FULL_BLEED')).toBeInTheDocument();
  });
});
