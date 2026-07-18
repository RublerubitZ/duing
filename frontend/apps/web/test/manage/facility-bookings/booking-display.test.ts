import { describe, expect, it } from 'vitest';
import type { BookingStatus } from '@duing/types';
import {
  BOOKING_STATUS_META,
  bookingDateLabel,
  bookingDateTimeLabel,
  bookingTimeLabel,
} from '@/app/_lib/bookingDisplay';

describe('bookingDateLabel', () => {
  it('로컬 파싱으로 M월 D일 (요일) 을 만든다', () => {
    expect(bookingDateLabel('2026-07-20')).toBe('7월 20일 (월)'); // 형식 검증용 고정 입력 — 만료 개념 없음
    expect(bookingDateLabel('2026-07-05')).toBe('7월 5일 (일)');
  });
});

describe('bookingTimeLabel / bookingDateTimeLabel', () => {
  it('시간 범위와 일시 라벨을 만든다', () => {
    expect(bookingTimeLabel('18:00', '20:00')).toBe('18:00~20:00');
    expect(bookingDateTimeLabel('2026-07-20T19:30:00')).toBe('7월 20일 (월) 19:30');
  });
});

describe('상태 메타', () => {
  it('6개 상태 전부에 라벨·클래스가 있고 APPROVED 만 서브라벨을 가진다', () => {
    const statuses: BookingStatus[] = ['PENDING', 'APPROVED', 'CONFIRMED', 'REJECTED', 'CONFLICT', 'CANCELLED'];
    for (const status of statuses) {
      expect(BOOKING_STATUS_META[status].label.length).toBeGreaterThan(0);
      expect(BOOKING_STATUS_META[status].badgeClass.length).toBeGreaterThan(0);
    }
    expect(BOOKING_STATUS_META.APPROVED.subLabel).toBe('학교 반영 대기');
    expect(BOOKING_STATUS_META.PENDING.subLabel).toBeUndefined();
  });
});
