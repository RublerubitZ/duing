import { describe, expect, it } from 'vitest';
import type { AdminCrawlReservation } from '@duing/types';

import {
  contextDateLabel,
  foldReservationContexts,
  nextYearMonth,
} from '@/app/admin/facility-crawl/_lib/crawlGrouping';

function reservation(overrides: Partial<AdminCrawlReservation>): AdminCrawlReservation {
  return {
    reservationId: 1,
    facilityId: 10,
    facilityName: '공연장',
    organizationName: 'A동아리',
    reservationDate: '2026-08-28',
    startTime: '10:00',
    endTime: '17:00',
    classification: 'BASIC_SECURED_TIME',
    crawledAt: '2026-08-27T05:00:00Z',
    ...overrides,
  };
}

describe('foldReservationContexts — 예약 맥락 접기(수정 3)', () => {
  it('같은 시설·같은 시간의 연속 일자는 하나의 맥락으로 접힌다', () => {
    const contexts = foldReservationContexts([
      reservation({ reservationId: 1, reservationDate: '2026-08-28' }),
      reservation({ reservationId: 2, reservationDate: '2026-08-29' }),
      reservation({ reservationId: 3, reservationDate: '2026-08-30' }),
    ]);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.startDate).toBe('2026-08-28');
    expect(contexts[0]?.endDate).toBe('2026-08-30');
    expect(contexts[0]?.reservations).toHaveLength(3);
    expect(contextDateLabel(contexts[0]!)).toBe('08/28~08/30');
  });

  it('다른 시설·다른 목적지(시간 상이)는 별개 맥락으로 분리된다', () => {
    const contexts = foldReservationContexts([
      reservation({ reservationId: 1, facilityId: 10, facilityName: '공연장', reservationDate: '2026-08-28' }),
      reservation({ reservationId: 2, facilityId: 10, facilityName: '공연장', reservationDate: '2026-08-29' }),
      reservation({
        reservationId: 3,
        facilityId: 20,
        facilityName: '강의실',
        reservationDate: '2026-09-10',
        startTime: '13:00',
        endTime: '15:00',
      }),
    ]);
    expect(contexts).toHaveLength(2);
    expect(contexts[0]?.facilityName).toBe('공연장');
    expect(contexts[1]?.facilityName).toBe('강의실');
    expect(contextDateLabel(contexts[1]!)).toBe('09/10');
  });

  it('날짜가 끊기거나 시간이 다르면 같은 시설이라도 맥락이 갈린다', () => {
    const contexts = foldReservationContexts([
      reservation({ reservationId: 1, reservationDate: '2026-08-28' }),
      reservation({ reservationId: 2, reservationDate: '2026-08-30' }), // 8/29 없음 → 끊김
      reservation({ reservationId: 3, reservationDate: '2026-08-31', startTime: '13:00', endTime: '18:00' }),
    ]);
    expect(contexts).toHaveLength(3);
  });

  it('분류가 다르면(크롤 예약 vs 기본 확보) 연속 일자여도 맥락을 합치지 않는다', () => {
    const contexts = foldReservationContexts([
      reservation({ reservationId: 1, reservationDate: '2026-08-28', classification: 'CRAWLED_RESERVATION' }),
      reservation({ reservationId: 2, reservationDate: '2026-08-29', classification: 'BASIC_SECURED_TIME' }),
    ]);
    expect(contexts).toHaveLength(2);
  });

  it('같은 날짜의 동일 구간 중복 행(마커 쌍 확장)은 한 맥락에 흡수된다 — 중복 표시·key 충돌 방지', () => {
    const contexts = foldReservationContexts([
      reservation({ reservationId: 1, reservationDate: '2026-08-28' }),
      reservation({ reservationId: 2, reservationDate: '2026-08-28' }), // 동일 구간 중복 행
      reservation({ reservationId: 3, reservationDate: '2026-08-29' }),
    ]);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.reservations).toHaveLength(3);
    expect(contextDateLabel(contexts[0]!)).toBe('08/28~08/29');
  });

  it('월 경계 연속(8/31→9/1)도 하나의 맥락으로 이어진다', () => {
    const contexts = foldReservationContexts([
      reservation({ reservationId: 1, reservationDate: '2026-08-31' }),
      reservation({ reservationId: 2, reservationDate: '2026-09-01' }),
    ]);
    expect(contexts).toHaveLength(1);
    expect(contextDateLabel(contexts[0]!)).toBe('08/31~09/01');
  });
});

describe('nextYearMonth', () => {
  it('연 경계를 안전하게 넘는다', () => {
    expect(nextYearMonth('2026-08')).toBe('2026-09');
    expect(nextYearMonth('2026-12')).toBe('2027-01');
  });
});
