const META_DESCRIPTION_MAX_LENGTH = 150;

/** 페이지 메타 설명 — 공백을 한 칸으로 접고 150자(코드 포인트)로 자른다. 비면 fallback. */
export function toMetaDescription(text: string, fallback: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  // 코드 포인트 단위로 자른다 — UTF-16 단위로 자르면 이모지(서로게이트 쌍)가 반으로 잘려 U+FFFD 로 깨진다.
  const characters = Array.from(normalized);
  return characters.length > META_DESCRIPTION_MAX_LENGTH
    ? `${characters.slice(0, META_DESCRIPTION_MAX_LENGTH - 1).join('')}…`
    : normalized;
}
