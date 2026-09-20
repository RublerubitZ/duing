import { afterEach, describe, expect, it } from 'vitest';

import { loginReturnHref } from '@/app/_lib/loginReturnHref';

describe('loginReturnHref — 로그인 후 현재 딥링크로 복귀시키는 /login 링크', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('쿼리가 붙은 딥링크를 next 파라미터로 인코딩한다', () => {
    window.history.replaceState({}, '', '/facilities?facilityId=3&date=2026-09-20');

    // 인코딩이 빠지면 next 값의 &date=… 가 /login 자신의 쿼리로 떨어져 복귀 경로가 잘린다.
    expect(loginReturnHref()).toBe('/login?next=%2Ffacilities%3FfacilityId%3D3%26date%3D2026-09-20');
  });

  it('쿼리가 없으면 경로만 next 로 넘긴다', () => {
    window.history.replaceState({}, '', '/facilities');

    expect(loginReturnHref()).toBe('/login?next=%2Ffacilities');
  });
});
