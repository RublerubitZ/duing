// 태그 입력란 공통 규칙 — 동아리 정보(TagsInput)·공지 작성(NoticeTagInput)이 같은 판정을 쓴다.
// 정리는 서버 TagRules.normalize 와 같은 순서라 칩에 보이는 값이 저장되는 값과 같다: 제어문자(Cc)·보이지 않는 서식 문자(Cf)·
// 공백처럼 보이는 한글 채움 문자와 점자 공백을 지우고(이모지 조합용 ZWJ·ZWNJ 는 남긴다) 한글을 NFC 로 합친 뒤, 줄바꿈 없는
// 공백을 일반 공백으로 바꿔 앞뒤를 자르고 앞의 '#' 를 뗀다(화면이 태그 앞에 '#' 를 붙여 보여 준다). 보이는 글자가 없으면 버린다.
const INVISIBLE_CHARACTERS = /(?![\u200C\u200D])[\p{Cc}\p{Cf}]/gu;
const BLANK_LOOKING_LETTERS = /[\u115F\u1160\u3164\uFFA0\u2800]/g;
const NO_BREAK_SPACES = /[\u00A0\u2007\u202F]/g;
// 키캡 이모지('#' + 변형 선택자(없거나 U+FE0E·U+FE0F) + U+20E3)의 '#' 는 남기고, 떼는 '#' 뒤의 변형 선택자는 함께 뗀다.
const LEADING_HASHES = /^(?:#(?![\uFE0E\uFE0F]?\u20E3)[\uFE0E\uFE0F]?)+/;
// 결합 문자·서식 문자·공백만 남은 태그(홀로 남은 ZWJ·변형 선택자 등)는 빈 칩으로 보인다. 범주를 모르는 글자(미지정)는
// 보이는 글자로 친다 — 브라우저와 서버의 유니코드 버전이 달라도 판정이 같다.
const VISIBLE_CHARACTER = /[^\p{M}\p{Cf}\p{Z}]/u;

export type TagLimits = { maxTags: number; maxTagLength: number };

export function normalizeTag(token: string): string {
  let tag = token
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(BLANK_LOOKING_LETTERS, '')
    .normalize('NFC')
    .replace(NO_BREAK_SPACES, ' ')
    .trim();
  // '# #축구' 처럼 '#' 와 공백이 섞여 있어도 끝까지 뗀다.
  while (LEADING_HASHES.test(tag)) tag = tag.replace(LEADING_HASHES, '').trim();
  return VISIBLE_CHARACTER.test(tag) ? tag : '';
}

// 화면 표시 — 저장 규칙으로 정리한 뒤 '#' 를 하나 붙인다. 예전에 '#' 를 붙여 저장한 태그도 '##' 로 보이지 않는다.
export function tagLabel(tag: string): string {
  return `#${normalizeTag(tag)}`;
}

// 넣을 수 있는 태그면 붙인 목록을, 아니면 받은 목록을 그대로 돌려준다(빈 값·길이·개수 한도·중복).
export function appendTag(tags: string[], token: string, { maxTags, maxTagLength }: TagLimits): string[] {
  const tag = normalizeTag(token);
  if (!tag || tag.length > maxTagLength || tags.length >= maxTags) return tags;
  // 예전에 '#' 를 붙여 저장한 태그와도 중복을 판정하도록 있는 태그도 같은 규칙으로 정리해 비교한다.
  if (tags.some((existing) => normalizeTag(existing) === tag)) return tags;
  return [...tags, tag];
}
