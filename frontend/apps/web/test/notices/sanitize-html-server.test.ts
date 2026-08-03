/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { sanitizeNoticeHtml } from '../../app/notices/_lib/sanitizeHtml';

// window 가 없는 런타임(= Next 의 SSR 레이어)에서의 계약을 고정한다.
// 빈 문자열을 돌려주면 SSR 이 빈 본문을 내보내고도 화면은 멀쩡해 보여 몇 달 뒤에나 발각된다.
// 서버 렌더 경로 유입은 반드시 즉시 드러나야 한다.
describe('sanitizeNoticeHtml — 브라우저 밖 호출', () => {
  it('빈 문자열로 눙치지 않고 원인을 밝히며 던진다', () => {
    expect(() => sanitizeNoticeHtml('<p>본문</p>')).toThrow(/브라우저 전용/);
  });
});
