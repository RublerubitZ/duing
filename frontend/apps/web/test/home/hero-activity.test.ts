import { describe, expect, it } from 'vitest';

import {
  resolveHeroToasts,
  type HeroActivity,
} from '../../app/_components/sections/hero-activity';

// 고정 기준 시각 — 결정적 테스트. 상대시간 표기 자체는 @duing/hooks formatRelativeTime 테스트가 담당.
const NOW = new Date('2026-06-28T12:00:00.000Z');

function isoAgo(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

describe('resolveHeroToasts', () => {
  it('실활동 2개 → 실제 토스트 2개(매핑된 문구·variant·시간)', () => {
    const activities: HeroActivity[] = [
      { type: 'RECRUIT_OPEN', clubName: '소울비트', occurredAt: isoAgo(3 * 60_000) },
      { type: 'INTERVIEW_RESULT', clubName: '대구대 봉사단', occurredAt: isoAgo(10 * 60_000) },
    ];
    const toasts = resolveHeroToasts(activities, NOW);
    expect(toasts).toHaveLength(2);
    expect(toasts[0]).toEqual({
      variant: 'light',
      clubName: '소울비트',
      message: '신규 모집 오픈',
      timeAgo: '3분 전',
    });
    expect(toasts[1]).toEqual({
      variant: 'dark',
      clubName: '대구대 봉사단',
      message: '합격자 발표',
      timeAgo: '10분 전',
    });
  });

  it('실활동 1개 → 실제 1개 + 폴백 1개(slot1 dark)', () => {
    const activities: HeroActivity[] = [
      { type: 'NOTICE_CREATED', clubName: '두잉코드', occurredAt: isoAgo(60_000) },
    ];
    const toasts = resolveHeroToasts(activities, NOW);
    expect(toasts).toHaveLength(2);
    expect(toasts[0]).toEqual({
      variant: 'light',
      clubName: '두잉코드',
      message: '새 공지 등록',
      timeAgo: '1분 전',
    });
    expect(toasts[1]).toEqual({
      variant: 'dark',
      clubName: '캠퍼스 동아리',
      message: '합격자 발표',
      timeAgo: '방금 전',
    });
  });

  it('실활동 0개 → 폴백 2개(slot0 light, slot1 dark)', () => {
    const toasts = resolveHeroToasts([], NOW);
    expect(toasts).toHaveLength(2);
    expect(toasts[0].variant).toBe('light');
    expect(toasts[0].clubName).toBe('캠퍼스 동아리');
    expect(toasts[0].message).toBe('신규 모집 오픈');
    expect(toasts[1].variant).toBe('dark');
    expect(toasts[1].message).toBe('합격자 발표');
  });

  it('실활동 2개 초과 → 앞 2개만 사용', () => {
    const activities: HeroActivity[] = [
      { type: 'RECRUIT_OPEN', clubName: 'A', occurredAt: isoAgo(60_000) },
      { type: 'FEE_OPEN', clubName: 'B', occurredAt: isoAgo(60_000) },
      { type: 'EVENT_CREATED', clubName: 'C', occurredAt: isoAgo(60_000) },
    ];
    const toasts = resolveHeroToasts(activities, NOW);
    expect(toasts).toHaveLength(2);
    expect(toasts.map((toast) => toast.clubName)).toEqual(['A', 'B']);
  });
});
