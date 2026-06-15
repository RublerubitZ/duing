// 라운드 멤버 상태 뱃지 라벨·스타일 — RoundMemberTable·ConfirmRoundDialog 공용.
// 알 수 없는 상태값은 호출부에서 `?? fallback` 으로 원문 노출한다.

export const MEMBER_STATUS_LABEL: Record<string, string> = {
  INVITED: '초대됨',
  RESPONDED: '응답 완료',
  NO_AVAILABLE_SLOT: '가능없음',
  ASSIGNED: '배정됨',
  EXCLUDED: '제외됨',
};

export const MEMBER_STATUS_CLASS: Record<string, string> = {
  INVITED: 'bg-slate-100 text-slate-600',
  RESPONDED: 'bg-emerald-100 text-emerald-700',
  NO_AVAILABLE_SLOT: 'bg-orange-100 text-orange-700',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  EXCLUDED: 'bg-rose-100 text-rose-600',
};
