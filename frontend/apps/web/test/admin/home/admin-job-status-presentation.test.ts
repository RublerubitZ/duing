import { describe, expect, it } from 'vitest';
import type { AdminJobStatus } from '@duing/types';

import {
  buildJobStatusRows,
  dailyRunTimeText,
  jobStatusHeadline,
} from '@/app/admin/_components/home/adminJobStatusPresentation';

// KST 2026-10-30 12:00
const NOW = new Date('2026-10-30T03:00:00Z');

function statusOf(overrides: Partial<AdminJobStatus> & Pick<AdminJobStatus, 'job'>): AdminJobStatus {
  return {
    health: 'OK',
    lastFinishedAt: '2026-10-29T15:40:02Z',
    lastSucceededAt: '2026-10-29T15:40:02Z',
    lastOutcome: 'SUCCESS',
    resultCount: 2,
    failedCount: 0,
    ...overrides,
  };
}

function onlyRow(status: AdminJobStatus) {
  const [row] = buildJobStatusRows([status], NOW);
  if (!row) throw new Error('줄이 없다');
  return row;
}

describe('dailyRunTimeText', () => {
  it('KST 날짜로 오늘·어제·그 전을 가른다 — UTC 날짜가 아니다', () => {
    expect(dailyRunTimeText('2026-10-29T15:40:02Z', NOW)).toBe('오늘 00:40'); // KST 10/30 00:40, UTC 로는 10/29
    expect(dailyRunTimeText('2026-10-28T15:40:02Z', NOW)).toBe('어제 00:40');
    expect(dailyRunTimeText('2026-10-27T15:40:02Z', NOW)).toBe('10월 28일 00:40');
  });
  it('서버 시각은 소수 자리가 가변(마이크로초 6자리 등)이어도 같게 읽는다', () => {
    expect(dailyRunTimeText('2026-10-29T15:40:02.123456Z', NOW)).toBe('오늘 00:40');
    expect(dailyRunTimeText('2026-10-28T15:40:02.5Z', NOW)).toBe('어제 00:40');
    const [row] = buildJobStatusRows(
      [{ job: 'FACILITY_RESERVATION_CRAWL', health: 'OK', lastFinishedAt: '2026-10-30T02:52:00.654321Z', lastSucceededAt: '2026-10-30T02:52:00.654321Z', lastOutcome: 'SUCCESS', resultCount: 10, failedCount: 0 }],
      NOW,
    );
    // 03:00:00 − 02:52:00.654321 = 7분 59초 — 소수 자리까지 읽어 분을 내림하므로 7분이다(못 읽으면 원문이 나온다)
    expect(row?.resultText).toBe('7분 전 수집 성공');
  });
});

