// 편집 진입 시 소개글을 리치 에디터에 시드하는 순수 변환 함수.
// 학생 렌더의 splitDescription 과 별개다 — 저건 출력 분할용, 이건 편집 시드용.
//
// 콘솔이 저장하는 소개는 Tiptap 표준 HTML(<p>…) 이라 '<' 로 시작한다. 레거시는 전부 plain text.
// plain 을 에디터에 그대로 넣으면 HTML 파싱 과정에서 개행이 공백으로 뭉개져 소실되므로,
// 빈 줄로 문단을 나눠 <p> 로 감싸고 문단 내 단일 개행은 <br> 로 보존한다.
// '<','>','&' 는 이스케이프해 문단 중간의 특수문자가 태그로 오인·삭제되는 데이터 손실을 막는다.

const HTML_LEADING = /^\s*</;
const BLANK_LINE = /\n\s*\n/;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function seedEditorHtml(source: string): string {
  if (source.trim() === '') return '';
  // ponytail: '<' 로 시작하는 레거시 plain(예: "<신입 모집>")은 HTML 로 오인해 통과 →
  // 에디터 sanitize 에서 소실될 수 있음. 학생 렌더(splitDescription)와 동일한 희소 케이스라 브리프 범위 밖.
  if (HTML_LEADING.test(source)) return source;
  return source
    .split(BLANK_LINE)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
