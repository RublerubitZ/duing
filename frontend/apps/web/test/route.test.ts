import { describe, expect, it } from 'vitest';
import { safeExternalHref } from '../app/_lib/route';

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
