import { describe, expect, it } from 'vitest';
import { safeExternalHref, toLinkRoute } from '../app/_lib/route';

describe('toLinkRoute', () => {
  it('내부 절대경로는 그대로 통과시킨다', () => {
    expect(toLinkRoute('/me')).toBe('/me');
    expect(toLinkRoute('/clubs/1')).toBe('/clubs/1');
    expect(toLinkRoute('/notifications?tab=all')).toBe('/notifications?tab=all');
  });

  it('프로토콜 상대경로(//host)·역슬래시(/\\host)는 오프-오리진이므로 null 로 차단한다', () => {
    // 로그인 next 리다이렉트 open redirect 차단의 핵심 — 브라우저가 //, /\ 를 외부 호스트로 해석한다.
    expect(toLinkRoute('//evil.com')).toBeNull();
    expect(toLinkRoute('/\\evil.com')).toBeNull();
    expect(toLinkRoute('/\\/evil.com')).toBeNull();
  });

  it('탭·개행·CR 을 끼워 넣어 //host 로 정규화되는 우회도 차단한다', () => {
    // 브라우저 URL 파서가 \t \n \r 을 제거하면 `/\t/evil.com` 이 `//evil.com` 으로 정규화된다.
    expect(toLinkRoute('/\t/evil.com')).toBeNull();
    expect(toLinkRoute('/\n//evil.com')).toBeNull();
    expect(toLinkRoute('/\r//evil.com')).toBeNull();
  });

  it('쿼리 퍼센트 디코딩(%09·%2F)을 거친 값도 동일하게 차단된다', () => {
    // searchParams.get 은 퍼센트 디코딩을 먼저 수행하므로 %09 → \t, %2F → / 로 도착한다.
    const decodedTab = new URLSearchParams('next=/%09/evil.com').get('next');
    expect(decodedTab).toBe('/\t/evil.com');
    expect(toLinkRoute(decodedTab)).toBeNull();
    expect(toLinkRoute(new URLSearchParams('next=/%0A//evil.com').get('next'))).toBeNull();
    expect(toLinkRoute(new URLSearchParams('next=/%0D//evil.com').get('next'))).toBeNull();
    expect(toLinkRoute(new URLSearchParams('next=%2F%2Fevil.com').get('next'))).toBeNull();
  });

  it('슬래시로 시작하지 않는 값·빈 값·null 은 내부 경로가 아니므로 null', () => {
    expect(toLinkRoute('https://evil.com')).toBeNull();
    expect(toLinkRoute('javascript:alert(1)')).toBeNull();
    expect(toLinkRoute('me')).toBeNull();
    expect(toLinkRoute('')).toBeNull();
    expect(toLinkRoute(null)).toBeNull();
  });
});

describe('safeExternalHref', () => {
  it('http(s) 외부 URL은 그대로 통과시킨다', () => {
    expect(safeExternalHref('https://duings.com')).toBe('https://duings.com');
    expect(safeExternalHref('http://example.com/path?q=1')).toBe('http://example.com/path?q=1');
    expect(safeExternalHref('HTTPS://Duings.com')).toBe('HTTPS://Duings.com');
  });

  it('javascript:/data:/vbscript: 등 스크립트 실행 스킴은 null 로 차단한다', () => {
    expect(safeExternalHref('javascript:alert(1)')).toBeNull();
    expect(safeExternalHref('JavaScript:alert(1)')).toBeNull();
    expect(safeExternalHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeExternalHref('vbscript:msgbox(1)')).toBeNull();
  });

  it('공백·개행·탭을 끼워 넣은 스킴 우회도 차단한다', () => {
    expect(safeExternalHref('java\tscript:alert(1)')).toBeNull();
    expect(safeExternalHref('\njavascript:alert(1)')).toBeNull();
    expect(safeExternalHref('  javascript:alert(1)')).toBeNull();
  });

  it('내부 상대경로·프로토콜 상대경로·빈 값·null/undefined 는 외부 링크가 아니므로 null', () => {
    expect(safeExternalHref('/clubs/1')).toBeNull();
    expect(safeExternalHref('//evil.com')).toBeNull();
    expect(safeExternalHref('')).toBeNull();
    expect(safeExternalHref(null)).toBeNull();
    expect(safeExternalHref(undefined)).toBeNull();
  });
});
