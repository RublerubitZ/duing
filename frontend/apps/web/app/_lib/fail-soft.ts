/**
 * 공개 데이터 로더(home-data·public-activities)의 백엔드 실패 정책 판별.
 *
 * 홈(/)은 ISR(revalidate 300s)이라 실패를 swallow 하면 위험하다 — 백그라운드 재생성 중
 * 백엔드가 순단(배포 재시작 등)이면 로더가 빈 배열/폴백을 돌려주고 재생성이 "성공"으로
 * 처리돼, **빈 홈이 300초 동안 전역 캐시**된다. 반대로 rethrow 하면 Next 는 재생성 렌더를
 * 실패로 보고 직전 정상 캐시본을 계속 서빙한다(stale 유지) — 사용자에겐 5분 지난 홈이
 * 보일 뿐이고, 백엔드가 돌아오면 다음 재생성이 자연히 최신화한다.
 *
 * 단, 아래 두 국면은 기존 fail-soft 를 유지한다.
 * - 빌드(`NEXT_PHASE=phase-production-build`): 빌드 중 백엔드 순단으로 배포가 깨지면 안 된다.
 *   빈 홈이 프리렌더돼도 첫 revalidate 에서 자가 치유된다(BE 없는 CI 빌드도 통과).
 * - development: 백엔드 없이 프론트만 띄우는 로컬 DX 를 보존한다.
 */
export function shouldRethrowBackendFailure(): boolean {
  return (
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  );
}
