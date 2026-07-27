import type { UserStatus } from '@duing/types';

/**
 * 회원 관리 목록의 URL 질의 문자열 변환.
 *
 * <p>동기화하는 것은 상태 필터와 페이지뿐이다. **이름·학번 같은 자유 검색어는 URL 에 싣지 않는다** —
 * 주소에 들어가는 순간 브라우저 방문 기록과 referrer 에 남고, 페이지뷰 이벤트의 현재 주소로도 전송된다.
 * 이 레포가 오류 보고 쪽에서 같은 이유로 질의 문자열을 지우고 있는 것과 같은 판단이다.
 * 필터만 담아도 "정지 회원 목록"을 공유하거나 뒤로가기로 되돌아오는 목적은 그대로 달성된다.
 */

const USER_STATUSES: readonly UserStatus[] = ['ACTIVE', 'SUSPENDED'];

/** 주소창은 사람이 읽고 고치는 자리라 페이지를 1부터 센다. 내부 페이지 번호는 0부터다. */
const FIRST_PAGE_IN_URL = 1;

/** 알 수 없는 값은 필터 없음으로 떨어뜨린다 — 손으로 고친 주소가 빈 목록이 되지 않게 한다. */
export function parseStatusParam(raw: string | null): UserStatus | undefined {
  return USER_STATUSES.find((status) => status === raw);
}

/** 정수가 아니거나 1 미만이면 첫 페이지로 본다. */
export function parsePageParam(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < FIRST_PAGE_IN_URL) return 0;
  return parsed - FIRST_PAGE_IN_URL;
}

/** 기본값(필터 없음·첫 페이지)은 주소에 남기지 않는다 — 기본 상태의 주소가 지저분해지지 않게 한다. */
export function buildUsersQuery(status: UserStatus | undefined, page: number): string {
  const params = new URLSearchParams();
  if (status !== undefined) params.set('status', status);
  if (page > 0) params.set('page', String(page + FIRST_PAGE_IN_URL));
  const query = params.toString();
  return query.length > 0 ? `?${query}` : '';
}
