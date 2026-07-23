import { sanitizeNoticeHtml } from '@/app/notices/_lib/sanitizeHtml';

export type SplitDescription = {
  isHtml: boolean;
  /** 첫 블록(HTML outerHTML) 또는 첫 문단(plain) */
  lead: string;
  /** 나머지 블록/문단. 없으면 null */
  rest: string | null;
};

// 콘솔이 Tiptap HTML 로 저장하기 시작하면 소개글은 '<' 로 시작한다(레거시는 전부 plain text).
const HTML_LEADING = /^\s*</;
// plain text 문단 구분 — 빈 줄(사이 공백 허용)
const BLANK_LINE = /\n\s*\n/;

// DOMParser 사용 — 클럽 상세는 클라이언트 쿼리로만 렌더되므로(SSR 은 스켈레톤) 이 함수는
// 브라우저/jsdom 에서만 호출된다. 서버 컴포넌트에서 직접 호출 금지.
export function splitDescription(description: string): SplitDescription {
  if (HTML_LEADING.test(description)) {
    const doc = new DOMParser().parseFromString(sanitizeNoticeHtml(description), 'text/html');
    const [first, ...remaining] = Array.from(doc.body.children);
    return {
      isHtml: true,
      lead: first?.outerHTML ?? '',
      rest: remaining.length > 0 ? remaining.map((block) => block.outerHTML).join('') : null,
    };
  }

  const [firstParagraph, ...remainingParagraphs] = description.split(BLANK_LINE);
  return {
    isHtml: false,
    lead: firstParagraph ?? '',
    rest: remainingParagraphs.length > 0 ? remainingParagraphs.join('\n\n') : null,
  };
}
