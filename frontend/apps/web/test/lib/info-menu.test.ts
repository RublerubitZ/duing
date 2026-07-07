import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_INFO_PATH,
  getLastInfoPath,
  isInfoHubPage,
  isInfoSection,
  rememberInfoPath,
} from '../../app/_lib/infoMenu';

const STORAGE_KEY = 'duing:info-last-path';

beforeEach(() => {
  window.localStorage.clear();
});

describe('isInfoSection — GNB·BottomNav active 판정(섹션 전체)', () => {
  it.each(['/notices', '/faq', '/terms', '/introduce'])(
    '허브 페이지 %s 는 정보 섹션이다',
    (path) => {
      expect(isInfoSection(path)).toBe(true);
    },
  );

  it('공지 상세(/notices/123)도 정보 섹션이다', () => {
    expect(isInfoSection('/notices/123')).toBe(true);
  });

  it('유사 접두 경로(/notifications)는 정보 섹션이 아니다', () => {
    expect(isInfoSection('/notifications')).toBe(false);
  });

  it('무관 경로(/clubs)는 정보 섹션이 아니다', () => {
    expect(isInfoSection('/clubs')).toBe(false);
  });
});

describe('isInfoHubPage — InfoTabs 허브 페이지 판정(상세 제외)', () => {
  it.each(['/notices', '/faq', '/terms', '/introduce'])('%s 는 허브 페이지다', (path) => {
    expect(isInfoHubPage(path)).toBe(true);
  });

  it('상세 페이지(/notices/123)는 허브가 아니다', () => {
    expect(isInfoHubPage('/notices/123')).toBe(false);
  });
});

describe('rememberInfoPath / getLastInfoPath — 마지막 방문 기억', () => {
  it('허브 페이지 방문을 기록하고 그대로 돌려준다', () => {
    rememberInfoPath('/faq');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('/faq');
    expect(getLastInfoPath()).toBe('/faq');
  });

  it('허브가 아닌 경로(/notices/123)는 기록하지 않는다', () => {
    rememberInfoPath('/faq');
    rememberInfoPath('/notices/123');
    expect(getLastInfoPath()).toBe('/faq');
  });

  it('기록이 없으면 기본 경로(/notices)를 반환한다', () => {
    expect(getLastInfoPath()).toBe(DEFAULT_INFO_PATH);
  });

  it('저장값이 유효한 허브 경로가 아니면 기본 경로로 폴백한다', () => {
    window.localStorage.setItem(STORAGE_KEY, '/evil');
    expect(getLastInfoPath()).toBe(DEFAULT_INFO_PATH);
  });
});
