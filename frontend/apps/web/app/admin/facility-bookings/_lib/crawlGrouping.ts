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
 * 예약 맥락(수정 3): **같은 주체·같은 시설**·같은 [start, end)·같은 분류의 **연속 일자** 예약을 하나의 맥락으로 접는다.
 * 예: 08/28·08/29·08/30 10:00~17:00 → "08/28~08/30 10:00~17:00" 1맥락, 떨어진 날짜·다른 시간·다른 주체는 별개.
 * 입력은 서버 정렬(일자 오름차순) 그대로를 전제한다. 시설별 보기는 일자→시각 정렬이라 주체가 섞여 내려오므로
 * 직전 행이 아니라 같은 키의 마지막 맥락에 이어 붙인다. 크롤 행에는 purpose 가 없어(사전 조사)
 * 주체+시설+시간+일자 연속성만으로 맥락을 정의한다 — 신규 컬럼을 만들지 않는다.
 *
 * 동아리별·미매칭 그룹은 서버가 **정규화된** 이름(꼬리 괄호·공백·대소문자 무시)으로 주체를 묶어 내려주므로
 * 한 그룹 안에 raw 표기가 다른 행("고정관념"·"고정관념(동아리)")이 섞일 수 있다. 그 그룹은 이미 주체 단위라
 * `subjectFixedByGroup` 으로 주체를 키에서 빼야 표기 변형 때문에 연속 일자가 갈리지 않는다.
 */
export type CrawlContext = {
  organizationName: string;
  facilityId: number;
  facilityName: string | null;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  classification: AdminCrawlReservation['classification'];
  reservations: AdminCrawlReservation[];
};

export function foldReservationContexts(
  reservations: AdminCrawlReservation[],
  options: { subjectFixedByGroup: boolean } = { subjectFixedByGroup: false },
): CrawlContext[] {
  const contexts: CrawlContext[] = [];
  const openContextByKey = new Map<string, CrawlContext>();
  for (const reservation of reservations) {
    const key = [
      options.subjectFixedByGroup ? '' : reservation.organizationName,
      reservation.facilityId,
      reservation.startTime,
      reservation.endTime,
      reservation.classification,
    ].join('|');
    const open = openContextByKey.get(key);
    // 같은 날짜의 동일 구간 중복 행(학교가 시작·끝 마커를 별도 행으로 내려 같은 범위로 확장된 쌍)도
    // 하나의 맥락에 흡수한다 — 분리하면 같은 구간이 두 줄로 보이고 React key 도 충돌한다(실데이터 QA).
    const continues =
      open !== undefined &&
      (reservation.reservationDate === open.endDate ||
        nextDateIso(open.endDate) === reservation.reservationDate);
    if (continues) {
      open.endDate = reservation.reservationDate;
      open.reservations.push(reservation);
      continue;
    }
    const context: CrawlContext = {
      organizationName: reservation.organizationName,
      facilityId: reservation.facilityId,
      facilityName: reservation.facilityName,
      startDate: reservation.reservationDate,
      endDate: reservation.reservationDate,
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      classification: reservation.classification,
      reservations: [reservation],
    };
    contexts.push(context);
    openContextByKey.set(key, context);
  }
  return contexts;
}

/** 크롤 수집 시각(ISO 절대시각) → "MM/DD HH:mm"(KST) — §13 확인 목록의 "크롤링 시각" 표기용. */
export function crawledAtLabel(iso: string): string {
  const formatted = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
  // sv-SE: "MM-DD HH:mm" — 구분자만 표기 관례(/)로 바꾼다.
  return formatted.replace('-', '/');
}

/** "08/28~08/30" 또는 단일 일자 "08/28" — 맥락 표기용. */
export function contextDateLabel(context: CrawlContext): string {
  const short = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
  return context.startDate === context.endDate
    ? short(context.startDate)
    : `${short(context.startDate)}~${short(context.endDate)}`;
}
