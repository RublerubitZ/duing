import { describe, expect, it } from 'vitest';
import type { ActionItem, DashboardTask, OperationItem } from '@duing/types';

import { presentDashboardTask } from '@/app/manage/_components/dashboard/dashboardTaskPresentation';

const NOW = new Date('2026-10-28T03:00:00Z'); // 10/28 KST 12:00
const recruitment = (item: Partial<ActionItem> & Pick<ActionItem, 'type'>): DashboardTask => ({
  source: 'RECRUITMENT',
  item: { recruitmentId: 1, recruitmentTitle: '신입 부원 모집', ...item },
});
const operation = (item: OperationItem): DashboardTask => ({ source: 'OPERATION', item });

describe('presentDashboardTask — 모집 업무', () => {
  it('맥락에서 기한을 빼고 모집명 · 라운드 · 인원만 남긴다', () => {
    const row = presentDashboardTask(10, recruitment({ type: 'INTERVIEW_RESPONSE_UNCOLLECTED', roundId: 7, roundTitle: '2차 면접', count: 2, daysLeft: 1 }), NOW);
    expect(row.label).toBe('면접 응답 미수집');
    expect(row.context).toBe('신입 부원 모집 · 2차 면접 · 2명');
    expect(row.actionLabel).toBe('응답 확인');
    expect(row.href).toBe('/manage/clubs/10/recruitments/1/interview/rounds/7');
  });

  it.each([
    [-1, '응답 마감 1일 지남', 'late'],
    [0, '응답 마감 D-day', 'soon'],
    [3, '응답 마감 D-3', 'soon'],
    [4, '응답 마감 D-4', 'info'],
  ] as const)('응답 마감 칩 daysLeft=%s → %s(%s)', (daysLeft, text, tone) => {
    const row = presentDashboardTask(10, recruitment({ type: 'INTERVIEW_RESPONSE_UNCOLLECTED', roundId: 7, daysLeft }), NOW);
    expect(row.chip).toEqual({ text, tone });
  });

  it('응답 기한이 없는 면접 응답 미수집은 칩이 없다', () => {
    expect(presentDashboardTask(10, recruitment({ type: 'INTERVIEW_RESPONSE_UNCOLLECTED', roundId: 7 }), NOW).chip).toBeNull();
  });

  it.each([
    [0, '미처리 오늘', 'info'],
    [2, '미처리 2일', 'info'],
    [3, '미처리 3일', 'soon'],
    [6, '미처리 6일', 'soon'],
    [7, '미처리 7일', 'late'],
  ] as const)('검토 대기 지원자 미처리 칩 pendingDays=%s → %s(%s)', (pendingDays, text, tone) => {
    const row = presentDashboardTask(10, recruitment({ type: 'APPLICANTS_AWAITING_REVIEW', count: 3, pendingDays }), NOW);
    expect(row.chip).toEqual({ text, tone });
  });

  it('미처리 일수가 없으면(보류만 남음·옛 백엔드) 검토 대기 지원자 칩이 없다', () => {
    expect(presentDashboardTask(10, recruitment({ type: 'APPLICANTS_AWAITING_REVIEW', count: 3 }), NOW).chip).toBeNull();
  });

  // roundId 없는 면접 항목은 라운드 랜딩(/interview)으로 — 옛 ActionItemsCard 테스트가 보던 경로를 여기서 잇는다.
  it.each([
    ['APPLICANTS_AWAITING_REVIEW', '검토 대기 지원자', '지원자 검토', '/manage/clubs/10/recruitments/1/applicants'],
    ['INTERVIEW_ROUND_NEEDED', '면접 라운드 생성 필요', '라운드 만들기', '/manage/clubs/10/recruitments/1/interview'],
    ['INTERVIEW_ROUND_UNCONFIRMED', '면접 일정 미확정', '일정 확정', '/manage/clubs/10/recruitments/1/interview'],
    ['INTERVIEW_RESPONSE_UNCOLLECTED', '면접 응답 미수집', '응답 확인', '/manage/clubs/10/recruitments/1/interview'],
    ['INTERVIEW_RESULT_PENDING', '면접 결과 미확정', '결과 확정', '/manage/clubs/10/recruitments/1/applicants'],
    ['CLOSED_RECRUITMENT_UNDECIDED', '마감 모집 결과 미확정', '결과 확정', '/manage/clubs/10/recruitments/1/applicants'],
  ] as const)('%s → 업무명 %s, 처리 문구 %s, 이동 %s', (type, label, actionLabel, href) => {
    const row = presentDashboardTask(10, recruitment({ type }), NOW);
    expect(row.label).toBe(label);
    expect(row.actionLabel).toBe(actionLabel);
    expect(row.href).toBe(href);
  });

  it('면접 일정 미확정은 라운드가 있으면 라운드 화면으로', () => {
    const row = presentDashboardTask(10, recruitment({ type: 'INTERVIEW_ROUND_UNCONFIRMED', roundId: 7, roundTitle: '1차' }), NOW);
    expect(row.actionLabel).toBe('일정 확정');
    expect(row.href).toBe('/manage/clubs/10/recruitments/1/interview/rounds/7');
  });
});

