import { describe, expect, it } from 'vitest';
import { safeExternalHref, toLinkRoute, toReturnRoute } from '../app/_lib/route';

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

describe('toReturnRoute', () => {
  it('세그먼트 프리페치 접미(.segments/…)를 떼어 페이지 경로만 남긴다', () => {
    expect(toReturnRoute('/me.segments/_tree.segment.rsc')).toBe('/me');
    // Next 가 .rsc 를 뗀 뒤 미들웨어가 보는 실제 형태.
    expect(toReturnRoute('/me.segments/_tree.segment')).toBe('/me');
    expect(toReturnRoute('/manage/clubs/3.segments/manage/clubs/3/_index.segment')).toBe('/manage/clubs/3');
  });

  it('접미를 떼도 쿼리는 보존한다', () => {
    expect(toReturnRoute('/admin/users.segments/_tree.segment.rsc?tab=a')).toBe('/admin/users?tab=a');
  });

  it('.prefetch·.rsc·.json 접미를 뗀다', () => {
    expect(toReturnRoute('/me/profile.prefetch.rsc')).toBe('/me/profile');
    expect(toReturnRoute('/me/profile.prefetch')).toBe('/me/profile');
    expect(toReturnRoute('/me.rsc')).toBe('/me');
    expect(toReturnRoute('/me.json')).toBe('/me');
  });

  it('세그먼트 접미는 Next 정규화기와 같게 마지막 .segments/ 기준으로 자른다', () => {
    expect(toReturnRoute('/manage/clubs/x.segments/y.segments/_tree.segment.rsc')).toBe('/manage/clubs/x.segments/y');
  });

  it('전송 접미가 없는 경로는 그대로 통과시킨다', () => {
    expect(toReturnRoute('/me?tab=security')).toBe('/me?tab=security');
    expect(toReturnRoute('/join/ABC123')).toBe('/join/ABC123');
    expect(toReturnRoute('/')).toBe('/');
  });

  it('toLinkRoute 의 open redirect 차단을 그대로 유지한다', () => {
    expect(toReturnRoute('//evil.com')).toBeNull();
    expect(toReturnRoute('/\\evil.com')).toBeNull();
    expect(toReturnRoute('https://evil.com')).toBeNull();
    expect(toReturnRoute(null)).toBeNull();
  });

  it('루트(/)의 전송 경로(/index.*)는 없는 라우트 /index 대신 / 로 접는다', () => {
    expect(toReturnRoute('/index.segments/_tree.segment.rsc')).toBe('/');
    expect(toReturnRoute('/index.rsc')).toBe('/');
    expect(toReturnRoute('/index.prefetch.rsc')).toBe('/');
  });

  it('겹쳐 붙은 접미는 한 번에 뗀다', () => {
    expect(toReturnRoute('/me/x.prefetch.json')).toBe('/me/x');
    expect(toReturnRoute('/me/x.rsc.rsc')).toBe('/me/x');
  });

  it('.segment 꼬리가 없는 .segments/ 경로는 전송 경로가 아니므로 그대로 둔다', () => {
    expect(toReturnRoute('/me/foo.segments/bar')).toBe('/me/foo.segments/bar');
  });

  it('줄 구분자(U+2028)가 끼어도 세그먼트 접미를 끝까지 본다', () => {
    expect(toReturnRoute('/me.segments/x y.segment')).toBe('/me');
  });

  it('두 번 적용해도 결과가 같다(멱등)', () => {
    const inputs = [
      '/me.segments/_tree.segment.rsc',
      '/me.segments/_tree.segment',
      '/manage/clubs/3.segments/manage/clubs/3/_index.segment',
      '/admin/users.segments/_tree.segment.rsc?tab=a',
      '/me/profile.prefetch.rsc',
      '/me/profile.prefetch',
      '/me.rsc',
      '/me.json',
      '/manage/clubs/x.segments/y.segments/_tree.segment.rsc',
      '/me?tab=security',
      '/join/ABC123',
      '/',
      '/index.segments/_tree.segment.rsc',
      '/index.rsc',
      '/index.prefetch.rsc',
      '/me/x.prefetch.json',
      '/me/x.rsc.rsc',
      '/me/foo.segments/bar',
      '/me.segments/x y.segment',
    ];
    for (const input of inputs) {
      const once = toReturnRoute(input);
      expect(toReturnRoute(once!), input).toBe(once);
    }
  });

  it('가입↔로그인 왕복으로 여러 번 정규화돼도 경로가 더 줄지 않는다', () => {
    expect(toReturnRoute(toReturnRoute('/manage/clubs/x.segments/y.segments/_tree.segment'))).toBe(
      '/manage/clubs/x.segments/y',
    );
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
