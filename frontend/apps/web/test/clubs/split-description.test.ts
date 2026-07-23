import { describe, expect, it } from 'vitest';

import { splitDescription } from '../../app/clubs/[clubId]/_lib/splitDescription';

// 소개 본문을 lead(첫 블록/문단) + rest(나머지)로 나누는 순수 함수.
// HTML(콘솔 Tiptap 저장분)과 레거시 plain text 를 모두 다룬다.
describe('splitDescription', () => {
  it('HTML 다중 블록: 첫 블록이 lead, 나머지가 rest', () => {
    const result = splitDescription('<p>첫째</p><p>둘째</p><p>셋째</p>');
    expect(result.isHtml).toBe(true);
    expect(result.lead).toBe('<p>첫째</p>');
    expect(result.rest).toBe('<p>둘째</p><p>셋째</p>');
  });

  it('HTML 단일 블록: rest 는 null', () => {
    const result = splitDescription('<p>하나뿐인 문단</p>');
    expect(result.isHtml).toBe(true);
    expect(result.lead).toBe('<p>하나뿐인 문단</p>');
    expect(result.rest).toBeNull();
  });

  it('plain 다중 문단: 빈 줄 기준으로 lead/rest 분할', () => {
    const result = splitDescription('첫 문단\n\n둘째 문단\n\n셋째 문단');
    expect(result.isHtml).toBe(false);
    expect(result.lead).toBe('첫 문단');
    expect(result.rest).toBe('둘째 문단\n\n셋째 문단');
  });

  it('plain 단일 문단: rest 는 null', () => {
    const result = splitDescription('문단 하나뿐입니다');
    expect(result.isHtml).toBe(false);
    expect(result.lead).toBe('문단 하나뿐입니다');
    expect(result.rest).toBeNull();
  });

  it('HTML 안의 <script> 는 sanitize 로 제거된다', () => {
    const result = splitDescription('<p>안전한 문단</p><script>alert(1)</script><p>둘째 문단</p>');
    expect(result.isHtml).toBe(true);
    expect(result.lead).toBe('<p>안전한 문단</p>');
    expect(result.rest).toBe('<p>둘째 문단</p>');
    expect(`${result.lead}${result.rest ?? ''}`).not.toContain('script');
  });

  it("'<' 로 시작하는 레거시 plain 텍스트는 HTML 로 오인하지 않고 원문을 보존한다", () => {
    const result = splitDescription('<신입부원 모집> 환영합니다');
    expect(result.isHtml).toBe(false);
    expect(result.lead).toBe('<신입부원 모집> 환영합니다');
    expect(result.rest).toBeNull();
  });
});
