import type { AdminUserActionType } from '@duing/types';

/** PHONE_VIEW 는 서버가 조치 이력에서 제외해 내려주지만, 라벨은 완전성을 위해 함께 둔다. */
export const ADMIN_USER_ACTION_LABEL: Record<AdminUserActionType, string> = {
  ACCOUNT_SUSPENDED: '계정 정지',
  ACCOUNT_UNSUSPENDED: '계정 정지 해제',
  FORCE_LOGOUT: '강제 로그아웃',
  ADMIN_NOTE_UPDATED: '관리자 메모 수정',
  PHONE_VIEW: '원본 번호 열람',
};
