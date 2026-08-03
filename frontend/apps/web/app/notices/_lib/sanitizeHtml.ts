// isomorphic-dompurify 가 아니라 dompurify 를 직접 쓴다 — 전자는 서버 진입점에서 jsdom 을 모듈 평가
// 시점에 로드하는데(new JSDOM(...)), jsdom 29 의 html-encoding-sniffer 가 ESM 전용 @exodus/bytes 를
// require 해 Vercel 런타임 로더에서 ERR_REQUIRE_ESM 으로 죽는다. 그 여파로 이 모듈을 import 그래프에
// 가진 라우트(동아리 상세·공지 상세)에서 하드 내비게이션 시 React #419(SSR 스트림 중단)가 실측됐다.
// 소비처가 전부 'use client' 라 서버에 jsdom 이 필요한 적이 애초에 없었다.
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 's', 'h2', 'h3', 'ul', 'ol', 'li',
  'a', 'img', 'blockquote', 'hr', 'code', 'pre'];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt'];
const ALLOWED_URI_REGEXP = /^(https?:|mailto:|\/)/i;

let hookRegistered = false;
function ensureAnchorHook(): void {
  if (hookRegistered) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
  hookRegistered = true;
}

export function sanitizeNoticeHtml(html: string): string {
  // 브라우저 전용이다. window 없이 로드된 dompurify 는 sanitize/addHook 이 아예 없으므로(isSupported=false)
  // 어차피 TypeError 로 죽지만, 원인을 읽을 수 있게 먼저 던진다. 빈 문자열로 눙치지 않는 이유는
  // ① SSR 이 빈 본문을 내보내 SEO 이득이 0 이 되고 ② React 는 hydration 불일치를 반드시 되돌린다고
  // 보장하지 않아 본문이 조용히 사라질 수 있어서다. 서버 렌더 경로 유입은 숨기지 말고 즉시 드러낸다.
  if (!DOMPurify.isSupported) {
    throw new Error(
      'sanitizeNoticeHtml 은 브라우저 전용입니다 — 서버 렌더 경로에서 호출됐습니다. ' +
        '호출부를 클라이언트 렌더 이후로 옮기거나, 서버 정화가 정말 필요하면 별도 수단을 도입하세요.',
    );
  }
  ensureAnchorHook();
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOWED_URI_REGEXP });
}
