/**
 * DOM 없이 동작하는 HTML → 평문 변환.
 *
 * <p>서버 렌더·하이드레이션 첫 프레임에서 HTML 로 저장된 본문(동아리 소개 Tiptap HTML 등)을 텍스트로 보여 줄 때
 * 쓴다 — 정화기(DOMPurify)와 DOMParser 는 브라우저 전용이라 서버에서 쓸 수 없다. 결과는 React 가 텍스트로
 * 이스케이프해 렌더하므로 HTML 로 주입하지 않는다(XSS 경로 없음). 하이드레이션 뒤에는 기존 정화 경로가 그린다.
 *
 * <p>태그는 `<`·`</` 바로 뒤가 ASCII 글자일 때만 인정한다 — `<신입부원 모집>` 같은 레거시 평문은 그대로 두며,
 * 하이드레이션 뒤 정화 경로도 이 문자열을 텍스트로 둔다(splitDescription 의 평문 폴백).
 */
const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENT = /<!--[\s\S]*?-->/g;
const LINE_BREAK = /<br\s*\/?>|<\/li\s*>/gi;
const BLOCK_END = /<\/(?:p|h[1-6]|ul|ol|blockquote|pre|div)\s*>/gi;
// 입력 상한 — 소개(TEXT)에는 길이 제한이 없다. 이 변환은 서버 렌더 폴백·메타 설명에만 쓰이므로, 비정상적으로
// 긴 입력이 ISR 생성 시간을 잡아먹지 않게 앞부분만 처리한다(하이드레이션 뒤 정화 경로는 전체를 그린다).
const MAX_INPUT_LENGTH = 20_000;
// Tiptap 목록은 항목마다 <li><p>…</p></li> — 항목 문단 끝을 빈 줄로 만들면 목록이 문단 여러 개로 쪼개진다.
const LIST_ITEM_PARAGRAPH_END = /<\/p\s*>\s*<\/li\s*>/gi;
// [^<>] — 닫는 > 가 없는 '<a<a<a…' 에서도 다음 '<' 에서 멈춰 길이에 선형이다.
const TAG = /<\/?[A-Za-z][^<>]*>/g;
// 공백 덩어리의 시작에서만 매치를 시도해 선형이다.
const TRAILING_SPACE = /(?<![ \t])[ \t]+\n/g;
const ENTITY = /&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z]+);/g;
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};
const MAX_CODE_POINT = 0x10ffff;

// 한 번의 치환 콜백으로 해제한다 — 결과를 다시 훑지 않으므로 `&amp;lt;` 는 `&lt;` 까지만 벗겨진다.
function decodeEntity(match: string, body: string): string {
  if (body.startsWith('#')) {
    const isHex = body[1] === 'x' || body[1] === 'X';
    const codePoint = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
    return codePoint >= 0 && codePoint <= MAX_CODE_POINT ? String.fromCodePoint(codePoint) : match;
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? match;
}

export function htmlToPlainText(html: string): string {
  return html
    .slice(0, MAX_INPUT_LENGTH)
    .replace(SCRIPT_OR_STYLE, '')
    .replace(COMMENT, '')
    .replace(LIST_ITEM_PARAGRAPH_END, '</li>')
    .replace(LINE_BREAK, '\n')
    .replace(BLOCK_END, '\n\n')
    .replace(TAG, '')
    .replace(ENTITY, decodeEntity)
    .replace(TRAILING_SPACE, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const BLANK_LINE = /\n\s*\n/;

/** 평문을 첫 문단(lead)과 나머지(rest)로 나눈다 — 빈 줄(사이 공백 허용) 기준. 나머지가 없으면 rest 는 null. */
export function splitPlainText(text: string): { lead: string; rest: string | null } {
  const [lead, ...rest] = text.split(BLANK_LINE);
  return { lead: lead ?? '', rest: rest.length > 0 ? rest.join('\n\n') : null };
}