describe('buildJobStatusRows — 결과 한 줄', () => {
  it('매일 잡은 KST 시각, 10분 잡은 상대 시각으로 정상 결과를 쓴다(0건 문구 포함)', () => {
    expect(onlyRow(statusOf({ job: 'RECRUITMENT_AUTO_CLOSE' })).resultText).toBe('오늘 00:40 · 2건 마감');
    expect(onlyRow(statusOf({ job: 'RECRUITMENT_AUTO_CLOSE', resultCount: 0 })).resultText).toBe('오늘 00:40 · 마감할 모집 없음');
    expect(onlyRow(statusOf({ job: 'APPLICATION_PENDING_REMINDER', resultCount: 5 })).resultText).toBe('오늘 00:40 · 운영진 알림 5건');
    expect(onlyRow(statusOf({ job: 'APPLICATION_PENDING_REMINDER', resultCount: 0 })).resultText).toBe('오늘 00:40 · 보낼 알림 없음');
    expect(onlyRow(statusOf({ job: 'FEDERATION_INQUIRY_PURGE', resultCount: 3 })).resultText).toBe('오늘 00:40 · 3건 파기');
    expect(onlyRow(statusOf({ job: 'FEDERATION_INQUIRY_PURGE', resultCount: 0 })).resultText).toBe('오늘 00:40 · 파기할 문의 없음');

    const eightMinutesAgo = '2026-10-30T02:52:00Z';
    expect(onlyRow(statusOf({ job: 'FACILITY_RESERVATION_CRAWL', lastFinishedAt: eightMinutesAgo })).resultText).toBe('8분 전 수집 성공');
    expect(onlyRow(statusOf({ job: 'FACILITY_BOOKING_MATCHING', lastFinishedAt: eightMinutesAgo })).resultText).toBe('8분 전 · 2건 확정');
    expect(onlyRow(statusOf({ job: 'FACILITY_BOOKING_MATCHING', lastFinishedAt: eightMinutesAgo, resultCount: 0 })).resultText).toBe(
      '8분 전 · 새로 확정한 예약 없음',
    );
  });

  it('일부 실패는 성공 건수와 실패 건수를 함께 쓴다 — 시설 수집은 실패 시설 0곳이면 "일부 시설 정보를 읽지 못했어요"', () => {
    const partial = { health: 'PARTIAL', lastOutcome: 'PARTIAL', failedCount: 1 };
    expect(onlyRow(statusOf({ job: 'RECRUITMENT_AUTO_CLOSE', ...partial })).resultText).toBe('오늘 00:40 · 2건 마감 · 1건 실패');
    expect(onlyRow(statusOf({ job: 'FEDERATION_INQUIRY_PURGE', ...partial })).resultText).toBe('오늘 00:40 · 2건 파기 · 첨부 1건 삭제 못 함');
    const crawlAt = '2026-10-30T02:52:00Z';
    expect(onlyRow(statusOf({ job: 'FACILITY_RESERVATION_CRAWL', ...partial, lastFinishedAt: crawlAt, failedCount: 2 })).resultText).toBe(
      '8분 전 · 시설 2곳 수집 실패',
    );
    expect(onlyRow(statusOf({ job: 'FACILITY_RESERVATION_CRAWL', ...partial, lastFinishedAt: crawlAt, failedCount: 0 })).resultText).toBe(
      '8분 전 · 일부 시설 정보를 읽지 못했어요',
    );
    expect(onlyRow(statusOf({ job: 'FACILITY_BOOKING_MATCHING', ...partial, lastFinishedAt: crawlAt })).resultText).toBe(
      '8분 전 · 2건 확정 · 일부 확인 못 함',
    );
    expect(onlyRow(statusOf({ job: 'APPLICATION_PENDING_REMINDER', ...partial })).resultText).toBe('오늘 00:40 · 운영진 알림 2건 · 1건 실패');
  });

  it('일부 실패인데 성공이 0건이면 "없음" 문구를 섞지 않는다 — "마감할 모집 없음 · 1건 실패" 같은 모순이 없다', () => {
    const partialNothingDone = { health: 'PARTIAL', lastOutcome: 'PARTIAL', resultCount: 0 };
    expect(onlyRow(statusOf({ job: 'RECRUITMENT_AUTO_CLOSE', ...partialNothingDone, failedCount: 1 })).resultText).toBe('오늘 00:40 · 1건 마감 실패');
    expect(onlyRow(statusOf({ job: 'APPLICATION_PENDING_REMINDER', ...partialNothingDone, failedCount: 3 })).resultText).toBe(
      '오늘 00:40 · 운영진 알림 3건 실패',
    );
    expect(onlyRow(statusOf({ job: 'FEDERATION_INQUIRY_PURGE', ...partialNothingDone, failedCount: 1 })).resultText).toBe('오늘 00:40 · 첨부 1건 삭제 못 함');
    expect(
      onlyRow(statusOf({ job: 'FACILITY_BOOKING_MATCHING', ...partialNothingDone, failedCount: 2, lastFinishedAt: '2026-10-30T02:52:00Z' })).resultText,
    ).toBe('8분 전 · 일부 확인 못 함');
  });

  it('실패·늦음·첫 실행 전·꺼짐 문구', () => {
    expect(onlyRow(statusOf({ job: 'RECRUITMENT_AUTO_CLOSE', health: 'FAILED', lastOutcome: 'FAILED', lastSucceededAt: '2026-10-28T15:40:02Z' })).resultText).toBe(
      '마지막 실행 실패 · 마지막 성공 어제 00:40',
    );
    expect(onlyRow(statusOf({ job: 'RECRUITMENT_AUTO_CLOSE', health: 'FAILED', lastOutcome: 'FAILED', lastSucceededAt: null })).resultText).toBe(
      '마지막 실행 실패 · 성공 기록 없음',
    );
    expect(onlyRow(statusOf({ job: 'FACILITY_RESERVATION_CRAWL', health: 'OVERDUE', lastSucceededAt: '2026-10-30T02:00:00Z' })).resultText).toBe(
      '예정대로 돌지 않았어요 · 마지막 성공 1시간 전',
    );
    expect(onlyRow(statusOf({ job: 'FACILITY_RESERVATION_CRAWL', health: 'OVERDUE', lastSucceededAt: null })).resultText).toBe('예정대로 돌지 않았어요');
    expect(onlyRow(statusOf({ job: 'RECRUITMENT_AUTO_CLOSE', health: 'NOT_YET', lastFinishedAt: null })).resultText).toBe('아직 실행 기록이 없어요');
    expect(onlyRow(statusOf({ job: 'RECRUITMENT_AUTO_CLOSE', health: 'DISABLED' })).resultText).toBe('두잉 담당자가 꺼 두었어요');
  });

  it('10분 잡이 한두 번 흔들려 정상인데 마지막 결과가 성공이 아니면 "잠깐 실패" 다(경고 아님)', () => {
    const row = onlyRow(statusOf({ job: 'FACILITY_RESERVATION_CRAWL', health: 'OK', lastOutcome: 'FAILED', lastFinishedAt: '2026-10-30T02:57:00Z' }));
    expect(row.resultText).toBe('3분 전 잠깐 실패 · 다음 실행에서 다시 시도해요');
    expect(row.isWarning).toBe(false);
  });
});

