// 소개 텍스트 판정·변환 — DOM 없이 동작해 서버 컴포넌트에서도 import 할 수 있다.
// 정화·블록 분할(splitDescription)은 브라우저 전용이라 따로 둔다.
import { htmlToPlainText } from '@/app/_lib/htmlToPlainText';

// 콘솔이 Tiptap HTML 로 저장하기 시작하면 소개글은 '<' 로 시작한다(레거시는 전부 plain text).
const HTML_LEADING = /^\s*</;

/** HTML(Tiptap) 소개인지 — '<' 로 시작하면 HTML 로 본다. `<신입부원 모집>` 같은 레거시 평문도 걸리지만 아래가 평문으로 폴백한다. */
export function isHtmlDescription(description: string): boolean {
  return HTML_LEADING.test(description);
}

// Tiptap HTML 의 블록 마크업 — '<' 로 시작해도 이게 없으면 레거시 평문(`<AI 스터디> …`)으로 본다.
// hr·img 는 <p> 없이 단독 블록으로 나온다 — 빠지면 `<hr>` 만 있는 소개가 평문으로 판정돼 태그 글자가 노출된다.
const BLOCK_MARKUP = /<\/?(?:p|h[1-6]|ul|ol|li|blockquote|pre|div|br|hr|img)\b/i;

/**
 * 서버 렌더·메타 설명용 소개 텍스트 — DOM 없이 만든다. Tiptap HTML 은 태그를 걷어낸 텍스트로, 블록 마크업이 없는
 * 레거시 평문은 원문 그대로 둔다.
 *
 * 하이드레이션 뒤 splitDescription 은 정화 뒤 허용 요소가 하나도 없을 때 원문 평문으로 폴백하며, 인라인 요소
 * (strong·em·a)도 요소로 센다. 여기의 블록 마크업 판정은 Tiptap 출력(항상 <p> 등 블록으로 감싼다)과 흔한 레거시
 * 평문을 기준으로 한 근사다 — 인라인 요소만 있는 HTML 등에서는 하이드레이션 전과 뒤의 텍스트가 다를 수 있다.
 * 하이드레이션 첫 프레임은 서버와 같은 분기를 타므로 불일치 오류는 나지 않는다.
 */
export function descriptionToPlainText(description: string): string {
  return isHtmlDescription(description) && BLOCK_MARKUP.test(description)
    ? htmlToPlainText(description)
    : description;
}
