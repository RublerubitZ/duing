import { describe, expect, it } from 'vitest';

import {
  MAX_HERO_TOASTS,
  resolveHeroToasts,
  type HeroActivity,
} from '../../app/_components/sections/hero-activity';

// 고정 기준 시각 — 결정적 테스트. 상대시간 표기 자체는 @duing/hooks formatRelativeTime 테스트가 담당.
const NOW = new Date('2026-06-28T12:00:00.000Z');

function isoAgo(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

// 백엔드가 먼저 배포한 새 활동 타입 — 문구를 모르므로 토스트로 만들지 않는다.
const UNKNOWN_TYPE = 'NEW_TYPE' as unknown as HeroActivity['type'];

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

  it('실활동 1개 → 폴백 없이 실제 토스트 1개만', () => {
    const activities: HeroActivity[] = [
      { type: 'NOTICE_CREATED', clubName: '두잉코드', occurredAt: isoAgo(60_000) },
    ];
    const toasts = resolveHeroToasts(activities, NOW);
    // 슬라이드가 하나면 페이저도 사라진다 — 빈 자리를 가짜 토스트로 채우지 않는다.
    expect(toasts).toEqual([
      { variant: 'light', clubName: '두잉코드', message: '새 공지 등록', timeAgo: '1분 전' },
    ]);
  });

  it('실활동 0개 → 폴백 한 장만 반환한다', () => {
    const toasts = resolveHeroToasts([], NOW);
    expect(toasts).toEqual([
      { variant: 'light', clubName: '캠퍼스 동아리', message: '신규 모집 오픈', timeAgo: '방금 전' },
    ]);
  });

  it('실활동이 상한을 넘으면 앞에서부터 상한 개수만 쓴다', () => {
    const activities: HeroActivity[] = Array.from({ length: MAX_HERO_TOASTS + 2 }, (_, index) => ({
      type: 'RECRUIT_OPEN' as const,
      clubName: `동아리${index}`,
      occurredAt: isoAgo(60_000),
    }));
    const toasts = resolveHeroToasts(activities, NOW);
    expect(toasts).toHaveLength(MAX_HERO_TOASTS);
    expect(toasts.map((toast) => toast.clubName)).toEqual(['동아리0', '동아리1', '동아리2', '동아리3', '동아리4']);
  });

  it('상한 안이면 실활동 개수만큼 그대로 반환한다', () => {
    const activities: HeroActivity[] = [
      { type: 'RECRUIT_OPEN', clubName: 'A', occurredAt: isoAgo(60_000) },
      { type: 'FEE_OPEN', clubName: 'B', occurredAt: isoAgo(60_000) },
      { type: 'EVENT_CREATED', clubName: 'C', occurredAt: isoAgo(60_000) },
    ];
    expect(resolveHeroToasts(activities, NOW).map((toast) => toast.clubName)).toEqual(['A', 'B', 'C']);
  });

  it('모르는 활동 타입만 있으면 폴백 한 장만 반환한다', () => {
    const activities: HeroActivity[] = [
      { type: UNKNOWN_TYPE, clubName: '새타입동아리', occurredAt: isoAgo(60_000) },
    ];
    expect(resolveHeroToasts(activities, NOW)).toEqual([
      { variant: 'light', clubName: '캠퍼스 동아리', message: '신규 모집 오픈', timeAgo: '방금 전' },
    ]);
  });

  it('모르는 활동 타입이 섞이면 알려진 것만 순서대로 토스트가 된다', () => {
    const activities: HeroActivity[] = [
      { type: 'RECRUIT_OPEN', clubName: 'A', occurredAt: isoAgo(60_000) },
      { type: UNKNOWN_TYPE, clubName: 'X', occurredAt: isoAgo(60_000) },
      { type: 'FEE_OPEN', clubName: 'B', occurredAt: isoAgo(60_000) },
    ];
    expect(resolveHeroToasts(activities, NOW).map((toast) => toast.clubName)).toEqual(['A', 'B']);
  });

  it('앞쪽에 모르는 활동 타입이 있어도 알려진 활동으로 상한까지 채운다', () => {
    const unknownActivities: HeroActivity[] = [
      { type: UNKNOWN_TYPE, clubName: 'X0', occurredAt: isoAgo(60_000) },
      { type: UNKNOWN_TYPE, clubName: 'X1', occurredAt: isoAgo(60_000) },
    ];
    const knownActivities: HeroActivity[] = Array.from({ length: MAX_HERO_TOASTS + 1 }, (_, index) => ({
      type: 'RECRUIT_OPEN' as const,
      clubName: `동아리${index}`,
      occurredAt: isoAgo(60_000),
    }));
    const toasts = resolveHeroToasts([...unknownActivities, ...knownActivities], NOW);
    expect(toasts).toHaveLength(MAX_HERO_TOASTS);
    expect(toasts[0]?.clubName).toBe('동아리0');
  });
});
