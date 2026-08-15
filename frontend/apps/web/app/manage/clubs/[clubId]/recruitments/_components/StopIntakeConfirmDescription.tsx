import type { ApplicationMode } from '@duing/types';

/**
 * 접수 마감 확인 안내 — 마감(CLOSED)과 달리 신규 접수만 멈추고 심사는 계속임을 알린다.
 * 외부 폼은 기존 가입 링크가 계속 유효하다는 확정 semantics(링크 사용 판정은 status 기준)를 명시한다.
 * 실수로 마감했을 때의 복구 경로(종료일을 미래로 수정 = 의도된 undo)도 함께 안내한다.
 * ConfirmDialog description(<p> 내부)에 렌더되므로 인라인 요소만 쓴다.
 */
export function StopIntakeConfirmDescription({
  applicationMode,
}: {
  applicationMode: ApplicationMode;
}) {
  if (applicationMode === 'EXTERNAL') {
    return (
      <>
        신규 가입 링크 발급은 중단되고, 이미 발급된 가입 링크는 계속 유효합니다. 접수된 가입
        요청 처리는 계속할 수 있습니다. 접수를 다시 열려면 모집글 편집에서 종료일을 미래
        날짜로 수정하면 됩니다.
      </>
    );
  }

  return (
    <>
      신규 지원 접수가 즉시 마감됩니다. 이미 접수된 지원자의 심사와 면접은 계속 진행할 수
      있습니다. 접수를 다시 열려면 모집글 편집에서 종료일을 미래 날짜로 수정하면 됩니다.
    </>
  );
}
