import { LAST_CLUB_STORAGE_KEY } from '@/app/manage/_lib/lastClubStorage';
import { RECRUITMENT_DRAFT_KEY_PREFIX } from '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentDraft';

/**
 * 명시적 로그아웃에서 운영진의 로컬 흔적을 지운다 — 마지막 본 동아리, 작성 중이던 모집 임시저장.
 *
 * <p>학생 PII 는 없지만 공용 PC 에서 다음 사용자에게 이전 운영진의 동아리와 모집 본문이 그대로 보인다.
 *
 * <p>세션 만료 경로에서는 부르지 않는다 — 같은 사람이 다시 로그인해 초안을 이어 쓰는 경우가 많다.
 * 호출부는 본인 로그아웃 3곳과 전체 기기 로그아웃 1곳뿐이다.
 */
export function clearOperatorLocalState(): void {
  if (typeof window === 'undefined') return;
  try {
    const storage = window.localStorage;
    storage.removeItem(LAST_CLUB_STORAGE_KEY);
    // 뒤에서부터 지운다 — removeItem 이 인덱스를 당기므로 정방향이면 항목을 건너뛴다.
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const storedKey = storage.key(index);
      if (storedKey?.startsWith(RECRUITMENT_DRAFT_KEY_PREFIX)) storage.removeItem(storedKey);
    }
  } catch {
    // 저장소 차단·손상은 정리 실패로만 남긴다(legacy-auth-cleanup 과 같은 정책).
  }
}
