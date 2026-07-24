import { describe, expect, it } from 'vitest';
import { formatMembershipDuration } from '@/app/manage/clubs/[clubId]/members/_lib/membershipDuration';

describe('formatMembershipDuration', () => {
  it('같은 달 가입은 "이번 달 가입"', () => {
    expect(formatMembershipDuration('2026-07-03', new Date('2026-07-24'))).toBe('이번 달 가입');
  });

  it('가입일 이전이거나 동일 시각도 "이번 달 가입"', () => {
    expect(formatMembershipDuration('2026-07-24', new Date('2026-07-24'))).toBe('이번 달 가입');
  });

  it('달 경계를 넘었지만 한 달이 안 됐으면 "이번 달 가입"', () => {
    // 1/20 가입, 2/10 기준 → 도래 전이라 0개월
    expect(formatMembershipDuration('2026-01-20', new Date('2026-02-10'))).toBe('이번 달 가입');
  });

  it('1년 미만은 "N개월"', () => {
    expect(formatMembershipDuration('2026-01-05', new Date('2026-04-05'))).toBe('3개월');
  });

  it('정확히 1년은 "1년"', () => {
    expect(formatMembershipDuration('2025-05-01', new Date('2026-05-01'))).toBe('1년');
  });

  it('N년 M개월', () => {
    expect(formatMembershipDuration('2024-01-10', new Date('2026-05-15'))).toBe('2년 4개월');
  });

  it('개월이 0인 정수 연차는 개월을 생략한다', () => {
    expect(formatMembershipDuration('2023-06-01', new Date('2026-06-01'))).toBe('3년');
  });
});