describe('buildJobStatusRows — 칩·경고·영향·직접 할 일', () => {
  it('상태 칩 글자와 톤', () => {
    const chips = (['OK', 'PARTIAL', 'FAILED', 'OVERDUE', 'NOT_YET', 'DISABLED'] as const).map(
      (health) => onlyRow(statusOf({ job: 'RECRUITMENT_AUTO_CLOSE', health })).chip,
    );
    expect(chips).toEqual([
      { label: '정상', tone: 'info' },
      { label: '일부 실패', tone: 'soon' },
      { label: '실패', tone: 'late' },
      { label: '늦음', tone: 'late' },
      { label: '첫 실행 전', tone: 'info' },
      { label: '꺼짐', tone: 'info' },
    ]);
  });

  it('업무 영향은 경고·꺼짐 줄에만, 직접 할 일은 경고 줄에만 붙는다', () => {
    const overdueMatching = onlyRow(statusOf({ job: 'FACILITY_BOOKING_MATCHING', health: 'OVERDUE' }));
    expect(overdueMatching.isWarning).toBe(true);
    expect(overdueMatching.impact).toBe('학교 반영 대기가 자동으로 줄지 않아요');
    expect(overdueMatching.workaround).toBe('시설 예약 관리에서 직접 확정할 수 있어요');

    const failedAutoClose = onlyRow(statusOf({ job: 'RECRUITMENT_AUTO_CLOSE', health: 'FAILED', lastOutcome: 'FAILED' }));
    expect(failedAutoClose.workaround).toBe('모집 관리에서 직접 마감할 수 있어요');
    expect(onlyRow(statusOf({ job: 'FACILITY_RESERVATION_CRAWL', health: 'FAILED' })).workaround).toBeNull();

    // 일부 실패도 경고다 — 영향·직접 할 일이 같이 붙는다
    const partialAutoClose = onlyRow(
      statusOf({ job: 'RECRUITMENT_AUTO_CLOSE', health: 'PARTIAL', lastOutcome: 'PARTIAL', failedCount: 1 }),
    );
    expect(partialAutoClose.isWarning).toBe(true);
    expect(partialAutoClose.impact).toBe('기간이 끝난 모집이 "모집 중"으로 남을 수 있어요');
    expect(partialAutoClose.workaround).toBe('모집 관리에서 직접 마감할 수 있어요');

    const disabledPurge = onlyRow(statusOf({ job: 'FEDERATION_INQUIRY_PURGE', health: 'DISABLED' }));
    expect(disabledPurge.isWarning).toBe(false);
    expect(disabledPurge.isDisabled).toBe(true);
    expect(disabledPurge.impact).toBe('삭제된 문의 내용이 보관 기간을 넘겨 남아 있을 수 있어요');
    expect(disabledPurge.workaround).toBeNull();

    const healthyReminder = onlyRow(statusOf({ job: 'APPLICATION_PENDING_REMINDER' }));
    expect(healthyReminder.impact).toBeNull();
    // 직접 할 일이 있는 작업으로 확인한다 — 정상·꺼짐 줄에는 붙지 않는다
    expect(onlyRow(statusOf({ job: 'RECRUITMENT_AUTO_CLOSE' })).workaround).toBeNull();
    expect(onlyRow(statusOf({ job: 'FACILITY_BOOKING_MATCHING', health: 'DISABLED' })).workaround).toBeNull();
  });

  it('모르는 작업 키는 줄을 그리지 않고, 모르는 상태는 칩 없이 경고로 세지 않는다(fail-open)', () => {
    const rows = buildJobStatusRows(
      [statusOf({ job: 'RETIRED_JOB', health: 'FAILED' }), statusOf({ job: 'RECRUITMENT_AUTO_CLOSE', health: 'PAUSED' })],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.chip).toBeNull();
    expect(rows[0]?.isWarning).toBe(false);
    // 모르는 상태는 결과를 단정하지 않는다(실패 기록을 "마감할 모집 없음"처럼 안심 문장으로 읽히지 않게)
    expect(rows[0]?.resultText).toBe('오늘 00:40 실행');
    const unknownFailed = buildJobStatusRows(
      [statusOf({ job: 'RECRUITMENT_AUTO_CLOSE', health: 'PAUSED', lastOutcome: 'FAILED', resultCount: 0 })],
      NOW,
    );
    expect(unknownFailed[0]?.resultText).toBe('오늘 00:40 실행');
  });
});

