import { describe, expect, it } from 'vitest';

import {
  OTHER_PENDING_ROWS,
  QUIET_WEEK_SENTENCE,
  WEEKLY_FLOW_ROWS,
  deltaOf,
  endPendingAbsenceText,
  firstAnswerDurationText,
  firstAnswerLine,
  formatWeekRange,
  nextWeekUnavailableText,
  screenWeekRange,
  weeklySummarySentences,
} from '@/app/admin/weekly-briefing/_lib/weeklyBriefingPresentation';

import { OCTOBER_19, OCTOBER_26, QUIET_WEEK, weeklyBriefingOf } from './weeklyBriefing.data';

const flowOf = (receivedCount: number) => ({ receivedCount, handledCount: 0 });

describe('행 이름', () => {
  it('업무 다섯 줄은 홈 라벨, 그 밖의 대기는 동아리 승인·미처리 지원 모집(칸 라벨)·운영 중단 미결이다', () => {
    expect(WEEKLY_FLOW_ROWS.map((row) => row.label)).toEqual(['신고', '1:1 문의', '시설 예약', '홍보 요청', '회장 승계']);
    expect(OTHER_PENDING_ROWS.map((row) => row.label)).toEqual(['동아리 승인', '미처리 지원 모집', '운영 중단 미결']);
  });
});

describe('deltaOf', () => {
  it('전 주 같은 칸 대비를 중립 표기와 스크린리더 문장으로 준다 — 빼기는 U+2212, 같으면 "같음"', () => {
    expect(deltaOf(28, 22, '건')).toEqual({ visible: '+6', spoken: '전 주보다 6건 많음' });
    expect(deltaOf(1, 2, '곳')).toEqual({ visible: '−1', spoken: '전 주보다 1곳 적음' });
    expect(deltaOf(37, 37, '명')).toEqual({ visible: '같음', spoken: '전 주와 같음' });
  });

  it('전 주 값이 없으면(실패·꺼짐·기록 없음) 증감을 뺀다', () => {
    expect(deltaOf(5, undefined, '건')).toBeNull();
    expect(deltaOf(5, null, '건')).toBeNull();
  });
});

describe('첫 답변 평균', () => {
  it.each([
    [59, '1시간 미만'],
    [60, '1시간'],
    [89, '1시간'],
    [90, '2시간'],
    [2580, '43시간'],
    [2879, '48시간'],
    [2880, '2일'],
    [3600, '3일'],
  ])('%d분은 "%s" 다 — 60분 미만·48시간 미만은 시간 반올림·그 이상은 일 반올림', (minutes, text) => {
    expect(firstAnswerDurationText(minutes)).toBe(text);
  });

  it('보조 줄은 답변 수를 함께 쓰고, 그 주 답변이 0건이면 줄을 뺀다', () => {
    expect(firstAnswerLine({ answerCount: 4, averageMinutes: 2580 })).toBe('첫 답변까지 평균 43시간 (답변 4건 기준)');
    expect(firstAnswerLine({ answerCount: 0, averageMinutes: null })).toBeNull();
  });
});

