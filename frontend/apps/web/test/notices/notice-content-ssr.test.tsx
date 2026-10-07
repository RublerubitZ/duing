/**
 * @vitest-environment node
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { NoticeContent } from '@/app/notices/_components/NoticeContent';

// 서버(DOMPurify 없음)에서 HTML 본문을 그려도 throw 하지 않고 본문 텍스트를 담아야 한다 —
// 정적 생성 중 SSR 예외가 하나라도 나면 그 페이지 생성 전체가 실패한다.
describe('NoticeContent — 서버 렌더', () => {
  it('HTML 본문을 태그 없는 문단 텍스트로 렌더한다', () => {
    const html = renderToString(
      <NoticeContent
        content="<p>첫 <strong>문단</strong></p><ul><li><p>부스 신청</p></li></ul>"
        format="HTML"
      />,
    );

    expect(html).toContain('첫 문단');
    expect(html).toContain('부스 신청');
    expect(html).not.toContain('<strong>');
  });

  it('형식이 없으면(구 백엔드) HTML 로 보고 같은 폴백을 쓴다', () => {
    const html = renderToString(<NoticeContent content="<p>본문</p>" />);

    // '본문' 포함만 보면 태그가 그대로 새도 통과한다 — 폴백 문단으로 그렸고 원문 태그가 없는지 본다.
    expect(html).toContain('whitespace-pre-wrap');
    expect(html).not.toContain('<p>본문</p>');
  });

  it('빈 문단뿐인 본문(<p></p>)도 throw 없이 렌더한다', () => {
    expect(() => renderToString(<NoticeContent content="<p></p>" format="HTML" />)).not.toThrow();
  });

  it('MARKDOWN 은 지금처럼 서버에서 마크다운으로 렌더한다', () => {
    const html = renderToString(<NoticeContent content={'## 소제목\n\n본문'} format="MARKDOWN" />);

    expect(html).toContain('소제목');
    expect(html).not.toContain('##');
  });
});
