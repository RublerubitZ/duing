import { daysSinceKst } from '@duing/hooks/datetime';
import type { AdminClubSignal, AdminClubSignals } from '@duing/types';

import { daysAgoText } from '../../_lib/operatorActivity';
import { SIGNAL_LABEL } from '../../clubs/_lib/clubSignals';

/** 묶음 사이는 별도 문장이라 스냅숏이 다를 수 있다 — 뺄셈은 0 아래로 자른다(동아리 신호 스펙 §6-2). */
export const countDifference = (total: number, part: number): number => Math.max(0, total - part);

export const CLUB_SIGNALS_TEXT = {
  title: '동아리 현황',
  contactHeading: '운영진에게 알릴 일',
  contactGuide: '총동연이 대신 처리할 수 없어요 · 운영진에게 연락해 주세요',
  contactNone: '지금은 운영진에게 알릴 일이 없어요',
  contactRowNone: '없음',
  usageHeading: '두잉 사용 현황 (참고)',
  usageGuide: '동아리 활동 평가 기준이 아니에요',
  usageNoActiveClub: '운영 중 동아리가 없어요',
} as const;

export type ContactSignalRow = { signal: AdminClubSignal; name: string; clubCount: number; detailLines: string[] };

/** ① 운영진에게 알릴 일 두 행. 0곳이면 화면이 "없음"으로 쓰고 보조 줄·링크를 뺀다. 가장 오래된 값이 null 이면 그 조각을 뺀다. */
export const contactSignalRows = (clubSignals: AdminClubSignals, now: Date): ContactSignalRow[] => {
  const { resultWaiting, joinRequestWaiting } = clubSignals;
  const endedDays = resultWaiting.oldestEndedOn === null ? null : daysSinceKst(resultWaiting.oldestEndedOn, now);
  return [
    {
      signal: 'RESULT_WAITING',
      name: SIGNAL_LABEL.RESULT_WAITING,
      clubCount: resultWaiting.clubCount,
      detailLines: [
        `결과 미확정 지원 ${resultWaiting.applicationCount}건 · 모집 끝나고 7일 넘김`,
        // '오늘'에는 조사 '에'를 붙이지 않는다 — "오늘 끝났어요"·"99일 전에 끝났어요".
        ...(endedDays === null
          ? []
          : [`가장 오래된 모집은 ${daysAgoText(endedDays)}${endedDays > 0 ? '에' : ''} 끝났어요`]),
      ],
    },
    {
      signal: 'JOIN_REQUEST_WAITING',
      name: SIGNAL_LABEL.JOIN_REQUEST_WAITING,
      clubCount: joinRequestWaiting.clubCount,
      detailLines: [
        [
          `대기 신청 ${joinRequestWaiting.requestCount}건`,
          ...(joinRequestWaiting.oldestRequestedAt
            ? [`가장 오래된 신청은 ${daysAgoText(daysSinceKst(joinRequestWaiting.oldestRequestedAt, now))}`]
            : []),
        ].join(' · '),
      ],
    },
  ];
};

export type UsageSignalRow = {
  signal: AdminClubSignal;
  name: string;
  countText: string;
  caption: string | null;
  /** 신호에 걸린 곳이 있으면 그 목록 링크 문구, 0 이면 null(화면은 doneText 를 쓴다) */
  linkText: string | null;
  doneText: string;
};

/** ② 두잉 사용 현황(참고) 두 행 — 양수 표기(올린 곳·들어온 곳 = 운영 중 − 신호), 링크 숫자는 신호에 걸린 곳 수. */
export const usageSignalRows = (clubSignals: AdminClubSignals): UsageSignalRow[] => {
  const { activeClubCount, noRecordClubCount, operatorInactiveClubCount } = clubSignals;
  return [
    {
      signal: 'NO_RECORD',
      name: '두잉에 기록을 올린 동아리',
      countText: `${countDifference(activeClubCount, noRecordClubCount)} / ${activeClubCount}곳`,
      caption: '사진·대표 활동·일정·모집이 하나라도 있는 곳',
      linkText: noRecordClubCount > 0 ? `기록 없는 ${noRecordClubCount}곳 보기` : null,
      doneText: '모두 올렸어요',
    },
    {
      signal: 'OPERATOR_INACTIVE',
      name: '운영진이 30일 안에 들어온 동아리',
      countText: `${countDifference(activeClubCount, operatorInactiveClubCount)} / ${activeClubCount}곳`,
      caption: null,
      linkText: operatorInactiveClubCount > 0 ? `30일 넘게 안 들어온 ${operatorInactiveClubCount}곳 보기` : null,
      doneText: '모두 들어왔어요',
    },
  ];
};
