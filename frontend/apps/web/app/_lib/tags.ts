// 태그 입력란 공통 규칙 — 동아리 정보(TagsInput)·공지 작성(NoticeTagInput)이 같은 판정을 쓴다.
// 정리는 서버 TagRules.normalize 와 같은 순서라 칩에 보이는 값이 저장되는 값과 같다: 한글을 NFC 로 합치고, 제어문자(Cc)·
// 보이지 않는 서식 문자(Cf)·공백처럼 보이는 한글 채움 문자와 점자 공백을 지우고(이모지 조합용 ZWJ·ZWNJ 는 남긴다),
// 줄바꿈 없는 공백을 일반 공백으로 바꿔 앞뒤를 자른 뒤 앞의 '#' 를 뗀다(화면이 태그 앞에 '#' 를 붙여 보여 준다).
const INVISIBLE_CHARACTERS = /(?![\u200C\u200D])[\p{Cc}\p{Cf}]/gu;
const BLANK_LOOKING_LETTERS = /[\u115F\u1160\u3164\uFFA0\u2800]/g;
const NO_BREAK_SPACES = /[\u00A0\u2007\u202F]/g;
const LEADING_HASHES = /^#+/;

export type TagLimits = { maxTags: number; maxTagLength: number };

export function normalizeTag(token: string): string {
  return token
    .normalize('NFC')
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(BLANK_LOOKING_LETTERS, '')
    .replace(NO_BREAK_SPACES, ' ')
    .trim()
    .replace(LEADING_HASHES, '')
    .trim();
}

// 화면 표시 — 태그 앞에 '#' 를 하나만 붙인다. 예전에 '#' 를 붙여 저장한 태그도 '##' 로 보이지 않게 앞의 '#' 를 떼고 붙인다.
export function tagLabel(tag: string): string {
  return `#${tag.replace(LEADING_HASHES, '')}`;
}

// 넣을 수 있는 태그면 붙인 목록을, 아니면 받은 목록을 그대로 돌려준다(빈 값·길이·중복·개수 한도).
export function appendTag(tags: string[], token: string, { maxTags, maxTagLength }: TagLimits): string[] {
  const tag = normalizeTag(token);
  if (!tag || tag.length > maxTagLength || tags.includes(tag) || tags.length >= maxTags) return tags;
  return [...tags, tag];
}