describe('presentDashboardTask — 운영 업무', () => {
  it('가입 요청: 건수, 가장 오래된 요청 상대 시각, 가입 요청 화면', () => {
    const row = presentDashboardTask(10, operation({ type: 'JOIN_REQUESTS_PENDING', count: 3, oldestRequestedAt: '2026-10-26T03:00:00Z' }), NOW);
    expect(row).toMatchObject({
      label: '가입 요청', context: '3건', actionLabel: '요청 확인', href: '/manage/clubs/10/members/requests',
      chip: { text: '가장 오래된 요청 2일 전', tone: 'info' },
    });
  });

  it('회비 연체: 연체 청구 건수, 청구 탭 연체 필터', () => {
    const row = presentDashboardTask(10, operation({ type: 'FEE_OVERDUE', count: 4 }), NOW);
    expect(row).toMatchObject({ label: '회비 연체', context: '연체 청구 4건', actionLabel: '청구 보기', href: '/manage/clubs/10/fees?tab=bill&status=OVERDUE', chip: null });
  });

  it('은행 입금 확인: BANK 탭', () => {
    const row = presentDashboardTask(10, operation({ type: 'BANK_REVIEW_PENDING', count: 2 }), NOW);
    expect(row).toMatchObject({ label: '은행 입금 확인', context: '확인할 입금 2건', actionLabel: '입금 확인', href: '/manage/clubs/10/fees?tab=bank' });
  });

  it('시설 거절은 지난 예약 탭, 충돌은 기본 탭 — 표기는 시설 예약 화면과 같다', () => {
    const base = { bookingId: 5, roomName: '학생회관 B103', date: '2026-11-04', startTime: '18:00:00', endTime: '20:00:00' } as const;
    const rejected = presentDashboardTask(10, operation({ type: 'FACILITY_BOOKING_ATTENTION', ...base, status: 'REJECTED' }), NOW);
    expect(rejected).toMatchObject({
      key: 'FACILITY_BOOKING_ATTENTION-5',
      label: '시설 예약 결과 확인',
      context: '학생회관 B103 · 11월 4일 (수) 18:00~20:00',
      chip: { text: '거절됨', tone: 'late' },
      actionLabel: '예약 보기',
      href: '/manage/clubs/10/facility-bookings?tab=past',
    });
    const conflict = presentDashboardTask(10, operation({ type: 'FACILITY_BOOKING_ATTENTION', ...base, status: 'CONFLICT' }), NOW);
    expect(conflict.chip).toEqual({ text: '학교 일정 충돌', tone: 'late' });
    expect(conflict.href).toBe('/manage/clubs/10/facility-bookings');
  });
});