describe('weeklySummarySentences', () => {
  it('네 문장을 순서대로 — 남은 대기·가장 많이 접수된 영역·모집·1:1 문의(스펙 §3-4 예시)', () => {
    expect(weeklySummarySentences('2026-10-26', OCTOBER_26, OCTOBER_19)).toEqual([
      '11월 1일(일) 밤 남은 처리 대기는 28건으로, 전 주보다 6건 늘었어요.',
      '시설 예약이 14건으로 가장 많이 접수됐어요.',
      '모집 3건이 새로 등록되고 2건의 모집 기간이 끝났어요. 지원서는 142건이에요(전 주보다 20건 늘었어요).',
      '1:1 문의는 9건 접수, 4건 처리했어요. 첫 답변까지 평균 43시간이에요.',
    ]);
  });

  it('전 주가 없으면 비교 절을 빼고, 같거나 줄면 그 말로 쓴다', () => {
    expect(weeklySummarySentences('2026-10-26', OCTOBER_26, null)[0]).toBe('11월 1일(일) 밤 남은 처리 대기는 28건이에요.');
    expect(weeklySummarySentences('2026-10-26', OCTOBER_26, null)[2]).toBe(
      '모집 3건이 새로 등록되고 2건의 모집 기간이 끝났어요. 지원서는 142건이에요.',
    );
    expect(weeklySummarySentences('2026-10-26', OCTOBER_26, OCTOBER_26)[0]).toBe('11월 1일(일) 밤 남은 처리 대기는 28건으로, 전 주와 같아요.');
    expect(weeklySummarySentences('2026-10-19', OCTOBER_19, OCTOBER_26)[0]).toBe('10월 25일(일) 밤 남은 처리 대기는 22건으로, 전 주보다 6건 줄었어요.');
  });

  it('남은 대기 기록이 없으면 첫 문장은 다섯 업무 접수·처리 합이다', () => {
    expect(weeklySummarySentences('2026-10-26', weeklyBriefingOf({ endPending: null }), null)[0]).toBe(
      '다섯 업무에 접수 30건, 처리 20건이에요.',
    );
  });

  it('가장 많이 접수된 영역이 겹치면 함께 쓰고(조사 와/과·이/가), 최대가 1건 이하면 뺀다', () => {
    const tiedTwo = weeklyBriefingOf({
      flow: { report: flowOf(4), inquiry: flowOf(4), facilityBooking: flowOf(2), promotionRequest: flowOf(0), leaderSuccession: flowOf(0) },
    });
    expect(weeklySummarySentences('2026-10-26', tiedTwo, null)[1]).toBe('신고와 1:1 문의가 4건씩 가장 많이 접수됐어요.');
    const tiedThree = weeklyBriefingOf({
      flow: { report: flowOf(3), inquiry: flowOf(3), facilityBooking: flowOf(3), promotionRequest: flowOf(0), leaderSuccession: flowOf(0) },
    });
    expect(weeklySummarySentences('2026-10-26', tiedThree, null)[1]).toBe('신고, 1:1 문의와 시설 예약이 3건씩 가장 많이 접수됐어요.');
    const promotionTop = weeklyBriefingOf({
      flow: { report: flowOf(0), inquiry: flowOf(0), facilityBooking: flowOf(0), promotionRequest: flowOf(5), leaderSuccession: flowOf(2) },
    });
    expect(weeklySummarySentences('2026-10-26', promotionTop, null)[1]).toBe('홍보 요청이 5건으로 가장 많이 접수됐어요.');
    const atMostOne = weeklyBriefingOf({
      flow: { report: flowOf(1), inquiry: flowOf(1), facilityBooking: flowOf(0), promotionRequest: flowOf(0), leaderSuccession: flowOf(1) },
    });
    expect(weeklySummarySentences('2026-10-26', atMostOne, null).some((sentence) => sentence.includes('가장 많이'))).toBe(false);
  });

  it('모집 문장은 0 인 절을 빼고, 셋 다 0 이면 문장을 뺀다', () => {
    const endedOnly = weeklyBriefingOf({ recruitment: { createdCount: 0, endedCount: 2, applicationCount: 142 } });
    expect(weeklySummarySentences('2026-10-26', endedOnly, OCTOBER_19)[2]).toBe(
      '2건의 모집 기간이 끝났어요. 지원서는 142건이에요(전 주보다 20건 늘었어요).',
    );
    const createdOnly = weeklyBriefingOf({ recruitment: { createdCount: 3, endedCount: 0, applicationCount: 0 } });
    expect(weeklySummarySentences('2026-10-26', createdOnly, null)[2]).toBe('모집 3건이 새로 등록됐어요.');
    const none = weeklyBriefingOf({ recruitment: { createdCount: 0, endedCount: 0, applicationCount: 0 } });
    expect(weeklySummarySentences('2026-10-26', none, null).some((sentence) => sentence.includes('모집'))).toBe(false);
  });

  it('1:1 문의가 접수·처리 모두 0 이면 문의 문장을 빼고, 답변이 없으면 평균 절을 뺀다', () => {
    const noInquiry = weeklyBriefingOf({
      flow: { ...OCTOBER_26.flow, inquiry: { receivedCount: 0, handledCount: 0 } },
      inquiryFirstAnswer: { answerCount: 0, averageMinutes: null },
    });
    expect(weeklySummarySentences('2026-10-26', noInquiry, null).some((sentence) => sentence.startsWith('1:1 문의는'))).toBe(false);
    const noAnswer = weeklyBriefingOf({ inquiryFirstAnswer: { answerCount: 0, averageMinutes: null } });
    expect(weeklySummarySentences('2026-10-26', noAnswer, null).at(-1)).toBe('1:1 문의는 9건 접수, 4건 처리했어요.');
  });

  it('조용한 주는 남은 대기 문장(기록이 있으면)과 한 문장만 둔다', () => {
    expect(weeklySummarySentences('2026-10-26', QUIET_WEEK, null)).toEqual([
      '11월 1일(일) 밤 남은 처리 대기는 28건이에요.',
      QUIET_WEEK_SENTENCE,
    ]);
    expect(weeklySummarySentences('2026-10-26', { ...QUIET_WEEK, endPending: null }, null)).toEqual([QUIET_WEEK_SENTENCE]);
    expect(QUIET_WEEK_SENTENCE).toBe('이 주에는 접수된 업무와 새 모집이 없었어요.');
  });
});