describe('jobStatusHeadline', () => {
  const row = (job: string, health: string) => onlyRow(statusOf({ job, health }));

  it('경고가 있으면 개수를, 없으면 정상 문장을, 꺼짐이 있으면 개수를 덧붙인다', () => {
    expect(jobStatusHeadline([row('RECRUITMENT_AUTO_CLOSE', 'FAILED'), row('FACILITY_RESERVATION_CRAWL', 'OVERDUE')])).toBe(
      '확인이 필요한 자동 작업이 2개 있어요',
    );
    expect(jobStatusHeadline([row('RECRUITMENT_AUTO_CLOSE', 'PARTIAL'), row('FACILITY_RESERVATION_CRAWL', 'OK')])).toBe(
      '확인이 필요한 자동 작업이 1개 있어요',
    );
    expect(jobStatusHeadline([row('RECRUITMENT_AUTO_CLOSE', 'OK'), row('FACILITY_RESERVATION_CRAWL', 'OK')])).toBe('모두 제때 돌고 있어요');
    expect(jobStatusHeadline([row('RECRUITMENT_AUTO_CLOSE', 'OK'), row('FEDERATION_INQUIRY_PURGE', 'DISABLED')])).toBe(
      '모두 제때 돌고 있어요 · 꺼 둔 작업 1개',
    );
  });

  it('전부 꺼져 있으면 "자동 작업이 모두 꺼져 있어요"다', () => {
    expect(jobStatusHeadline([row('RECRUITMENT_AUTO_CLOSE', 'DISABLED'), row('FEDERATION_INQUIRY_PURGE', 'DISABLED')])).toBe(
      '자동 작업이 모두 꺼져 있어요',
    );
  });

  it('배포 직후처럼 모두 첫 실행 전(과 꺼짐)이면 "첫 실행을 기다리고 있어요"다', () => {
    expect(jobStatusHeadline([row('RECRUITMENT_AUTO_CLOSE', 'NOT_YET'), row('FACILITY_RESERVATION_CRAWL', 'NOT_YET')])).toBe(
      '첫 실행을 기다리고 있어요',
    );
    expect(jobStatusHeadline([row('RECRUITMENT_AUTO_CLOSE', 'NOT_YET'), row('FEDERATION_INQUIRY_PURGE', 'DISABLED')])).toBe(
      '첫 실행을 기다리고 있어요 · 꺼 둔 작업 1개',
    );
  });
});
