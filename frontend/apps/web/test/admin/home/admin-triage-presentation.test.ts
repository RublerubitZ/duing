import { describe, expect, it } from 'vitest';
import type { AdminTriageAreaState, AdminTriageItem } from '@duing/types';
import {
  ADMIN_TRIAGE_TILES,
  presentTriageItem,
  triageQueueSummary,
  triageTileHref,
  triageTileSubline,
  waitingChip,
} from '@/app/admin/_components/home/adminTriagePresentation';

// KST 2026-10-29(목) 12:00
const NOW = new Date('2026-10-29T03:00:00.000Z');
const area = (overrides: Partial<AdminTriageAreaState>): AdminTriageAreaState => ({
  status: 'ready', rowCount: 0, oldestWaitingSince: null, ...overrides,
});

describe('waitingChip — KST 날짜 차이', () => {
  it.each([
    ['2026-10-29T00:30:00Z', '오늘', 'info'],
    // UTC 로는 10/28 이지만 KST 로는 10/29 00:30 — 오늘
    ['2026-10-28T15:30:00Z', '오늘', 'info'],
    ['2026-10-27T03:00:00Z', '2일', 'info'],
    ['2026-10-26T03:00:00Z', '3일', 'soon'],
    ['2026-10-23T03:00:00Z', '6일', 'soon'],
    ['2026-10-22T03:00:00Z', '7일', 'late'],
    // 기기 시계가 늦어 미래로 보이는 값도 "오늘"
    ['2026-10-30T03:00:00Z', '오늘', 'info'],
  ])('%s → %s(%s)', (waitingSince, text, tone) => {
    expect(waitingChip(waitingSince, NOW)).toEqual({ text, tone });
  });
});

describe('presentTriageItem', () => {
  it.each<[AdminTriageItem, { title: string; context: string | null; actionLabel: string; href: string; isDanger: boolean; areaLabel: string }]>([
    [
      { area: 'REPORT', id: 1, waitingSince: '2026-10-26T03:00:00Z', targetType: 'RECRUITMENT', targetLabel: '신입 모집', reasonCode: 'FRAUD' },
      { title: '신입 모집', context: '모집공고 · 사기/허위', actionLabel: '신고 검토', href: '/admin/reports/1', isDanger: true, areaLabel: '신고' },
    ],
    [
      { area: 'INQUIRY', id: 2, waitingSince: '2026-10-26T03:00:00Z', title: '동아리방 문의', status: 'IN_PROGRESS' },
      { title: '동아리방 문의', context: '답변중', actionLabel: '답변 작성', href: '/admin/inquiries/2', isDanger: false, areaLabel: '1:1 문의' },
    ],
    [
      { area: 'FACILITY', id: 3, waitingSince: '2026-10-26T03:00:00Z', clubName: '', roomName: '학생회관 B103', date: '2026-11-04', startTime: '18:00:00', endTime: '20:00:00', status: 'CONFLICT' },
      { title: '삭제된 동아리 · 학생회관 B103', context: '11월 4일 (수) 18:00~20:00 · 충돌(충돌·의심 카드에서 확인)', actionLabel: '예약 검토', href: '/admin/facility-bookings?tab=review', isDanger: false, areaLabel: '시설 예약' },
    ],
    [
      { area: 'RECRUITMENT', id: 4, waitingSince: '2026-10-20T03:00:00Z', clubName: '코드브루', title: '신입 모집', pendingApplicationCount: 3 },
      { title: '코드브루 · 신입 모집', context: '미처리 3건', actionLabel: '모집 보기', href: '/admin/recruitments/4', isDanger: false, areaLabel: '미처리 지원' },
    ],
    [
      { area: 'PROMOTION', id: 5, waitingSince: '2026-10-26T03:00:00Z', clubName: '코드브루', title: '정기 공연 홍보' },
      { title: '코드브루 · 정기 공연 홍보', context: null, actionLabel: '요청 검토', href: '/admin/promotion-requests/5', isDanger: false, areaLabel: '홍보 요청' },
    ],
    [
      { area: 'SUCCESSION', id: 6, waitingSince: '2026-10-26T03:00:00Z', clubName: '코드브루', requesterName: '이회장' },
      { title: '코드브루', context: '요청자 이회장', actionLabel: '요청 검토', href: '/admin/leader-succession/6', isDanger: false, areaLabel: '회장 승계' },
    ],
  ])('%o', (item, expected) => {
    expect(presentTriageItem(item, NOW)).toMatchObject({ key: `${item.area}:${item.id}`, ...expected });
  });

  it('시설 검토 대기는 "충돌"을 붙이지 않는다', () => {
    const row = presentTriageItem(
      { area: 'FACILITY', id: 3, waitingSince: '2026-10-26T03:00:00Z', clubName: '코드브루', roomName: '학생회관 B103', date: '2026-11-04', startTime: '18:00:00', endTime: '20:00:00', status: 'PENDING' },
      NOW,
    );
    expect(row.context).toBe('11월 4일 (수) 18:00~20:00');
  });
});

