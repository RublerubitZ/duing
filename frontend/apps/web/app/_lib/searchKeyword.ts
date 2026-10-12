/**
 * 공개 검색어 최대 길이 — 백엔드 SearchKeywordRules.MAX_LENGTH 와 같은 값(넘으면 서버가 400).
 * 입력 maxLength·URL 파싱·제출 핸들러가 같이 쓴다. 한글 IME 조합 중에는 maxLength 가 브라우저마다 다르게 동작해
 * 넘친 채 제출될 수 있으므로 제출·파싱에서도 자른다.
 */
export const SEARCH_KEYWORD_MAX_LENGTH = 100;
