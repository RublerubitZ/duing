/**
 * @vitest-environment node
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ClubDetailAbout } from '@/app/clubs/[clubId]/_components/ClubDetailAbout';

// 서버(DOMParser·DOMPurify 없음)에서 HTML 소개를 그려도 throw 하지 않고 본문 텍스트를 담아야 한다 —
// 정적 생성 중 SSR 예외가 하나라도 나면 그 페이지 생성 전체가 실패한다.
describe('ClubDetailAbout — 서버 렌더', () => {
  it('HTML 소개를 태그 없는 텍스트로 렌더한다', () => {
    const html = renderToString(
      <ClubDetailAbout description="<p>함께 <strong>운동</strong>해요</p><p>둘째 문단</p>" highlights={[]} />,
    );

    expect(html).toContain('함께 운동해요');
    expect(html).toContain('둘째 문단');
    expect(html).not.toContain('<strong>');
  });

  it('< 로 시작하는 레거시 평문은 텍스트 그대로 둔다', () => {
    const html = renderToString(<ClubDetailAbout description={'<신입부원 모집>\n\n본문'} highlights={[]} />);

    expect(html).toContain('&lt;신입부원 모집&gt;');
    expect(html).toContain('본문');
  });
});
