// 면접 라운드(재설계) 쿼리키 — 신규 interviewRounds 그룹 전용.
// 구 interviewQueryKeys(interview 그룹)와 키 프리픽스가 달라 충돌 없이 공존한다.
// invalidation 매트릭스 (스펙 §10.1):
//   생성(create)        → list + candidates
//   수정(update)        → detail + list
//   취소(cancel)        → list + candidates  (멤버 대기열 복귀 — 재큐잉)
//   슬롯 생성/삭제      → detail
//   발송(requestAvail)  → detail + list
export const interviewRoundKeys = {
  all: ['interview-rounds'] as const,
  list: (recruitmentId: number) =>
    [...interviewRoundKeys.all, 'list', recruitmentId] as const,
  detail: (roundId: number) =>
    [...interviewRoundKeys.all, 'detail', roundId] as const,
  candidates: (recruitmentId: number) =>
    [...interviewRoundKeys.all, 'candidates', recruitmentId] as const,
};
