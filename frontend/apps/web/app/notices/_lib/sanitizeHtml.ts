import DOMPurify from 'isomorphic-dompurify';

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
  ensureAnchorHook();
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOWED_URI_REGEXP });
}
