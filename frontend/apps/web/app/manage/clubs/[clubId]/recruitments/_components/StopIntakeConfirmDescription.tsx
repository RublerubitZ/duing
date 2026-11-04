import type { ApplicationMode } from '@duing/types';

import { AUTO_CLOSE_GRACE_DAYS } from '@/app/_lib/recruitmentDisplay';

/**
 * 접수 마감 확인 안내 — 마감(CLOSED)과 달리 신규 접수만 멈추고 심사는 계속임을 알린다.
 * 외부 폼은 새 링크 발급이 막히고(모집이 실제로 열려 있을 때만 발급), 이미 발급된 링크는 오늘부터 가입 가능 기간
 * 동안만 쓸 수 있음을 알린다 — 기간은 종료일 다음 날 0시부터 링크의 가입 기간 일수만큼이라(ClubJoinCode.getJoinExpiresAt,
 * #1268) 종료일이 어제로 확정되면 오늘 0시부터 세고, '모집 종료일까지'(0일)로 만든 링크는 바로 만료된다. 뒤이은
 * 수동·자동 마감은 이 기한을 바꾸지 않는다(마감 시각과 종료일 다음 날 0시 중 이른 쪽 기준). 다시 열면 기한이 사라져
 * 폐기·소진되지 않은 링크는 다시 쓸 수 있다.
 * 실수로 마감했을 때의 복구 경로(종료일을 미래로 수정 = 의도된 undo)도 함께 안내한다.
 * 그 경로는 자동 마감 전까지만 열려 있다 — 접수 마감은 종료일을 어제로 확정하므로 유예 일수({@link AUTO_CLOSE_GRACE_DAYS})는
 * 오늘을 포함해 센 일수이고, 그다음 날 00:40 에 자동 마감된다(자체 지원은 남은 심사·면접이 없을 때만). 마감된 모집은
 * 다시 열 수 없다.
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
        신규 가입 링크 발급은 중단되고, 이미 발급된 가입 링크는 오늘부터 가입 가능 기간 동안만
        유효합니다. &apos;모집 종료일까지&apos;로 만든 링크는 바로 만료됩니다. 접수된 가입 요청
        처리는 계속할 수 있습니다. 접수를 다시 열려면 오늘을 포함해 {AUTO_CLOSE_GRACE_DAYS}일 안에
        모집글 편집에서 종료일을 미래 날짜로 수정하면 됩니다. 이 {AUTO_CLOSE_GRACE_DAYS}일이 지나면
        모집이 자동으로 마감되어 다시 열 수 없습니다.
      </>
    );
  }

  return (
    <>
      신규 지원 접수가 즉시 마감됩니다. 이미 접수된 지원자의 심사와 면접은 계속 진행할 수 있습니다.
      접수를 다시 열려면 오늘을 포함해 {AUTO_CLOSE_GRACE_DAYS}일 안에 모집글 편집에서 종료일을 미래
      날짜로 수정하면 됩니다. 이 기간이 지난 뒤에는 남은 심사·면접이 없으면 모집이 자동으로 마감되어
      다시 열 수 없습니다.
    </>
  );
}
