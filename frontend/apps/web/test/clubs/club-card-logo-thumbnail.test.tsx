import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ClubSummary } from '@duing/types';
import { ClubCard } from '../../app/clubs/_components/ClubCard';
import { summaryToClub } from '../../app/clubs/_lib/clubAdapter';

// next-view-transitions 의 Link 는 test/setup.ts 에서 전역 모킹된다(→ anchor).
const summary: ClubSummary = {
  id: 7,
  name: '두잉',
  category: 'ACADEMIC',
  division: null,
  college: null,
  department: null,
  logoUrl: 'https://files.duings.com/club/logo/a.png',
  logoThumbnailUrl: 'https://files.duings.com/club/logo/a-thumb.png',
  status: 'ACTIVE',
  tags: [],
  tagline: null,
  centralClub: true,
  activeRecruitment: null,
};

describe('ClubCard — 로고 썸네일(iOS 깜빡임 P0 §5)', () => {
  it('summaryToClub 이 썸네일 URL 을 그대로 옮기고, 카드는 썸네일을 즉시(eager·sync) 그린다', () => {
    const club = summaryToClub(summary);
    expect(club.logoThumbnailUrl).toBe('https://files.duings.com/club/logo/a-thumb.png');

    render(<ClubCard club={club} />);
    const logo = screen.getByLabelText('두잉 로고').querySelector('img');
    expect(logo).toHaveAttribute('src', 'https://files.duings.com/club/logo/a-thumb.png');
    expect(logo).toHaveAttribute('loading', 'eager');
    expect(logo).toHaveAttribute('decoding', 'sync');
  });

  it('구 응답(필드 없음)은 원본을 지금처럼 lazy·async 로 그린다 — fail-open', () => {
    // 구 BE 응답에는 키 자체가 없다 — JSON 에 없는 키는 읽으면 undefined 라 같은 입력이다.
    const legacySummary: ClubSummary = { ...summary, logoThumbnailUrl: undefined };
    const club = summaryToClub(legacySummary);
    // 어댑터는 department 처럼 null 로 눕힌다(`?? null`).
    expect(club.logoThumbnailUrl).toBeNull();

    render(<ClubCard club={club} />);
    const logo = screen.getByLabelText('두잉 로고').querySelector('img');
    expect(logo).toHaveAttribute('src', 'https://files.duings.com/club/logo/a.png');
    expect(logo).toHaveAttribute('loading', 'lazy');
    expect(logo).toHaveAttribute('decoding', 'async');
  });
});
