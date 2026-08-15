import { todayKstDateString } from '@duing/hooks';
import type { RecruitmentSummary } from '@duing/types';

type StopIntakeGate = { visible: false } | { visible: true; enabled: boolean };

/**
 * 접수 마감(#888) 액션 게이트 — 상시모집(raw status OPEN + endDate 없음)에만 보인다.
 * 접수 마감은 종료일을 어제로 확정하므로 기간 불변식(종료일 >= 시작일)을 지키려면
 * 모집 시작일 다음 날(KST)부터만 활성화된다. 브라우저 로컬 날짜는 자정 부근에 서버와
 * 하루 어긋나므로 반드시 KST 유틸을 쓴다 — BE 도메인 가드가 최종 방어선이다.
 */
export function stopIntakeGate(
  recruitment: Pick<RecruitmentSummary, 'status' | 'startDate' | 'endDate'>,
  now: Date,
): StopIntakeGate {
  if (recruitment.status !== 'OPEN' || recruitment.endDate !== null) {
    return { visible: false };
  }
  return { visible: true, enabled: recruitment.startDate < todayKstDateString(now) };
}
