/**
 * 문의 상세 라우트의 [inquiryId] 세그먼트를 검증한다.
 * 양의 안전 정수만 유효한 id 로 취급하고, 그 외(NaN·음수·소수·overflow)는 null 을 반환해
 * 호출 측이 API 호출 없이(디테일 훅에 null 전달) 즉시 "문의를 찾을 수 없습니다" 폴백을 띄우게 한다.
 * 학생(/me/inquiries)·admin(/admin/inquiries) 상세 페이지 공용.
 */
export function parseInquiryId(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
