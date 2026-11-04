import { describe, it, expect } from 'vitest';
import type { AssignedInterview } from '@duing/types';

import { toAppStatus } from '@/app/me/applications/_pages/ApplicationsPage';

// 지원현황 화면의 모든 마감 처리가 이 파생 하나에 매달려 있다 — 배지·단계·필터 탭은 물론
// 철회 버튼 노출까지 'closed-unresolved' 여부로 갈린다(ApplyDetailModal 의 canWithdraw).
// 마감 검사가 switch 아래로 밀리면 화면은 다시 "심사 중"을 말하고 철회 버튼이 409 를 부른다.

const ASSIGNED_INTERVIEW: AssignedInterview = {
  startAt: '2026-06-20T05:00:00Z',
  endAt: '2026-06-20T06:00:00Z',
  location: '302호',
};

describe('toAppStatus — 모집 마감 축', () => {
  it.each(['SUBMITTED', 'ON_HOLD', 'INTERVIEW_PENDING'] as const)(
    '미결(%s)인 채 모집이 마감되면 closed-unresolved 로 파생된다',
    (status) => {
      expect(toAppStatus(status, null, 'CLOSED')).toBe('closed-unresolved');
    },
  );

  it('면접 일정이 배정돼 있어도 모집이 마감이면 면접 표기로 가지 않는다', () => {
    expect(toAppStatus('INTERVIEW_PENDING', ASSIGNED_INTERVIEW, 'CLOSED')).toBe('closed-unresolved');
  });

  it('결과가 나온 지원은 모집이 마감이어도 결과 표기를 유지한다', () => {
    expect(toAppStatus('ACCEPTED', null, 'CLOSED')).toBe('passed');
    expect(toAppStatus('REJECTED', null, 'CLOSED')).toBe('failed');
  });

  it('모집이 열려 있으면 기존 파생 그대로다', () => {
    expect(toAppStatus('SUBMITTED', null, 'OPEN')).toBe('applied');
    expect(toAppStatus('ON_HOLD', null, 'OPEN')).toBe('applied');
    expect(toAppStatus('INTERVIEW_PENDING', null, 'OPEN')).toBe('interview-pending');
    expect(toAppStatus('INTERVIEW_PENDING', ASSIGNED_INTERVIEW, 'OPEN')).toBe('interview-scheduled');
  });

  it('모집 상태를 아직 안 내려주는 응답은 기존 동작을 유지한다 — 배포 전환기 fail-open', () => {
    expect(toAppStatus('SUBMITTED', null, undefined)).toBe('applied');
    expect(toAppStatus('INTERVIEW_PENDING', ASSIGNED_INTERVIEW, undefined)).toBe(
      'interview-scheduled',
    );
  });
});

describe('toAppStatus — 운영 중단 정리 축', () => {
  it('불합격이고 표시 칸이 참이면(운영 중단 정리) deactivation-ended — 모집 상태와 무관', () => {
    expect(toAppStatus('REJECTED', null, 'CLOSED', true)).toBe('deactivation-ended');
    expect(toAppStatus('REJECTED', null, 'OPEN', true)).toBe('deactivation-ended');
    // 목록 응답의 interview 칸은 상태와 무관하게 채워진다(스펙 §4-1) — 남은 일정이 있어도 면접 표기로 가지 않는다(스펙 §9 #4).
    expect(toAppStatus('REJECTED', ASSIGNED_INTERVIEW, 'CLOSED', true)).toBe('deactivation-ended');
  });

  it('운영진 불합격(표시 칸 거짓)·이전 백엔드(칸 없음)는 지금처럼 failed', () => {
    expect(toAppStatus('REJECTED', null, 'CLOSED', false)).toBe('failed');
    expect(toAppStatus('REJECTED', null, 'CLOSED', undefined)).toBe('failed');
    expect(toAppStatus('REJECTED', null, 'CLOSED')).toBe('failed');
  });

  it('불합격이 아니면 표시 칸을 보지 않는다', () => {
    expect(toAppStatus('ACCEPTED', null, 'CLOSED', true)).toBe('passed');
  });
});
