import type { ApplicationMode, StatsSummary } from '@duing/types';

/**
 * 마감 확인 다이얼로그 안내 — 마감의 실제 결과를 모드별로 알린다. 자체 폼은 지원현황이
 * 조회 전용으로 굳고(#875), 외부 폼은 새 가입 링크 발급이 끊긴다. 미결 지원서가 있으면
 * 건수를 함께 보여 "접수만 마감"으로 오해한 채 심사를 잠그는 사고를 막는다.
 * ConfirmDialog description(<p> 내부)에 렌더되므로 인라인 요소만 쓴다.
 */
export function CloseRecruitmentConfirmDescription({
  applicationMode,
  statsSummary,
}: {
  applicationMode: ApplicationMode;
  /** 요약을 아직 못 받았으면(undefined) 수치 없이 일반 안내만 — 지어내지 않는다. */
  statsSummary: StatsSummary | undefined;
}) {
  if (applicationMode === 'EXTERNAL') {
    return (
      <>
        마감하면 새 가입 링크를 만들 수 없고, 이미 만든 링크만 가입 가능 기간까지 유효합니다.
        되돌릴 수 없습니다.
      </>
    );
  }

  const undecidedCount =
    statsSummary != null
      ? statsSummary.submitted + statsSummary.onHold + statsSummary.interviewPending
      : null;

  return (
    <>
      마감하면 신규 지원을 받을 수 없고, 지원현황은 조회 전용으로 전환됩니다. 되돌릴 수 없습니다.
      {undecidedCount !== null && undecidedCount > 0 && (
        <>
          {' '}
          아직 심사가 끝나지 않은 지원서{' '}
          <strong className="font-semibold text-coral">{undecidedCount}건</strong>이 있습니다 —
          마감하면 더 이상 처리할 수 없습니다.
        </>
      )}
    </>
  );
}
