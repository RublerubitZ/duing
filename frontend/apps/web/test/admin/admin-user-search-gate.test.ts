import { describe, expect, it } from 'vitest';

import { shouldRunAdminUserSearch } from '@duing/hooks';

describe('회원 검색 실행 게이트', () => {
  it('검색어가 있으면 실행한다', () => {
    expect(shouldRunAdminUserSearch('김도윤', undefined)).toBe(true);
  });

  it('검색어가 비어 있고 빈 검색을 허용하지 않으면 실행하지 않는다 — 동아리장 검색 콤보박스가 전체 회원을 쏟아내지 않게 한다', () => {
    expect(shouldRunAdminUserSearch('', undefined)).toBe(false);
    expect(shouldRunAdminUserSearch('   ', undefined)).toBe(false);
    expect(shouldRunAdminUserSearch('', {})).toBe(false);
    expect(shouldRunAdminUserSearch('', { allowEmptyQuery: false })).toBe(false);
  });

  it('빈 검색을 명시적으로 허용하면 검색어가 없어도 실행한다 — 회원 관리 목록 전용', () => {
    expect(shouldRunAdminUserSearch('', { allowEmptyQuery: true })).toBe(true);
  });
});
