import { ApiError } from '@duing/api';

/**
 * 마감(raw CLOSED) 모집 읽기 전용 안내 — 상태 변경 바·평가 카드가 공유한다 (스펙 §6).
 */
export const CLOSED_READ_ONLY_NOTICE = '마감된 모집은 상태를 변경할 수 없습니다';

/**
 * BE 가 마감 모집 쓰기를 거절할 때의 안내 (스펙 §4 — 409 + code `RECRUITMENT_CLOSED`).
 * 화면 게이트는 fail-open 이라, 화면이 열린 뒤 모집이 마감된 창(lazy-close)에서는 이 응답이 최종 방어선이다.
 */
export const CLOSED_RECRUITMENT_FAILURE_MESSAGE = '마감된 모집은 조회만 가능합니다';

/**
 * 실패한 쓰기 요청을 사용자 대면 문구로 바꾼다. 마감 원인은 코드로 식별해 한 문구로 모으고,
 * 그 외에는 서버가 내려준 사유를 그대로 쓴다.
 */
export function toWriteFailureMessage(error: unknown, fallbackMessage: string): string {
  if (!(error instanceof ApiError)) return fallbackMessage;
  return error.code === 'RECRUITMENT_CLOSED'
    ? CLOSED_RECRUITMENT_FAILURE_MESSAGE
    : error.message;
}
