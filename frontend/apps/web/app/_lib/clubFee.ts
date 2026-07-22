import type { FeeCycle } from '@duing/types';

export const FEE_CYCLE_LABELS: Record<Exclude<FeeCycle, 'NONE'>, string> = {
  ONE_TIME: '1회 납부',
  SEMESTER: '학기당',
  YEARLY: '연간',
  MONTHLY: '월간',
};

/** NONE(미입력/회비 없음 구분 불가)은 null — 호출부는 항목을 숨긴다 (§8). */
export function formatClubFee(feeCycle: FeeCycle, amount: number | null): string | null {
  if (feeCycle === 'NONE' || amount === null) return null;
  return `${FEE_CYCLE_LABELS[feeCycle]} ${amount.toLocaleString('ko-KR')}원`;
}
