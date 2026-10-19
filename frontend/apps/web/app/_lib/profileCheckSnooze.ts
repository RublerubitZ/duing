// 학기 정보 확인 팝업의 숨김(스펙 §6.2·D5).
// - "나중에 확인하기" 버튼: 이 기기에 24시간 숨긴다(localStorage) + 이 문서 동안 숨긴다.
// - 스크림·스와이프·Esc·뒤로가기 닫힘: 이 문서 동안만 숨긴다 — iOS 엣지 스와이프 백이 시트 닫기로 흡수돼
//   24시간 숨는 오조작을 막는다. 새로고침·로그인(하드 이동)·다음 방문엔 다시 뜬다.
// 저장소를 못 쓰는 환경(사파리 프라이빗 등)에서는 24시간 숨김만 빠진다(authBoot.ts 와 같은 try/catch).

export const PROFILE_CHECK_SNOOZE_KEY = 'duing:profile-check-snooze';
export const PROFILE_CHECK_SNOOZE_MS = 24 * 60 * 60 * 1000;

export type ProfileCheckTarget = {
  userId: number;
  semesterYear: number;
  semesterTerm: number;
};

type StoredSnooze = ProfileCheckTarget & { until: number };

// 키에 사용자·학기를 넣는다 — 다른 계정·다른 학기의 닫힘이 이 팝업을 숨기지 않게.
const hiddenInDocument = new Set<string>();

function toKey(target: ProfileCheckTarget): string {
  return `${target.userId}:${target.semesterYear}-${target.semesterTerm}`;
}

function isStoredSnooze(value: unknown): value is StoredSnooze {
  if (typeof value !== 'object' || value === null) return false;
  return (['userId', 'semesterYear', 'semesterTerm', 'until'] as const).every(
    (field) => typeof Reflect.get(value, field) === 'number',
  );
}

export function dismissProfileCheckForDocument(target: ProfileCheckTarget): void {
  hiddenInDocument.add(toKey(target));
}

export function snoozeProfileCheck(target: ProfileCheckTarget, now: number): void {
  // 저장이 안 되는 환경에서도 같은 문서 안 이동(/ ↔ /me)마다 다시 뜨지 않게 문서 숨김을 먼저 건다.
  dismissProfileCheckForDocument(target);
  const stored: StoredSnooze = { ...target, until: now + PROFILE_CHECK_SNOOZE_MS };
  try {
    window.localStorage.setItem(PROFILE_CHECK_SNOOZE_KEY, JSON.stringify(stored));
  } catch {
    // 저장소 접근 거부 — 이 문서 동안만 숨긴다.
  }
}

export function isProfileCheckHidden(target: ProfileCheckTarget, now: number): boolean {
  if (hiddenInDocument.has(toKey(target))) return true;
  try {
    const raw = window.localStorage.getItem(PROFILE_CHECK_SNOOZE_KEY);
    if (raw === null) return false;
    const stored: unknown = JSON.parse(raw);
    return (
      isStoredSnooze(stored) &&
      stored.userId === target.userId &&
      stored.semesterYear === target.semesterYear &&
      stored.semesterTerm === target.semesterTerm &&
      stored.until > now
    );
  } catch {
    // 손상된 값·저장소 접근 거부는 "숨김 없음" — 팝업을 영구히 막지 않는다.
    return false;
  }
}

export function clearProfileCheckSnooze(): void {
  try {
    window.localStorage.removeItem(PROFILE_CHECK_SNOOZE_KEY);
  } catch {
    // 저장소 접근 거부 — 지울 것이 없다.
  }
}
