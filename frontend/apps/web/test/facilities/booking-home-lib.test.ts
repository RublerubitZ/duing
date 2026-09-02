import { describe, expect, it } from 'vitest';
import { facilityIcon } from '@/app/_lib/facilityIcon';
import { todayFreeSlotCount, windowRangeLabel } from '@/app/facilities/_lib/bookingHome';

describe('facilityIcon', () => {
  it('시설명 패턴으로 아이콘을 매핑하고 미매핑은 기본 아이콘이다', () => {
    expect(facilityIcon('커뮤니티룸(1)')).toBe('🛋');
    expect(facilityIcon('공동연습실(3)')).toBe('🎸');
    expect(facilityIcon('빛광장')).toBe('🎤');
    expect(facilityIcon('자유광장(노천강당)')).toBe('🎪');
    expect(facilityIcon('웅지관 강당')).toBe('🏛');
    expect(facilityIcon('신규 시설')).toBe('🏢');
  });
});

describe('windowRangeLabel', () => {
  it('오픈 구간을 M.d ~ M.d 로 표기한다', () => {
    expect(windowRangeLabel({ bookableFrom: '2026-07-16', bookableUntil: '2026-07-31' })).toBe('7.16 ~ 7.31');
    expect(windowRangeLabel({ bookableFrom: '2026-08-01', bookableUntil: '2026-08-15' })).toBe('8.1 ~ 8.15');
  });
});

describe('todayFreeSlotCount', () => {
  // FacilityItem.reservations(ReservationSlot)의 실제 시간 필드는 start/end(HH:mm)다.
  const reservations = [
    { start: '11:00', end: '13:00' },
    { start: '18:00', end: '20:00' },
  ];
  // 오프셋 명시 인스턴트 — 머신 타임존과 무관하게 같은 순간을 뜻한다(P2-18: 집계는 KST 기준).
  const kst = (time: string) => new Date(`2026-07-14T${time}+09:00`);

  it('KST 현재 시각 이후 남은 슬롯 중 예약이 덮지 않은 수를 센다', () => {
    // 10시: 남은 슬롯 10~22시(12칸) 중 11·12·18·19시 예약 → 8칸
    expect(todayFreeSlotCount(reservations, kst('10:00:00'))).toBe(8);
    // 19시 30분: 남은 슬롯 20·21시(19시 슬롯은 시작이 지났으므로 제외) → 2칸
    expect(todayFreeSlotCount(reservations, kst('19:30:00'))).toBe(2);
  });

  it('시각은 기기 타임존이 아니라 KST 로 읽는다 — 같은 인스턴트의 UTC 표기도 동일하고, 초만 지나도 진행 중인 시간은 제외한다', () => {
    // 01:00Z = KST 10:00 → 위와 동일 8칸(UTC 기기에서 로컬 getHours()=1 로 읽으면 9칸이 되는 것이 버그였다).
    expect(todayFreeSlotCount(reservations, new Date('2026-07-14T01:00:00Z'))).toBe(8);
    // 10:00:30 — 10시 슬롯은 이미 시작 → 11시부터 11칸 중 11·12·18·19시 예약 → 7칸
    expect(todayFreeSlotCount(reservations, kst('10:00:30'))).toBe(7);
  });

  it('영업 시작 전에는 전체에서 예약분만 빼고, 22시 이후에는 null 을 준다', () => {
    expect(todayFreeSlotCount(reservations, kst('08:00:00'))).toBe(9); // 13칸 - 4칸
    expect(todayFreeSlotCount(reservations, kst('22:00:00'))).toBeNull();
    expect(todayFreeSlotCount(reservations, kst('22:30:00'))).toBeNull();
  });
});