describe('endPendingAbsenceText', () => {
  it('기록이 하나도 없음·기록 시작 전 주·그 일요일만 빠짐을 가른다', () => {
    expect(endPendingAbsenceText('2026-10-26', null)).toBe('주 끝 남은 대기는 아직 기록이 없어요.');
    expect(endPendingAbsenceText('2026-10-26', '2026-11-04')).toBe('주 끝 남은 대기는 11월 2일 주부터 기록돼 있어요.');
    expect(endPendingAbsenceText('2026-10-26', '2026-09-01')).toBe('11월 1일(일) 밤 기록이 없어 남은 대기를 보여 드릴 수 없어요.');
  });
});

describe('주 기간 표기', () => {
  it('같은 달은 끝에 일만, 달이 바뀌면 월도, 요일은 선택이다', () => {
    expect(formatWeekRange('2026-10-26', { withYear: false, withWeekday: true })).toBe('10월 26일(월) – 11월 1일(일)');
    expect(formatWeekRange('2026-11-02', { withYear: false, withWeekday: true })).toBe('11월 2일(월) – 8일(일)');
    expect(formatWeekRange('2026-11-02', { withYear: false, withWeekday: false })).toBe('11월 2일 – 8일');
    expect(formatWeekRange('2026-10-26', { withYear: true, withWeekday: true })).toBe('2026년 10월 26일(월) – 11월 1일(일)');
  });

  it('Review Focus 3 — 해를 넘는 주는 양끝에 연도를, 올해가 아닌 주는 화면에도 연도를 쓴다', () => {
    expect(formatWeekRange('2025-12-29', { withYear: false, withWeekday: true })).toBe('2025년 12월 29일(월) – 2026년 1월 4일(일)');
    expect(screenWeekRange('2025-12-29', '2026-01-10')).toBe('2025년 12월 29일(월) – 2026년 1월 4일(일)');
    expect(screenWeekRange('2025-11-03', '2026-11-05', false)).toBe('2025년 11월 3일 – 9일');
    expect(screenWeekRange('2026-10-19', '2026-11-05', false)).toBe('10월 19일 – 25일');
  });

  it('다음 주 버튼 이유는 이번 주가 끝나는 다음 월요일을 쓴다', () => {
    expect(nextWeekUnavailableText('2026-11-02')).toBe('이번 주는 11월 9일(월)부터 볼 수 있어요');
  });
});
