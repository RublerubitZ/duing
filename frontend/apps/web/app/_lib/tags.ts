// 태그 입력란 공통 규칙 — 동아리 정보(TagsInput)·공지 작성(NoticeTagInput)이 같은 판정을 쓴다.
// 서버 TagRules.normalize 처럼 제어문자를 지우고 앞뒤 공백을 잘라, 칩에 보이는 값이 저장되는 값과 같다.
const CONTROL_CHARACTERS = /\p{Cc}/gu;

export type TagLimits = { maxTags: number; maxTagLength: number };

export function normalizeTag(token: string): string {
  return token.replace(CONTROL_CHARACTERS, '').trim();
}

// 넣을 수 있는 태그면 붙인 목록을, 아니면 받은 목록을 그대로 돌려준다(빈 값·길이·중복·개수 한도).
export function appendTag(tags: string[], token: string, { maxTags, maxTagLength }: TagLimits): string[] {
  const tag = normalizeTag(token);
  if (!tag || tag.length > maxTagLength || tags.includes(tag) || tags.length >= maxTags) return tags;
  return [...tags, tag];
}
