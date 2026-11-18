import { describe, expect, it } from 'vitest';
import type { AdminClubSignals } from '@duing/types';

import {
  contactSignalRows,
  countDifference,
  usageSignalRows,
} from '@/app/admin/_components/home/adminClubSignalsPresentation';

const NOW = new Date('2026-11-01T12:00:00+09:00');

function makeSignals(overrides: Partial<AdminClubSignals> = {}): AdminClubSignals {
  return {
    activeClubCount: 165,
    resultWaiting: { clubCount: 6, applicationCount: 15, oldestEndedOn: '2026-07-25' },
    joinRequestWaiting: { clubCount: 1, requestCount: 1, oldestRequestedAt: '2026-10-23T03:00:00Z' },
    noRecordClubCount: 110,
    operatorInactiveClubCount: 119,
    ...overrides,
  };
}

describe('홈 동아리 현황 표시 함수', () => {
  it('묶음 사이 스냅숏 차이로 음수가 되면 0 으로 자른다', () => {
    expect(countDifference(165, 110)).toBe(55);
    expect(countDifference(165, 170)).toBe(0);
  });

  it('① 두 행 — 이름·곳 수·보조 줄(경과일은 KST 날짜)', () => {
    expect(contactSignalRows(makeSignals(), NOW)).toEqual([
      {
        signal: 'RESULT_WAITING',
        name: '지원 결과 미확정',
        clubCount: 6,
        detailLines: ['결과 미확정 지원 15건 · 모집 끝나고 7일 넘김', '가장 오래된 모집은 99일 전에 끝났어요'],
      },
      {
        signal: 'JOIN_REQUEST_WAITING',
        name: '가입 신청 7일 넘게 대기',
        clubCount: 1,
        detailLines: ['대기 신청 1건 · 가장 오래된 신청은 9일 전'],
      },
    ]);
  });

  it('가장 오래된 값이 null 이면 그 조각을 뺀다', () => {
    const rows = contactSignalRows(makeSignals({
      resultWaiting: { clubCount: 2, applicationCount: 3, oldestEndedOn: null },
      joinRequestWaiting: { clubCount: 1, requestCount: 4, oldestRequestedAt: null },
    }), NOW);
    expect(rows.map((row) => row.detailLines)).toEqual([['결과 미확정 지원 3건 · 모집 끝나고 7일 넘김'], ['대기 신청 4건']]);
  });

  it('KST 자정 직후(UTC 날짜가 하루 늦은 때)에도 KST 달력 일수로 센다', () => {
    const justAfterKstMidnight = new Date('2026-11-01T00:30:00+09:00');
    const rows = contactSignalRows(makeSignals({
      // KST 10-22 23:30 — KST 로는 10일 전, UTC 날짜로 세면 9일 전
      joinRequestWaiting: { clubCount: 1, requestCount: 1, oldestRequestedAt: '2026-10-22T14:30:00Z' },
    }), justAfterKstMidnight);
    expect(rows[0]?.detailLines[1]).toBe('가장 오래된 모집은 99일 전에 끝났어요');
    expect(rows[1]?.detailLines[0]).toBe('대기 신청 1건 · 가장 오래된 신청은 10일 전');
  });

  it('경과일이 0(기기 시계가 늦은 때)이면 "0일 전" 대신 "오늘"로 쓴다', () => {
    const rows = contactSignalRows(makeSignals({
      resultWaiting: { clubCount: 1, applicationCount: 2, oldestEndedOn: '2026-11-01' },
      joinRequestWaiting: { clubCount: 1, requestCount: 1, oldestRequestedAt: NOW.toISOString() },
    }), NOW);
    expect(rows[0]?.detailLines[1]).toBe('가장 오래된 모집은 오늘 끝났어요');
    expect(rows[1]?.detailLines[0]).toBe('대기 신청 1건 · 가장 오래된 신청은 오늘');
  });

  it('② 두 행 — 양수 표기(올린 곳·들어온 곳)와 신호에 걸린 곳 수 링크, 0 이면 링크 대신 완료 문구', () => {
    expect(usageSignalRows(makeSignals())).toEqual([
      {
        signal: 'NO_RECORD', name: '두잉에 기록을 올린 동아리', countText: '55 / 165곳',
        caption: '사진·대표 활동·일정·모집이 하나라도 있는 곳', linkText: '기록 없는 110곳 보기', doneText: '모두 올렸어요',
      },
      {
        signal: 'OPERATOR_INACTIVE', name: '운영진이 30일 안에 들어온 동아리', countText: '46 / 165곳',
        caption: null, linkText: '30일 넘게 안 들어온 119곳 보기', doneText: '모두 들어왔어요',
      },
    ]);
    const zeroRows = usageSignalRows(makeSignals({ noRecordClubCount: 0, operatorInactiveClubCount: 170 }));
    expect(zeroRows.map((row) => [row.countText, row.linkText])).toEqual([
      ['165 / 165곳', null],
      ['0 / 165곳', '30일 넘게 안 들어온 170곳 보기'],
    ]);
  });
});
