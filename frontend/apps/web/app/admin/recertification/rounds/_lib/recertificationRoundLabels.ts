import type { RoundStatus } from '@duing/types';

export const ROUND_STATUS_LABEL: Record<RoundStatus, string> = {
  OPEN: '진행 중',
  CLOSED: '종료',
};

export const ROUND_STATUS_BADGE_CLASS: Record<RoundStatus, string> = {
  OPEN: 'bg-emerald-100 text-emerald-800',
  CLOSED: 'bg-zinc-100 text-zinc-600',
};
