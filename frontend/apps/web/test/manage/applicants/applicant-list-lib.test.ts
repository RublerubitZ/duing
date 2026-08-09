import { describe, expect, it } from 'vitest';
import type { Applicant } from '@duing/types';
import {
  actionableSelectedIds,
  selectableIds,
  selectAllState,
  toggleSelectAll,
} from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_lib/applicantSelection';
import { countByStatus } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_lib/applicantCounts';

function makeApplicant(applicationId: number, status: Applicant['status']): Applicant {
  return {
    applicationId,
    userId: applicationId,
    userName: `지원자${applicationId}`,
    studentId: `2020000${applicationId}`,
    college: 'IT_ENGINEERING',
    major: '컴퓨터공학과',
    grade: 'JUNIOR',
    answers: [],
    status,
    submittedAt: '2026-05-01T10:00:00',
    interviewStartAt: null,
    myScore: null,
  };
}

const applicants = [
  makeApplicant(1, 'SUBMITTED'),
  makeApplicant(2, 'ACCEPTED'),
  makeApplicant(3, 'ON_HOLD'),
  makeApplicant(4, 'REJECTED'),
  makeApplicant(5, 'INTERVIEW_PENDING'),
];

describe('지원자 선택 계산', () => {
  it('최종 상태(합격·불합격)는 선택 대상에서 빠진다', () => {
    expect(selectableIds(applicants)).toEqual([1, 3, 5]);
  });

  it('선택 가능 인원이 0명이면 none', () => {
    expect(selectAllState(new Set([1, 2]), [])).toBe('none');
  });

  it('아무도 선택하지 않으면 none', () => {
    expect(selectAllState(new Set(), [1, 3, 5])).toBe('none');
  });

  it('일부만 선택하면 partial', () => {
    expect(selectAllState(new Set([1]), [1, 3, 5])).toBe('partial');
  });

  it('선택 가능 전원을 선택하면 all — 최종 상태가 섞여 있어도 all 이 된다', () => {
    expect(selectAllState(new Set([1, 3, 5]), [1, 3, 5])).toBe('all');
  });

  it('전체 선택 토글 — all 이면 비우고 그 외에는 선택 가능 전원을 채운다', () => {
    expect(toggleSelectAll([1, 3, 5], 'all')).toEqual([]);
    expect(toggleSelectAll([1, 3, 5], 'none')).toEqual([1, 3, 5]);
    expect(toggleSelectAll([1, 3, 5], 'partial')).toEqual([1, 3, 5]);
  });
});

describe('일괄 처리 실행 대상 — 화면 ∩ 선택', () => {
  /*
   * 검색어가 바뀌어도 선택을 지우지 않는 규칙과 한 쌍이다. 이 교집합이 없으면 화면에서 사라진
   * 지원자가 일괄 불합격에 딸려간다 — 되돌릴 수 없다.
   */
  it('화면에 없는 선택은 실행 대상에서 빠진다', () => {
    // 화면에 보이는 선택 가능 지원자는 1·3, 선택은 1·3·99(다른 검색어에서 고른 잔여)
    expect(actionableSelectedIds([1, 3], new Set([1, 3, 99]))).toEqual([1, 3]);
  });

  it('화면에 있어도 선택 가능하지 않으면 빠진다', () => {
    // selectable 이 이미 최종 상태를 제외한 목록이므로 그 밖의 선택은 실행되지 않는다
    expect(actionableSelectedIds([1], new Set([1, 2]))).toEqual([1]);
  });

  it('교집합이 비면 빈 배열 — 일괄 처리 버튼이 뜨지 않아야 한다', () => {
    expect(actionableSelectedIds([], new Set([1, 2]))).toEqual([]);
    expect(actionableSelectedIds([5, 6], new Set([1, 2]))).toEqual([]);
  });

  it('목록 순서를 따른다', () => {
    expect(actionableSelectedIds([5, 1, 3], new Set([3, 5, 1]))).toEqual([5, 1, 3]);
  });
});

describe('상태별 카운트', () => {
  it('목록에서 상태별로 세고 전체도 함께 낸다', () => {
    const counts = countByStatus(applicants);
    expect(counts.total).toBe(5);
    expect(counts.SUBMITTED).toBe(1);
    expect(counts.ON_HOLD).toBe(1);
    expect(counts.INTERVIEW_PENDING).toBe(1);
    expect(counts.ACCEPTED).toBe(1);
    expect(counts.REJECTED).toBe(1);
  });

  it('알 수 없는 상태가 섞여도 NaN 을 내지 않는다', () => {
    const unknown = [{ ...makeApplicant(9, 'SUBMITTED'), status: 'FUTURE_STATUS' as Applicant['status'] }];
    const counts = countByStatus(unknown);
    expect(counts.total).toBe(1);
    expect(Number.isNaN(counts.SUBMITTED)).toBe(false);
  });

  it('빈 목록은 전부 0 이다', () => {
    const counts = countByStatus([]);
    expect(counts.total).toBe(0);
    expect(counts.SUBMITTED).toBe(0);
    expect(counts.REJECTED).toBe(0);
  });
});
