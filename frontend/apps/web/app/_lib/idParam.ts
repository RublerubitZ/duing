// 라우트 경로의 숫자 id 세그먼트 판정 — 양의 안전 정수만 받는다(`0`·앞자리 0·음수·소수·지수·16진수·공백·안전 정수 초과는 거부).
// 미들웨어가 같은 기준으로 형식이 틀린 주소를 먼저 실제 404 로 끊는다(loading 경계 안의 notFound 는 200 소프트 404).
// 페이지는 이 함수로 한 번 더 판정하는 방어선이다 — 미들웨어는 앱 코드를 import 할 수 없어(파일 머리 규칙) 같은 정규식을
// 따로 두고, 둘의 판정이 어긋나지 않는지는 test/auth/middleware-auth-hint.test.ts 의 대조 테스트가 잡는다.
const POSITIVE_ID = /^[1-9]\d*$/;

export function parsePositiveIdParam(raw: string): number | null {
  if (!POSITIVE_ID.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}
