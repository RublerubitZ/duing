import type { ApplicationMode, StatsSummary } from '@duing/types';

/**
 * 마감 확인 다이얼로그 안내 — 마감의 실제 결과를 모드별로 알린다. 자체 폼은 신규 지원과
 * 심사 진행(평가·면접)이 멎고, 외부 폼은 새 가입 링크 발급이 끊긴다.
 *
 * 미결 지원서가 있으면 건수와 함께 "마감 후에는 합격·불합격 확정만 가능"임을 알린다 —
 * 마감을 접수 중단으로만 오해한 채 면접을 남겨두는 사고를 막으면서도, 결과를 영영 못 낸다고
 * 겁주지 않기 위해서다(마감 후 최종 결과 확정은 허용된다).
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
      마감하면 신규 지원을 받을 수 없고, 평가·면접 진행도 멈춥니다. 되돌릴 수 없습니다.
      {undecidedCount !== null && undecidedCount > 0 && (
        <>
          {' '}
          아직 결과가 정해지지 않은 지원서{' '}
          <strong className="font-semibold text-coral">{undecidedCount}건</strong>은 마감 후에도
          합격·불합격 확정만 할 수 있습니다.
        </>
      )}
    </>
  );
}
