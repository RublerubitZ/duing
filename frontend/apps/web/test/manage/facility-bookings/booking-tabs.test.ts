import { describe, expect, it } from 'vitest';
import {
  MANAGE_TAB_KEYS,
  MANAGE_TAB_LABELS,
  manageTabOf,
} from '@/app/manage/clubs/[clubId]/facility-bookings/_lib/bookingTabs';

const TODAY = '2026-07-20'; // 형식 검증용 고정 입력(타임밤 아님)

describe('manageTabOf', () => {
  it('대기·승인·충돌은 날짜와 무관하게 진행중이다', () => {
    expect(manageTabOf({ status: 'PENDING', date: '2026-07-01' }, TODAY)).toBe('ACTIVE');
    expect(manageTabOf({ status: 'APPROVED', date: '2026-07-01' }, TODAY)).toBe('ACTIVE');
    expect(manageTabOf({ status: 'CONFLICT', date: '2026-07-01' }, TODAY)).toBe('ACTIVE');
  });

  it('확정은 이용일이 오늘 이후면 진행중, 지났으면 지난 예약이다', () => {
    expect(manageTabOf({ status: 'CONFIRMED', date: '2026-07-20' }, TODAY)).toBe('ACTIVE');
    expect(manageTabOf({ status: 'CONFIRMED', date: '2026-07-25' }, TODAY)).toBe('ACTIVE');
    expect(manageTabOf({ status: 'CONFIRMED', date: '2026-07-19' }, TODAY)).toBe('PAST');
  });

  it('거절·취소는 항상 지난 예약이다', () => {
    expect(manageTabOf({ status: 'REJECTED', date: '2026-08-01' }, TODAY)).toBe('PAST');
    expect(manageTabOf({ status: 'CANCELLED', date: '2026-08-01' }, TODAY)).toBe('PAST');
  });

  it('탭 키·라벨 계약', () => {
    expect(MANAGE_TAB_KEYS).toEqual(['ACTIVE', 'PAST']);
    expect(MANAGE_TAB_LABELS.ACTIVE).toBe('진행중');
    expect(MANAGE_TAB_LABELS.PAST).toBe('지난 예약');
  });
});
