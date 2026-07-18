import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ClubExploreSkeleton,
  ClubListSkeletonItems,
} from '@/app/clubs/_components/ClubExploreSkeleton';

describe('ClubExploreSkeleton', () => {
  it('role=status + 안내 aria-label 을 노출한다', () => {
    render(<ClubExploreSkeleton />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', '동아리 목록 불러오는 중');
  });

  it('데스크탑 카드 자리 8개 + 모바일 리스트 행 자리 6개를 렌더한다', () => {
    render(<ClubExploreSkeleton />);
    expect(screen.getAllByTestId('club-explore-skeleton-desktop-card')).toHaveLength(8);
    expect(screen.getAllByTestId('club-explore-skeleton-mobile-row')).toHaveLength(6);
  });
});

describe('ClubListSkeletonItems', () => {
  it('variant="grid" → 카드 자리 8개만 렌더한다(모바일 행은 없음)', () => {
    render(<ClubListSkeletonItems variant="grid" />);
    expect(screen.getAllByTestId('club-explore-skeleton-desktop-card')).toHaveLength(8);
    expect(screen.queryByTestId('club-explore-skeleton-mobile-row')).toBeNull();
  });

  it('variant="list" → 리스트 행 자리 6개만 렌더한다(데스크탑 카드는 없음)', () => {
    render(<ClubListSkeletonItems variant="list" />);
    expect(screen.getAllByTestId('club-explore-skeleton-mobile-row')).toHaveLength(6);
    expect(screen.queryByTestId('club-explore-skeleton-desktop-card')).toBeNull();
  });
});
