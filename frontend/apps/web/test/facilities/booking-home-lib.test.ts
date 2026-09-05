import { describe, expect, it } from 'vitest';
import { facilityIcon } from '@/app/_lib/facilityIcon';
import {
  bookingWindowNote,
  bookingWindowToastMessage,
  openDateLabel,
  todayFreeSlotCount,
} from '@/app/facilities/_lib/bookingHome';

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

// 홈 카드·캘린더 문구는 시설별 오픈일(bookingOpenDate)과 가용성 창(bookableFrom/Until)에서만 파생한다 —
// 전역 booking-window 는 소비하지 않는다(D7·D9).
const TODAY = '2026-09-03';

describe('openDateLabel', () => {
  it('오픈일이 미래면 날짜 문구, 오늘 이하면 신청 가능, null 이면 준비 중이다', () => {
    expect(openDateLabel('2026-09-16', TODAY)).toBe('9.16부터 예약 가능');
    expect(openDateLabel(TODAY, TODAY)).toBe('예약 신청 가능');
    expect(openDateLabel('2026-08-20', TODAY)).toBe('예약 신청 가능');
    expect(openDateLabel(null, TODAY)).toBe('예약 준비 중');
  });

  it('필드가 없는 구 백엔드 응답은 신청 가능으로 폴백한다', () => {
    expect(openDateLabel(undefined, TODAY)).toBe('예약 신청 가능');
  });
});

describe('bookingWindowToastMessage', () => {
  it('정상 창은 기간을 담고, 빈 창(from > until)은 아직 열리지 않았다고 안내한다', () => {
    expect(bookingWindowToastMessage(TODAY, '2026-10-31')).toBe('현재 예약 가능한 기간이 아니에요 (9.3 ~ 10.31)');
    expect(bookingWindowToastMessage('2026-11-01', '2026-10-31')).toBe('아직 예약 신청이 열리지 않았어요');
  });
});

describe('bookingWindowNote', () => {
  it('닫힘·오픈 전에만 안내줄을 내고 신청 중인 시설은 null 이다', () => {
    expect(bookingWindowNote('2026-11-01', '2026-10-31', TODAY)).toBe('아직 예약 신청을 받지 않는 시설이에요');
    expect(bookingWindowNote('2026-09-16', '2026-10-31', TODAY)).toBe('9.16부터 신청할 수 있어요');
    expect(bookingWindowNote(TODAY, '2026-10-31', TODAY)).toBeNull();
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
