/**
 * 회비 감사 콘솔의 전역 기간 상태 — 프리셋 환산과 목록 화면 주소 동기화를 함께 소유한다.
 *
 * <p>프리셋(최근 30일·이번 학기 …)을 from/to 로 바꾸는 일은 전적으로 프론트 몫이다 —
 * 서버에 학기 개념을 심지 않기로 했다(스펙 §7.0). 학기 경계도 여기 상수로만 존재한다.
 *
 * <p>주소에 싣는 것은 기간·필터·정렬·페이지뿐이다. **동아리명 검색어는 싣지 않는다** —
 * 주소에 들어가는 순간 방문 기록·referrer·페이지뷰 이벤트로 새어나간다(관리자 콘솔 규약).
 */

import { todayKstDateString } from '@duing/hooks/datetime';
import type { AdminFeeClubSort, AdminFeePeriodParams, AdminFeeUsageFilter } from '@duing/types';

export const FEE_PERIOD_PRESETS = [
  'ALL',
  'LAST_30D',
  'LAST_90D',
  'SEMESTER',
  'YEAR',
  'CUSTOM',
] as const;

export type FeePeriodPreset = (typeof FEE_PERIOD_PRESETS)[number];

/** from/to 는 CUSTOM 일 때만 의미가 있다 — 나머지 프리셋은 조회 시점의 오늘을 기준으로 매번 환산한다. */
export type FeePeriodValue = { preset: FeePeriodPreset; from?: string; to?: string };

export const FEE_PERIOD_LABEL: Record<FeePeriodPreset, string> = {
  ALL: '전체',
  LAST_30D: '최근 30일',
  LAST_90D: '최근 90일',
  SEMESTER: '이번 학기',
  YEAR: '올해',
  CUSTOM: '직접 선택',
};

const KST_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** yyyy-MM-dd 에 일수를 더한다. UTC 자정으로 고정해 계산하므로 실행 환경의 시간대·서머타임과 무관하다. */
export function addDaysKst(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * 학기 경계(스펙 §7.0): 1학기 3/1~8/31, 2학기 9/1~익년 2월 말.
 * 1~2월은 전년도 9월에 시작한 2학기의 끝자락이라 시작 연도가 한 해 뒤로 간다.
 */
function semesterRange(today: string): AdminFeePeriodParams {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (month >= 3 && month <= 8) return { from: `${year}-03-01`, to: `${year}-08-31` };

  const startYear = month >= 9 ? year : year - 1;
  // Date.UTC(y, 2, 0) 은 "3월 0일" = 2월 말일이다 — 윤년 규칙을 직접 쓰지 않고 달력에 맡긴다.
  const endOfFebruary = new Date(Date.UTC(startYear + 1, 2, 0)).toISOString().slice(0, 10);
  return { from: `${startYear}-09-01`, to: endOfFebruary };
}

/** 프리셋을 서버가 이해하는 from/to 로 환산한다. now 를 주입하면 결정적으로 테스트할 수 있다. */
export function resolvePeriodParams(
  value: FeePeriodValue,
  now: Date = new Date(),
): AdminFeePeriodParams {
  const today = todayKstDateString(now);
  switch (value.preset) {
    case 'ALL':
      return {};
    case 'LAST_30D':
      return { from: addDaysKst(today, -30), to: today };
    case 'LAST_90D':
      return { from: addDaysKst(today, -90), to: today };
    case 'SEMESTER':
      return semesterRange(today);
    case 'YEAR':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'CUSTOM':
      // 한쪽만 고른 상태도 유효한 조회다 — 서버가 열린 구간으로 받는다.
      return { from: value.from, to: value.to };
  }
}

/** useSearchParams 의 ReadonlyURLSearchParams 와 URLSearchParams 를 함께 받기 위한 최소 형태. */
type ParamReader = { get(key: string): string | null };

/** 손으로 고친 주소가 조회를 깨뜨리지 않도록 알 수 없는 값은 기본값으로 떨어뜨린다. */
export function readPeriodValue(
  params: ParamReader,
  fallback: FeePeriodPreset = 'ALL',
): FeePeriodValue {
  const raw = params.get('period');
  const preset = FEE_PERIOD_PRESETS.find((candidate) => candidate === raw) ?? fallback;
  if (preset !== 'CUSTOM') return { preset };
  // 날짜 형식이 아닌 값은 그대로 서버로 보내지 않는다 — 주소는 아무나 고칠 수 있는 입력이다.
  return { preset, from: readDate(params.get('from')), to: readDate(params.get('to')) };
}

function readDate(raw: string | null): string | undefined {
  return raw !== null && KST_DATE_PATTERN.test(raw) ? raw : undefined;
}

/** 기본값(전체 기간)은 주소에 남기지 않는다 — 기본 상태의 주소가 지저분해지지 않게 한다. */
export function writePeriodParams(params: URLSearchParams, value: FeePeriodValue): void {
  if (value.preset === 'ALL') return;
  params.set('period', value.preset);
  if (value.preset !== 'CUSTOM') return;
  if (value.from !== undefined) params.set('from', value.from);
  if (value.to !== undefined) params.set('to', value.to);
}

export type FeesQueryState = {
  period: FeePeriodValue;
  usage?: AdminFeeUsageFilter;
  sort: AdminFeeClubSort;
  page: number;
};

const USAGE_FILTERS: readonly AdminFeeUsageFilter[] = ['USING', 'NOT_USING'];
const CLUB_SORTS: readonly AdminFeeClubSort[] = [
  'OUTSTANDING',
  'BILLED',
  'COLLECTED',
  'RECENT_PAYMENT',
  'NAME',
];
export const DEFAULT_FEE_CLUB_SORT: AdminFeeClubSort = 'OUTSTANDING';

/** 주소창은 사람이 읽고 고치는 자리라 페이지를 1부터 센다. 내부 페이지 번호는 0부터다. */
const FIRST_PAGE_IN_URL = 1;

/** fallback 은 주소에 기간이 없을 때 쓸 기본 프리셋 — 목록은 전체, 상세는 최근 30일이 기본이다. */
export function readFeesQuery(
  params: ParamReader,
  fallback: FeePeriodPreset = 'ALL',
): FeesQueryState {
  const rawUsage = params.get('usage');
  const rawSort = params.get('sort');
  return {
    period: readPeriodValue(params, fallback),
    usage: USAGE_FILTERS.find((candidate) => candidate === rawUsage),
    sort: CLUB_SORTS.find((candidate) => candidate === rawSort) ?? DEFAULT_FEE_CLUB_SORT,
    page: readPage(params.get('page')),
  };
}

/** 정수가 아니거나 1 미만이면 첫 페이지로 본다. */
function readPage(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < FIRST_PAGE_IN_URL) return 0;
  return parsed - FIRST_PAGE_IN_URL;
}

export function buildFeesQuery(state: FeesQueryState): string {
  const params = new URLSearchParams();
  writePeriodParams(params, state.period);
  if (state.usage !== undefined) params.set('usage', state.usage);
  if (state.sort !== DEFAULT_FEE_CLUB_SORT) params.set('sort', state.sort);
  if (state.page > 0) params.set('page', String(state.page + FIRST_PAGE_IN_URL));
  const query = params.toString();
  return query.length > 0 ? `?${query}` : '';
}
