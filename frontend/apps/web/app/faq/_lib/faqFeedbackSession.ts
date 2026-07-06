// FAQ 피드백 식별·복원 유틸 — 서버 조회 없이 이 기기(브라우저)의 localStorage 만으로 동작한다.
// 세션 키: 비로그인 사용자를 식별하는 UUID(백엔드가 로그인 시엔 userId 를 우선하고 이 값은 무시한다).
// 선택 기록: 이 기기에서 이미 제출한 helpful 값을 caching 해 재방문 시 버튼 하이라이트를 복원한다
// (다른 기기·브라우저와 어긋나도 UI 표시 용도일 뿐이라 문제 없다 — YAGNI).

const SESSION_STORAGE_KEY = 'duing:faq-feedback-session';
const CHOICES_STORAGE_KEY = 'duing:faq-feedback-choices';

type FaqFeedbackChoices = Record<string, boolean>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 비로그인 사용자를 식별할 세션 키. 없으면 생성해 저장한다. SSR(서버)에서는 null. */
export function getFaqFeedbackSessionKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const generated = crypto.randomUUID();
    window.localStorage.setItem(SESSION_STORAGE_KEY, generated);
    return generated;
  } catch {
    // localStorage 차단 환경(시크릿 모드 정책 등) — 세션 키를 유지할 수 없어 null 로 폴백한다.
    // 호출부는 undefined 로 보내 로그인 사용자 취급(비로그인이면 백엔드가 400)과 구분한다.
    return null;
  }
}

function readChoices(): FaqFeedbackChoices {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CHOICES_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return {};
    const choices: FaqFeedbackChoices = {};
    for (const [faqId, helpful] of Object.entries(parsed)) {
      if (typeof helpful === 'boolean') choices[faqId] = helpful;
    }
    return choices;
  } catch {
    // 파싱 실패(손상된 값 등) — 안전하게 빈 기록으로 취급한다.
    return {};
  }
}

/** 이 기기에서 해당 FAQ 에 이미 제출한 선택. 기록이 없으면 null. */
export function getMyFaqFeedback(faqId: number): boolean | null {
  const choices = readChoices();
  const helpful = choices[String(faqId)];
  return typeof helpful === 'boolean' ? helpful : null;
}

/** 제출 성공 후 이 기기의 선택을 기록한다(재제출 시 값을 덮어써 마음 바꾸기를 허용). */
export function setMyFaqFeedback(faqId: number, helpful: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    const choices = readChoices();
    choices[String(faqId)] = helpful;
    window.localStorage.setItem(CHOICES_STORAGE_KEY, JSON.stringify(choices));
  } catch {
    // localStorage 차단 환경 — 이번 방문 중 하이라이트는 유지되나(컴포넌트 로컬 상태) 다음 방문엔
    // 복원되지 않는다. 제출 자체(서버 반영)는 이미 끝난 뒤라 기능 손실은 아니다.
  }
}
