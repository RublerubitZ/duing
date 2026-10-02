import { splitPlainText } from '@/app/_lib/htmlToPlainText';
import { sanitizeNoticeHtml } from '@/app/notices/_lib/sanitizeHtml';

import { isHtmlDescription } from './descriptionText';

// 판정은 DOM 이 필요 없어 descriptionText 로 옮겼다 — 기존 호출처 호환을 위해 여기서도 내보낸다.
export { isHtmlDescription } from './descriptionText';

export type SplitDescription = {
  isHtml: boolean;
  /** 첫 블록(HTML outerHTML) 또는 첫 문단(plain) */
  lead: string;
  /** 나머지 블록/문단. 없으면 null */
  rest: string | null;
};

// HTML 분기는 DOMParser·DOMPurify 를 쓰므로 브라우저(하이드레이션 이후)에서만 호출한다 — 서버 렌더와
// 하이드레이션 첫 프레임에서는 ClubDetailAbout 이 descriptionToPlainText + splitPlainText 폴백을 쓴다.
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