describe('영역 칸', () => {
  it('위험 칸(신고)을 먼저 두고 7칸을 정한 순서로 둔다', () => {
    expect(ADMIN_TRIAGE_TILES.map((tile) => tile.label)).toEqual([
      '신고 미처리', '1:1 문의 미답변', '시설 예약 검토', '미처리 지원 모집', '홍보 요청', '회장 승계', '동아리 승인',
    ]);
    expect(ADMIN_TRIAGE_TILES.filter((tile) => tile.isDanger).map((tile) => tile.key)).toEqual(['REPORT']);
  });

  it('칸은 대기 건이 먼저 보이는 목록으로 이어진다', () => {
    const totals = { received: 2, inProgress: 1 };
    expect(ADMIN_TRIAGE_TILES.map((tile) => triageTileHref(tile.key, totals))).toEqual([
      '/admin/reports?status=PENDING',
      '/admin/inquiries?status=RECEIVED',
      '/admin/facility-bookings?tab=review',
      '/admin/recruitments?status=OPEN&sort=STALE',
      '/admin/promotion-requests?status=PENDING',
      '/admin/leader-succession?status=PENDING',
      '/admin/clubs',
    ]);
  });

  it.each([
    [{ received: 0, inProgress: 2 }, '/admin/inquiries?status=IN_PROGRESS'],
    [{ received: 0, inProgress: 0 }, '/admin/inquiries?status=RECEIVED'],
    [{ received: undefined, inProgress: 2 }, '/admin/inquiries?status=RECEIVED'],
    [{ received: 3, inProgress: 2 }, '/admin/inquiries?status=RECEIVED'],
  ])('1:1 문의 칸은 접수가 비고 답변중만 남았을 때만 답변중 탭으로 연다 (%o)', (totals, href) => {
    expect(triageTileHref('INQUIRY', totals)).toBe(href);
  });

  it.each<[string, number | undefined, AdminTriageAreaState, string]>([
    ['① 건수 0 이면 목록과 무관하게 대기 없음', 0, area({ rowCount: 1, oldestWaitingSince: '2026-10-26T03:00:00Z' }), '대기 없음'],
    ['② 목록 로딩이면 빈 줄', 2, area({ status: 'loading' }), ''],
    ['③ 목록 실패면 —', 2, area({ status: 'error', rowCount: 1, oldestWaitingSince: '2026-10-26T03:00:00Z' }), '—'],
    ['④ 행이 있으면 가장 오래된 기간', 2, area({ rowCount: 2, oldestWaitingSince: '2026-10-26T03:00:00Z' }), '가장 오래된 건 3일'],
    ['④ 오늘 접수', 2, area({ rowCount: 1, oldestWaitingSince: '2026-10-28T15:30:00Z' }), '오늘 접수'],
    ['⑤ 건수는 있는데 목록이 비면 —', 2, area({}), '—'],
    ['⑤ 건수를 모르고 목록이 비면 대기 없음', undefined, area({}), '대기 없음'],
    ['건수를 모르고 행이 있으면 가장 오래된 기간', undefined, area({ rowCount: 1, oldestWaitingSince: '2026-10-22T03:00:00Z' }), '가장 오래된 건 7일'],
  ])('%s', (_label, count, areaState, expected) => {
    expect(triageTileSubline(count, areaState, NOW)).toBe(expected);
  });

  it.each<[number | undefined, string]>([
    [3, '신청 시각 —'],
    [0, '대기 없음'],
    [undefined, ''],
  ])('동아리 승인 칸 보조 줄 (건수 %s)', (count, expected) => {
    expect(triageTileSubline(count, null, NOW)).toBe(expected);
  });
});

describe('triageQueueSummary', () => {
  it.each<[number, number | undefined, string | null]>([
    [10, 28, '오래 기다린 10건 · 전체 28건'],
    [0, 3, '전체 3건'],
    [4, undefined, '오래 기다린 4건'],
    [0, undefined, null],
  ])('표시 %i건·전체 %s → %s', (shownCount, total, expected) => {
    expect(triageQueueSummary(shownCount, total)).toBe(expected);
  });
});
