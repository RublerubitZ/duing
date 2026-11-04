/** 주소 쿼리 값이 허용 목록에 있으면 그 값, 없거나 모르는 값이면 undefined(기본값은 호출부가 `??` 로 정한다). */
export const pickSearchParam = <T extends string>(raw: string | null, allowed: readonly T[]): T | undefined =>
  allowed.find((value) => value === raw);
