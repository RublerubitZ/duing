import { formatDateTimeKst } from '@duing/hooks/datetime';
import type { AdminClubJoinCode, AdminJoinCodeStatus } from '@duing/types';

/**
 * 상태는 서버가 판정해 내려준 값을 그대로 옮긴다 — 화면에서 만료를 다시 계산하지 않는다.
 * 어휘는 운영진 콘솔의 가입 링크 상태(`JOIN_LINK_STATUS_LABEL`)와 맞춘다. 여기에만 있는 폐기(REVOKED)
 * 때문에 키 집합이 달라 Record 는 따로 두되, 겹치는 상태는 같은 문구로 부른다.
 */
export const JOIN_CODE_STATUS_LABEL: Record<AdminJoinCodeStatus, string> = {
  ACTIVE: '활성',
  EXPIRED: '만료',
  EXHAUSTED: '소진',
  REVOKED: '폐기',
};

/** 동아리 상태 뱃지(`STATUS_BADGE_CLASS`)와 같은 색 어휘 — 쓸 수 있음은 초록, 끊긴 것은 붉은색이다. */
export const JOIN_CODE_STATUS_BADGE_CLASS: Record<AdminJoinCodeStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  EXPIRED: 'bg-slate-200 text-slate-700',
  EXHAUSTED: 'bg-amber-100 text-amber-800',
  REVOKED: 'bg-rose-100 text-rose-800',
};

/**
 * 링크 종류 한 줄 표기. 모집 링크는 어느 모집 것인지가 곧 신원이라 제목을 함께 적고,
 * 모집이 지워졌으면 자리를 비우지 않고 그 사실을 적는다(링크 이력은 모집보다 오래 남는다).
 */
export function joinCodeKindLabel(joinCode: AdminClubJoinCode): string {
  if (joinCode.linkType === 'CLUB_INVITE') return '부원 초대';
  return `모집 가입 · ${joinCode.recruitmentTitle ?? '삭제된 모집'}`;
}

/** 자동 승인은 초대 링크에만 있는 옵션이다 — 모집 링크에 "승인제"라고 적으면 고를 수 있었던 것처럼 읽힌다. */
export function joinCodeAutoApproveLabel(joinCode: AdminClubJoinCode): string {
  if (joinCode.linkType !== 'CLUB_INVITE') return '-';
  return joinCode.autoApprove ? '자동승인' : '승인제';
}

/** 시각 칸 공통 표기. 값이 없는 것(기한 미정·미폐기)은 지어내지 않고 빈 자리로 둔다. */
export function joinCodeDateTimeLabel(isoInstant: string | null): string {
  return isoInstant === null ? '-' : formatDateTimeKst(isoInstant);
}
