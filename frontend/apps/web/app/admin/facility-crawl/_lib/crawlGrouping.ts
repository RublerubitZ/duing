// 크롤 예약 현황의 순수 파생 — 예약 맥락 접기(수정 3)와 당월·익월 계산.
import type { AdminCrawlReservation } from '@duing/types';

/** Asia/Seoul 기준 현재 yyyy-MM — 크롤 데이터는 당월·익월만 존재한다. */
export function seoulYearMonth(now: Date): string {
  // sv-SE 로케일은 yyyy-MM-dd 형식이라 슬라이스만으로 안전하다.
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now).slice(0, 7);
}

export function nextYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1 + 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function nextDateIso(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + 1);
  const pad2 = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * 예약 맥락(수정 3): 같은 시설·같은 [start, end)·같은 분류의 **연속 일자** 예약을 하나의 맥락으로 접는다.
 * 예: 08/28·08/29·08/30 10:00~17:00 → "08/28~08/30 10:00~17:00" 1맥락, 떨어진 날짜·다른 시간은 별개.
 * 입력은 서버 정렬(시설→일자→시작시각) 그대로를 전제한다. 크롤 행에는 purpose 가 없어(사전 조사)
 * 시설+시간+일자 연속성만으로 맥락을 정의한다 — 신규 컬럼을 만들지 않는다.
 */
export type CrawlContext = {
  facilityId: number;
  facilityName: string | null;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  classification: AdminCrawlReservation['classification'];
  reservations: AdminCrawlReservation[];
};

export function foldReservationContexts(reservations: AdminCrawlReservation[]): CrawlContext[] {
  const contexts: CrawlContext[] = [];
  for (const reservation of reservations) {
    const last = contexts[contexts.length - 1];
    const continues =
      last !== undefined &&
      last.facilityId === reservation.facilityId &&
      last.startTime === reservation.startTime &&
      last.endTime === reservation.endTime &&
      last.classification === reservation.classification &&
      nextDateIso(last.endDate) === reservation.reservationDate;
    if (continues) {
      last.endDate = reservation.reservationDate;
      last.reservations.push(reservation);
      continue;
    }
    contexts.push({
      facilityId: reservation.facilityId,
      facilityName: reservation.facilityName,
      startDate: reservation.reservationDate,
      endDate: reservation.reservationDate,
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      classification: reservation.classification,
      reservations: [reservation],
    });
  }
  return contexts;
}

/** "08/28~08/30" 또는 단일 일자 "08/28" — 맥락 표기용. */
export function contextDateLabel(context: CrawlContext): string {
  const short = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
  return context.startDate === context.endDate
    ? short(context.startDate)
    : `${short(context.startDate)}~${short(context.endDate)}`;
}
