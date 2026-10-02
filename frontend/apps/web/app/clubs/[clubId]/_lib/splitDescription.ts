import { splitPlainText } from '@/app/_lib/htmlToPlainText';
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

/** HTML(Tiptap) 소개인지 — '<' 로 시작하면 HTML 로 본다. `<신입부원 모집>` 같은 레거시 평문도 걸리지만 아래가 평문으로 폴백한다. */
export function isHtmlDescription(description: string): boolean {
  return HTML_LEADING.test(description);
}

// HTML 분기는 DOMParser·DOMPurify 를 쓰므로 브라우저(하이드레이션 이후)에서만 호출한다 — 서버 렌더와
// 하이드레이션 첫 프레임에서는 ClubDetailAbout 이 htmlToPlainText + splitPlainText 폴백을 쓴다.
export function splitDescription(description: string): SplitDescription {
  if (isHtmlDescription(description)) {
    const doc = new DOMParser().parseFromString(sanitizeNoticeHtml(description), 'text/html');
    const [first, ...remaining] = Array.from(doc.body.children);
    // 첫 블록이 없으면 '<신입부원 모집>' 처럼 '<' 로 시작하는 레거시 plain 텍스트가 태그로 오인식돼
    // sanitize 단계에서 전부 이스케이프된 경우다 — plain 경로로 폴백해 본문 전체 소실을 막는다.
    if (first !== undefined) {
      return {
        isHtml: true,
        lead: first.outerHTML,
        rest: remaining.length > 0 ? remaining.map((block) => block.outerHTML).join('') : null,
      };
    }
  }

  const { lead, rest } = splitPlainText(description);
  return { isHtml: false, lead, rest };
}
