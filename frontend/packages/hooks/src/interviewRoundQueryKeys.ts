// 면접 라운드(재설계) 쿼리키 — 신규 interviewRounds 그룹 전용.
// 구 interviewQueryKeys(interview 그룹)와 키 프리픽스가 달라 충돌 없이 공존한다.
// invalidation 매트릭스 (스펙 §10.1):
//   생성(create)        → list + candidates
//   수정(update)        → detail + list
//   취소(cancel)        → detail + list + candidates  (상태 전이 + 멤버 대기열 복귀 — 재큐잉)
//   슬롯 생성/삭제      → detail
//   발송(requestAvail)  → detail + list
export const interviewRoundKeys = {
  all: ['interview-rounds'] as const,
  list: (recruitmentId: number) =>
    [...interviewRoundKeys.all, 'list', recruitmentId] as const,
  detail: (roundId: number) =>
    [...interviewRoundKeys.all, 'detail', roundId] as const,
  // includeUndecided 를 넘기면 토글별 캐시 엔트리, 생략하면 그 엔트리들을 모두 덮는 무효화 prefix 다.
  // 생략했을 때의 키 모양은 인자 1개짜리 시절과 완전히 같아야 한다 — 한 칸이라도 달라지면
  // 라운드 생성/취소/제외/확정의 prefix 무효화가 후보 캐시에 닿지 않는다.
  candidates: (recruitmentId: number, includeUndecided?: boolean) =>
    includeUndecided === undefined
      ? ([...interviewRoundKeys.all, 'candidates', recruitmentId] as const)
      : ([...interviewRoundKeys.all, 'candidates', recruitmentId, includeUndecided] as const),
  // 지원자 본인의 면접 진행 단계 캐시 — applicationId 기준 (스펙 §10.1)
  myInterview: (applicationId: number) =>
    [...interviewRoundKeys.all, 'my-interview', applicationId] as const,
};
