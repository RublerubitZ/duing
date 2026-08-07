import type { ClubStatus } from '@duing/types';

export const STATUS_LABEL: Record<ClubStatus, string> = {
  PENDING_APPROVAL: '승인 대기',
  ACTIVE: '운영 중',
  INACTIVE: '운영 중단',
  REJECTED: '거절',
};

export const STATUS_BADGE_CLASS: Record<ClubStatus, string> = {
  PENDING_APPROVAL: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  INACTIVE: 'bg-slate-200 text-slate-700',
  REJECTED: 'bg-rose-100 text-rose-800',
};

export type StatusFilter = 'ALL' | ClubStatus;

export const STATUS_FILTER_ORDER: ReadonlyArray<StatusFilter> = [
  'ALL',
  'PENDING_APPROVAL',
  'ACTIVE',
  'INACTIVE',
  'REJECTED',
];

export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  ALL: '전체',
  PENDING_APPROVAL: '승인 대기',
  ACTIVE: '운영 중',
  INACTIVE: '운영 중단',
  REJECTED: '거절',
};

/**
 * 각 상태에서 의미적으로 자연스러운 전이 액션. 백엔드는 임의 전이를 허용하지만
 * ADMIN 콘솔 UI 가 노출하는 액션을 도메인 흐름에 맞춰 제한해 사용자 혼선을 줄인다.
 */
export type StatusAction = {
  label: string;
  nextStatus: ClubStatus;
  /** AlertDialog 의 confirm 버튼 색조 — 'primary' (긍정) / 'danger' (부정/되돌릴 수 없는 느낌) */
  tone: 'primary' | 'danger';
  /** dialog 본문에 들어갈 설명 */
  description: string;
};

export const STATUS_ACTIONS: Record<ClubStatus, ReadonlyArray<StatusAction>> = {
  PENDING_APPROVAL: [
    {
      label: '승인',
      nextStatus: 'ACTIVE',
      tone: 'primary',
      description: '승인하면 학생 탐색 페이지에 즉시 노출됩니다.',
    },
    {
      label: '거절',
      nextStatus: 'REJECTED',
      tone: 'danger',
      description: '거절 상태로 변경합니다. 동아리장은 정보를 보완해 재심사를 요청할 수 있습니다.',
    },
  ],
  ACTIVE: [
    {
      label: '운영 중단',
      nextStatus: 'INACTIVE',
      tone: 'danger',
      description:
        '학생 탐색 페이지에서 동아리가 즉시 숨겨지고, 진행 중인 모집은 모두 마감됩니다. 마감은 되돌릴 수 없습니다. 기존 멤버십·지원 이력은 그대로 유지됩니다.',
    },
  ],
  INACTIVE: [
    {
      label: '재활성',
      nextStatus: 'ACTIVE',
      tone: 'primary',
      description:
        '운영 중단을 해제하고 학생 탐색 페이지에 다시 노출시킵니다. 중단 시 마감된 모집은 복구되지 않으므로 새로 등록해야 합니다.',
    },
  ],
  REJECTED: [
    {
      label: '재심사 대기로 전환',
      nextStatus: 'PENDING_APPROVAL',
      tone: 'primary',
      description: '승인 대기 상태로 되돌립니다. 동아리장이 신청 내용을 보완한 뒤 사용합니다.',
    },
  ],
};
