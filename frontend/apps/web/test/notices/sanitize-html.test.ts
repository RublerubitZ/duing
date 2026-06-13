import { describe, expect, it } from 'vitest';
import { sanitizeNoticeHtml } from '../../app/notices/_lib/sanitizeHtml';

describe('sanitizeNoticeHtml', () => {
  it('script·onerror·javascript: 등 위험 요소를 제거한다', () => {
    const dirty = '<p>hi</p><script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a>';
    const clean = sanitizeNoticeHtml(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onerror');
    expect(clean.toLowerCase()).not.toContain('javascript:');
  });

  it('marked 변환 결과(악성 HTML 포함)도 정화된다', () => {
    const html = '<p><img src=x onerror=alert(1)></p><script>alert(1)</script>';
    const clean = sanitizeNoticeHtml(html);
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('<script');
  });

  it('허용 태그는 보존하고 a 에 rel·target 을 강제한다', () => {
    const clean = sanitizeNoticeHtml('<h2>제목</h2><strong>굵게</strong><ul><li>x</li></ul><img src="https://e/x.png" alt="x"><a href="https://e">링크</a>');
    expect(clean).toContain('<h2>');
    expect(clean).toContain('<strong>');
    expect(clean).toContain('<img');
    expect(clean).toContain('rel="noopener noreferrer nofollow"');
    expect(clean).toContain('target="_blank"');
  });
});
