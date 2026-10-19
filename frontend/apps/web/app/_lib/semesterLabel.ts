/** 학기 표기 — 서버는 (학년도, 학기) 정수만 준다. 예: (2027, 1) → "2027학년도 1학기". 총동연 콘솔과 사용자 팝업이 같이 쓴다. */
export function formatSemesterLabel(year: number, term: number): string {
  return `${year}학년도 ${term}학기`;
}
