import { describe, expect, it } from 'vitest';

import {
  buildUsersQuery,
  parsePageParam,
  parseStatusParam,
} from '@/app/admin/users/_lib/usersQuerySync';

describe('회원 관리 목록 URL 동기화', () => {
  // 이 파일의 존재 이유 — 자유 검색어(이름·학번)가 주소에 실리면 방문 기록·referrer 와
  // 페이지뷰 이벤트의 현재 주소로 새어나간다. 질의 문자열을 만드는 자리는 여기 하나뿐이다.
  it('검색어를 담을 자리를 두지 않는다 — 필터와 페이지만 주소에 오른다', () => {
    expect(buildUsersQuery('SUSPENDED', 2)).toBe('?status=SUSPENDED&page=3');
    expect(buildUsersQuery('SUSPENDED', 2)).not.toContain('q=');
  });

  it('기본값(필터 없음·첫 페이지)은 주소에 남기지 않는다', () => {
    expect(buildUsersQuery(undefined, 0)).toBe('');
    expect(buildUsersQuery('ACTIVE', 0)).toBe('?status=ACTIVE');
    expect(buildUsersQuery(undefined, 1)).toBe('?page=2');
  });

  it('주소의 페이지는 1부터, 내부 페이지는 0부터 센다', () => {
    expect(parsePageParam('1')).toBe(0);
    expect(parsePageParam('3')).toBe(2);
    // 왕복해도 같은 페이지여야 한다 — 한쪽만 고치면 새로고침마다 페이지가 밀린다.
    expect(parsePageParam(new URLSearchParams(buildUsersQuery(undefined, 4)).get('page'))).toBe(4);
  });

  // 손으로 고친 주소가 빈 목록이 되지 않게 한다.
  it('알 수 없거나 잘못된 값은 기본값으로 떨어뜨린다', () => {
    expect(parseStatusParam('DELETED')).toBeUndefined();
    expect(parseStatusParam(null)).toBeUndefined();
    expect(parseStatusParam('active')).toBeUndefined();
    expect(parseStatusParam('ACTIVE')).toBe('ACTIVE');

    expect(parsePageParam('0')).toBe(0);
    expect(parsePageParam('-3')).toBe(0);
    expect(parsePageParam('2.5')).toBe(0);
    expect(parsePageParam('abc')).toBe(0);
    expect(parsePageParam(null)).toBe(0);
  });
});
