// 편집 진입 시 소개글을 리치 에디터에 시드하는 순수 변환 함수.
// 학생 렌더의 splitDescription 과 별개다 — 저건 출력 분할용, 이건 편집 시드용.
//
// 콘솔이 저장하는 소개는 Tiptap 표준 HTML(<p>…) 이라 '<' 로 시작한다. 레거시는 전부 plain text.
// plain 을 에디터에 그대로 넣으면 HTML 파싱 과정에서 개행이 공백으로 뭉개져 소실되므로,
// 빈 줄로 문단을 나눠 <p> 로 감싸고 문단 내 단일 개행은 <br> 로 보존한다.
// '<','>','&' 는 이스케이프해 문단 중간의 특수문자가 태그로 오인·삭제되는 데이터 손실을 막는다.

// 콘솔 에디터가 실제로 내보내는 Tiptap 블록/마크 태그로 시작할 때만 저장된 리치 HTML 로 본다.
// "<AI 스터디>"·"<신입 모집>" 처럼 태그명이 화이트리스트에 없으면 plain 으로 취급해 escape 로 회수한다
// (접두부 소실 방지). 콘솔 열람/시드 양쪽이 같은 판정을 쓰도록 공유한다.
export const STORED_RICH_HTML_LEADING = /^\s*<(p|ul|ol|li|blockquote|hr|h[1-6]|strong|em|s|a|br|div)[\s>/]/i;
const BLANK_LINE = /\n\s*\n/;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function seedEditorHtml(source: string): string {
  if (source.trim() === '') return '';
  if (STORED_RICH_HTML_LEADING.test(source)) return source;
  return source
    .split(BLANK_LINE)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
