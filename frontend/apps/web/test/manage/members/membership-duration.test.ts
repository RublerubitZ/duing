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

  it('Z 인스턴트는 KST 달력 기준으로 계산한다 — KST 새벽 가입은 그 달로 친다', () => {
    // 2026-06-30T16:00Z = KST 2026-07-01 01:00 → 7월 가입. UTC 프레임이면 6/30 가입·7/30 기준으로
    // 도래일을 채워 "1개월"이 된다 — KST 프레임만 "이번 달 가입"을 반환하는 변별 케이스.
    expect(formatMembershipDuration('2026-06-30T16:00:00Z', new Date('2026-07-30T00:00:00Z'))).toBe(
      '이번 달 가입',
    );
  });

  it('Z 인스턴트의 KST 월 경계가 개월 수에 반영된다', () => {
    // 2026-05-31T16:00Z = KST 2026-06-01. UTC 프레임이면 5/31 가입·7/31 기준으로 도래일을 채워
    // "2개월"이 된다 — KST 프레임(6/1 가입 → 1개월)만 통과하는 변별 케이스.
    expect(formatMembershipDuration('2026-05-31T16:00:00Z', new Date('2026-07-31T00:00:00Z'))).toBe(
      '1개월',
    );
  });
});
