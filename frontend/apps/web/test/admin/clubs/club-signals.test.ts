import { describe, expect, it } from 'vitest';
import type { AdminClubSignal, AdminClubSignalDetail } from '@duing/types';

import {
  SIGNAL_LABEL,
  SIGNAL_ORDER,
  signalFilterParams,
  signalScopeText,
  signalWatchPoints,
} from '@/app/admin/clubs/_lib/clubSignals';

// KST 2026-11-01 정오 — 픽스처와 계산 사이에 자정을 넘을 일이 없다.
const NOW = new Date('2026-11-01T12:00:00+09:00');
const DAY_MS = 86_400_000;
const daysAgoIso = (days: number) => new Date(NOW.getTime() - days * DAY_MS).toISOString();

function makeDetail(overrides: Partial<AdminClubSignalDetail> = {}): AdminClubSignalDetail {
  return { operatorsLastActiveAt: null, resultWaiting: null, joinRequestWaiting: null, ...overrides };
}

const RESULT_WAITING_TWO: AdminClubSignalDetail['resultWaiting'] = {
  oldestRecruitmentId: 31,
  oldestRecruitmentTitle: '2학기 신입 모집',
  oldestEndedOn: '2026-10-20',
  recruitmentCount: 2,
  applicationCount: 5,
};

describe('신호 이름 표', () => {
  it('네 신호를 홈 카드 순서로 두고 스펙 이름을 쓴다', () => {
    expect(SIGNAL_ORDER.map((signal) => SIGNAL_LABEL[signal])).toEqual([
      '지원 결과 미확정', '가입 신청 7일 넘게 대기', '두잉 기록 없음', '운영진 30일 넘게 미접속',
    ]);
  });

  it('신호 화면 조회 조건은 운영 중 + 신호이고 미결 정리 필요는 싣지 않는다', () => {
    expect(signalFilterParams('NO_RECORD')).toEqual({ status: 'ACTIVE', signal: 'NO_RECORD' });
  });

  it.each<[number | null, string]>([
    [3, '동아리 3곳만 보고 있어요'],
    [0, '동아리만 보고 있어요'],
    [null, '동아리만 보고 있어요'],
  ])('목록 건수 %s → "%s"', (clubCount, expected) => {
    expect(signalScopeText(clubCount)).toBe(expected);
  });
});

describe('살펴볼 점', () => {
  it('결과 대기 — 모집 2건이면 모집 수까지 쓰고 끝난 지는 KST 날짜로 센다', () => {
    const watchPoints = signalWatchPoints('RESULT_WAITING', makeDetail({ resultWaiting: RESULT_WAITING_TWO }), NOW);
    expect(watchPoints.recruitment).toEqual({
      recruitmentId: 31,
      title: '2학기 신입 모집',
      endedText: '끝난 지 12일',
      countText: '결과 미확정 지원 5건 · 모집 2건',
    });
    expect(watchPoints.joinRequestText).toBeNull();
  });

  it('결과 대기 — 모집 1건이면 지원 건수만 쓴다', () => {
    const watchPoints = signalWatchPoints('RESULT_WAITING', makeDetail({
      resultWaiting: { ...RESULT_WAITING_TWO, recruitmentCount: 1, applicationCount: 3 },
    }), NOW);
    expect(watchPoints.recruitment?.countText).toBe('결과 미확정 지원 3건');
  });

  it('가입 대기 — 대기 신청 N건 · 가장 오래된 신청은 N일 전', () => {
    const watchPoints = signalWatchPoints('JOIN_REQUEST_WAITING', makeDetail({
      joinRequestWaiting: { requestCount: 2, oldestRequestedAt: '2026-10-23T03:00:00Z' },
    }), NOW);
    expect(watchPoints.joinRequestText).toBe('대기 신청 2건 · 가장 오래된 신청은 9일 전');
    expect(watchPoints.recruitment).toBeNull();
  });

  it('하위 레코드가 null(처리 경합)이면 그 줄을 빼고 운영진 줄만 남긴다', () => {
    const watchPoints = signalWatchPoints('RESULT_WAITING', makeDetail({ operatorsLastActiveAt: daysAgoIso(3) }), NOW);
    expect(watchPoints).toEqual({ recruitment: null, joinRequestText: null, operatorText: '운영진 마지막 접속 3일 전' });
  });

  it('신호와 무관한 하위 레코드는 쓰지 않는다', () => {
    const watchPoints = signalWatchPoints('NO_RECORD', makeDetail({ resultWaiting: RESULT_WAITING_TWO }), NOW);
    expect(watchPoints.recruitment).toBeNull();
  });

  it.each<[AdminClubSignal, string | null, string]>([
    ['RESULT_WAITING', daysAgoIso(29), '운영진 마지막 접속 29일 전'],
    ['RESULT_WAITING', daysAgoIso(30), '운영진 마지막 접속 30일 전'],
    ['RESULT_WAITING', daysAgoIso(31), '운영진 마지막 접속 31일 전 · 두잉 알림이 닿지 않을 수 있어요'],
    ['JOIN_REQUEST_WAITING', null, '운영진 접속 기록 없음 · 두잉 알림이 닿지 않을 수 있어요'],
    ['JOIN_REQUEST_WAITING', NOW.toISOString(), '운영진 마지막 접속 오늘'],
    ['OPERATOR_INACTIVE', daysAgoIso(40), '운영진 마지막 접속 40일 전'],
    ['OPERATOR_INACTIVE', null, '운영진 접속 기록 없음'],
    ['NO_RECORD', daysAgoIso(31), '운영진 마지막 접속 31일 전'],
  ])('%s · 마지막 접속 %s → "%s"(알림 덧붙임은 ① 신호만)', (signal, operatorsLastActiveAt, expected) => {
    expect(signalWatchPoints(signal, makeDetail({ operatorsLastActiveAt }), NOW).operatorText).toBe(expected);
  });

  it('KST 자정 직후(UTC 날짜가 하루 늦은 때)에도 KST 달력 일수로 센다', () => {
    const justAfterKstMidnight = new Date('2026-11-01T00:30:00+09:00');
    const watchPoints = signalWatchPoints('RESULT_WAITING', makeDetail({
      resultWaiting: RESULT_WAITING_TWO,
      // KST 10-01 23:50 — KST 로는 31일 전, UTC 날짜로 세면 30일 전이 된다
      operatorsLastActiveAt: '2026-10-01T14:50:00Z',
    }), justAfterKstMidnight);
    expect(watchPoints.recruitment?.endedText).toBe('끝난 지 12일');
    expect(watchPoints.operatorText).toBe('운영진 마지막 접속 31일 전 · 두잉 알림이 닿지 않을 수 있어요');

    const joinPoints = signalWatchPoints('JOIN_REQUEST_WAITING', makeDetail({
      // KST 10-22 23:30 — KST 로는 10일 전, UTC 날짜로 세면 9일 전이 된다
      joinRequestWaiting: { requestCount: 1, oldestRequestedAt: '2026-10-22T14:30:00Z' },
    }), justAfterKstMidnight);
    expect(joinPoints.joinRequestText).toBe('대기 신청 1건 · 가장 오래된 신청은 10일 전');
  });
});
