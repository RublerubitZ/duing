import { daysSinceKst } from '@duing/hooks/datetime';
import type { AdminClubSearchParams, AdminClubSignal, AdminClubSignalDetail } from '@duing/types';

import { OPERATOR_INACTIVE_DAYS, operatorInactiveDays } from '../../_lib/operatorActivity';

type ContactSignal = Extract<AdminClubSignal, 'RESULT_WAITING' | 'JOIN_REQUEST_WAITING'>;
type UsageSignal = Exclude<AdminClubSignal, ContactSignal>;

/** 주소 ?signal= 로 받는 신호 — 모르는 값은 무시한다(서버에 400 을 부르지 않는다). 홈 카드 행 순서와 같다. */
export const SIGNAL_ORDER: ReadonlyArray<AdminClubSignal> = [
  'RESULT_WAITING',
  'JOIN_REQUEST_WAITING',
  'NO_RECORD',
  'OPERATOR_INACTIVE',
];

/** 신호 이름 — 신호 줄·해제 버튼 접근 이름·홈 카드 행 이름이 이 표 하나를 쓴다(스펙 §3). */
export const SIGNAL_LABEL: Record<AdminClubSignal, string> = {
  RESULT_WAITING: '지원 결과 미확정',
  JOIN_REQUEST_WAITING: '가입 신청 7일 넘게 대기',
  NO_RECORD: '두잉 기록 없음',
  OPERATOR_INACTIVE: '운영진 30일 넘게 미접속',
};

/** ① 운영진에게 알릴 일 — 총동연이 대신 처리할 수 없어 연락을 안내한다. 나머지 둘은 ② 두잉 사용 현황(참고). */
export const isContactSignal = (signal: AdminClubSignal): signal is ContactSignal =>
  signal === 'RESULT_WAITING' || signal === 'JOIN_REQUEST_WAITING';

/** 신호 화면의 조회 조건 — 신호는 운영 중 조건을 품는다. 미결 정리 필요는 싣지 않는다(스펙 §8-3). */
export const signalFilterParams = (signal: AdminClubSignal): Pick<AdminClubSearchParams, 'status' | 'signal'> => ({
  status: 'ACTIVE',
  signal,
});

/** 신호 줄 첫 줄의 이름 뒤 — 목록 건수를 알면 "N곳만", 로딩·오류·0건이면 건수를 뺀다. */
export const signalScopeText = (clubCount: number | null): string =>
  clubCount !== null && clubCount > 0 ? `동아리 ${clubCount}곳만 보고 있어요` : '동아리만 보고 있어요';

/** ① 신호 줄 둘째 줄 — 화면이 뒤에 회원 관리 링크를 붙인다. */
export const CONTACT_SIGNAL_GUIDE = '총동연이 대신 처리할 수 없어요 · 연락처는 회원 관리에서 회장 학번으로 찾을 수 있어요';

/** ② 신호 줄 둘째 줄 — 무엇을 세는지와 평가 기준이 아님을 알린다. */
export const USAGE_SIGNAL_GUIDE: Record<UsageSignal, string> = {
  NO_RECORD: '사진·대표 활동·일정·모집 등록만 세요 · 동아리 활동 평가 기준이 아니에요 · 매시 갱신돼요',
  OPERATOR_INACTIVE: '두잉 접속만 세요 · 동아리 활동 평가 기준이 아니에요',
};

/** 이름 칸 '살펴볼 점'(스펙 §8-3). 하위 레코드가 null(처리 경합)이면 그 줄을 빼고 운영진 줄만 남긴다. 경과일이 8일 이상이라고 가정하지 않는다. */
export type SignalWatchPoints = {
  recruitment: { recruitmentId: number; title: string; endedText: string; countText: string } | null;
  joinRequestText: string | null;
  operatorText: string;
};

export const signalWatchPoints = (
  signal: AdminClubSignal,
  signalDetail: AdminClubSignalDetail,
  now: Date,
): SignalWatchPoints => {
  const resultWaiting = signal === 'RESULT_WAITING' ? signalDetail.resultWaiting : null;
  const joinRequestWaiting = signal === 'JOIN_REQUEST_WAITING' ? signalDetail.joinRequestWaiting : null;
  return {
    recruitment: resultWaiting && {
      recruitmentId: resultWaiting.oldestRecruitmentId,
      title: resultWaiting.oldestRecruitmentTitle,
      endedText: `끝난 지 ${daysSinceKst(resultWaiting.oldestEndedOn, now)}일`,
      countText:
        resultWaiting.recruitmentCount > 1
          ? `결과 미확정 지원 ${resultWaiting.applicationCount}건 · 모집 ${resultWaiting.recruitmentCount}건`
          : `결과 미확정 지원 ${resultWaiting.applicationCount}건`,
    },
    joinRequestText:
      joinRequestWaiting &&
      `대기 신청 ${joinRequestWaiting.requestCount}건 · 가장 오래된 신청은 ${daysSinceKst(joinRequestWaiting.oldestRequestedAt, now)}일 전`,
    operatorText: operatorWatchText(signal, signalDetail.operatorsLastActiveAt, now),
  };
};

/** 공통 마지막 줄 — ① 신호에서만 30일 넘음(KST 달력 일수)·기록 없음에 알림이 닿지 않을 수 있다고 덧붙인다. */
const operatorWatchText = (signal: AdminClubSignal, lastActiveAt: string | null, now: Date): string => {
  const inactiveDays = lastActiveAt === null ? null : operatorInactiveDays(lastActiveAt, now);
  const activityText =
    inactiveDays === null
      ? '운영진 접속 기록 없음'
      : `운영진 마지막 접속 ${inactiveDays <= 0 ? '오늘' : `${inactiveDays}일 전`}`;
  const mayMissNotifications = inactiveDays === null || inactiveDays > OPERATOR_INACTIVE_DAYS;
  return isContactSignal(signal) && mayMissNotifications
    ? `${activityText} · 두잉 알림이 닿지 않을 수 있어요`
    : activityText;
};
