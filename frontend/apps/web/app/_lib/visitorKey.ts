// 익명 방문자 식별 유틸 — 홈 "관심도가 높은 동아리" 집계에서 "같은 사람"을 판정하는 키다.
// 서버 조회 없이 이 브라우저의 localStorage 만으로 동작하며, 로그인 여부와 무관하게 같은 키를 쓴다
// (서버는 이 값을 원문 그대로 저장하지 않고 해시로 바꿔 8일만 보관한다).
//
// FAQ 피드백의 세션 키(app/faq/_lib/faqFeedbackSession.ts)와 같은 구조지만 저장 키를 분리한다 —
// 한쪽을 지우거나 정책을 바꿀 때 다른 쪽 집계가 함께 흔들리지 않게 하기 위해서다.

const VISITOR_STORAGE_KEY = 'duing:visitor';

// localStorage 차단 환경(시크릿 모드 정책 등)에서의 in-memory 폴백 — 모듈 스코프에 UUID 를
// 최초 1회만 생성해 재사용한다. 탭이 떠 있는 동안은 동일 키가 유지되어 하루 dedup 이 계속
// 동작하지만, 탭을 닫으면 소멸해 다음 방문엔 새 사람으로 취급된다(수용 가능한 저하 — YAGNI).
let inMemoryVisitorKeyFallback: string | null = null;

/**
 * 이 브라우저의 익명 방문자 키. localStorage 에 없으면 생성해 저장한다.
 * localStorage 접근이 차단되면 in-memory 폴백(위 참고)으로 대체한다. SSR(서버)에서는 null.
 */
export function getVisitorKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
    if (existing) return existing;
    const generated = createVisitorKey();
    if (generated) window.localStorage.setItem(VISITOR_STORAGE_KEY, generated);
    return generated;
  } catch {
    // localStorage 차단 — 이번 페이지 세션 동안만 유지되는 in-memory 키로 폴백한다.
    if (!inMemoryVisitorKeyFallback) {
      inMemoryVisitorKeyFallback = createVisitorKey();
    }
    return inMemoryVisitorKeyFallback;
  }
}

/**
 * 새 방문자 키 생성. 실패하면 null 을 돌려주고 호출부는 집계를 건너뛴다.
 * <p>{@code crypto.randomUUID} 는 보안 컨텍스트(HTTPS·localhost)에서만 제공되므로 평문 HTTP 로
 * 연 화면에서는 없을 수 있다. 관심도는 부수 신호라, 키를 못 만든다고 상세 페이지가 깨져서는 안 된다.
 */
function createVisitorKey(): string | null {
  try {
    return crypto.randomUUID();
  } catch {
    return null;
  }
}
