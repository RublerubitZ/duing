import { describe, expect, it } from 'vitest';
import type { ClubMember } from '@duing/types';
import {
  availableGenerations,
  EMPTY_MEMBER_FILTERS,
  filterMembers,
  isRecentJoin,
  RECENT_JOIN_DAYS,
  type MemberFilters,
} from '@/app/manage/clubs/[clubId]/members/_lib/memberFilters';

// KST 정오 고정 — 최근 가입 경계 계산을 결정적으로.
const NOW = new Date('2026-07-24T12:00:00+09:00');

// NOW 로부터 daysAgo 일 전의 KST 캘린더 날짜(YYYY-MM-DD). daysUntilKst 와 동일 기준.
const KST_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
function kstDaysAgo(daysAgo: number): string {
  return KST_DATE.format(new Date(NOW.getTime() - daysAgo * 86_400_000));
}

function member(overrides: Partial<ClubMember> = {}): ClubMember {
  return {
    memberId: 1,
    userId: 1,
    name: '홍길동',
    studentId: '20200001',
    role: 'MEMBER',
    joinedAt: kstDaysAgo(10),
    major: '컴퓨터공학과',
    grade: 'JUNIOR',
    phoneMasked: null,
    generation: 3,
    feeStatus: 'PAID',
    ...overrides,
  };
}

function run(members: ClubMember[], patch: Partial<Parameters<typeof filterMembers>[1]> = {}) {
  return filterMembers(members, {
    query: '',
    filters: EMPTY_MEMBER_FILTERS,
    useGeneration: true,
    now: NOW,
    ...patch,
  });
}

function names(members: ClubMember[]): string[] {
  return members.map((m) => m.name);
}

describe('filterMembers — 검색', () => {
  const members = [
    member({ memberId: 1, name: '홍길동', major: '컴퓨터공학과', studentId: '20200001', role: 'LEADER', generation: 5 }),
    member({ memberId: 2, name: '김철수', major: '전자공학과', studentId: '20219999', role: 'MEMBER', generation: 3 }),
  ];

  it('이름으로 검색한다', () => {
    expect(names(run(members, { query: '철수' }))).toEqual(['김철수']);
  });

  it('학과로 검색한다', () => {
    expect(names(run(members, { query: '전자' }))).toEqual(['김철수']);
  });

  it('학번으로 검색한다', () => {
    expect(names(run(members, { query: '20200001' }))).toEqual(['홍길동']);
  });

  it('역할 라벨(회장/부원)로 검색한다', () => {
    expect(names(run(members, { query: '회장' }))).toEqual(['홍길동']);
    expect(names(run(members, { query: '부원' }))).toEqual(['김철수']);
  });

  it('기수 "N기" 로 검색한다 (useGeneration=true)', () => {
    expect(names(run(members, { query: '5기' }))).toEqual(['홍길동']);
  });

  it('기수 검색은 완전일치라 "1기" 가 11기/21기 회원에 오탐하지 않는다', () => {
    const gens = [
      member({ memberId: 1, name: '홍길동', generation: 1, studentId: '20260001' }),
      member({ memberId: 2, name: '김철수', generation: 11, studentId: '20260011' }),
      member({ memberId: 3, name: '이영희', generation: 21, studentId: '20260021' }),
    ];
    expect(names(run(gens, { query: '1기' }))).toEqual(['홍길동']);
  });

  it('useGeneration=false 면 기수 "N기" 검색이 제외된다', () => {
    expect(run(members, { query: '5기', useGeneration: false })).toEqual([]);
  });

  it('빈 검색어는 전부 통과시킨다', () => {
    expect(run(members, { query: '   ' })).toHaveLength(2);
  });
});

describe('filterMembers — 필터 조합', () => {
  const leader = member({ memberId: 1, name: '회장', role: 'LEADER', feeStatus: 'PAID' });
  const officerUnpaid = member({ memberId: 2, name: '임원', role: 'OFFICER', feeStatus: 'UNPAID' });
  const memberUnpaid = member({ memberId: 3, name: '부원A', role: 'MEMBER', feeStatus: 'UNPAID' });
  const memberPaid = member({ memberId: 4, name: '부원B', role: 'MEMBER', feeStatus: 'PAID' });
  const all = [leader, officerUnpaid, memberUnpaid, memberPaid];

  it('역할 칩은 배타적으로 적용된다', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, role: 'MEMBER' };
    expect(names(run(all, { filters }))).toEqual(['부원A', '부원B']);
  });

  it('회비 미납 토글은 UNPAID 만 남긴다', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, flags: ['UNPAID'] };
    expect(names(run(all, { filters }))).toEqual(['임원', '부원A']);
  });

  it('역할 + 회비 미납은 AND 로 결합된다', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, role: 'MEMBER', flags: ['UNPAID'] };
    expect(names(run(all, { filters }))).toEqual(['부원A']);
  });
});

describe('filterMembers — 기수 필터', () => {
  const members = [
    member({ memberId: 1, name: '3기생', generation: 3 }),
    member({ memberId: 2, name: '5기생', generation: 5 }),
    member({ memberId: 3, name: '기수없음', generation: null }),
  ];

  it('특정 기수를 고르면 해당 기수만 남는다 (useGeneration=true)', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, generation: 3 };
    expect(names(run(members, { filters }))).toEqual(['3기생']);
  });

  it('useGeneration=false 면 기수 필터가 무시된다', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, generation: 3 };
    expect(names(run(members, { filters, useGeneration: false }))).toHaveLength(3);
  });

  it('availableGenerations 는 중복 제거·최신 우선으로 반환한다', () => {
    const dupes = [
      member({ generation: 3 }),
      member({ generation: 5 }),
      member({ generation: 3 }),
      member({ generation: null }),
    ];
    expect(availableGenerations(dupes)).toEqual([5, 3]);
  });
});

describe('filterMembers — 최근 가입 경계(RECENT_JOIN_DAYS)', () => {
  it('RECENT_JOIN_DAYS 는 90 이다', () => {
    expect(RECENT_JOIN_DAYS).toBe(90);
  });

  it('정확히 90일 전 가입은 최근으로 포함된다', () => {
    expect(isRecentJoin(member({ joinedAt: kstDaysAgo(90) }), NOW)).toBe(true);
  });

  it('91일 전 가입은 최근에서 제외된다', () => {
    expect(isRecentJoin(member({ joinedAt: kstDaysAgo(91) }), NOW)).toBe(false);
  });

  it('최근 가입 토글은 경계 안쪽 회원만 남긴다', () => {
    const recent = member({ memberId: 1, name: '최근', joinedAt: kstDaysAgo(90) });
    const old = member({ memberId: 2, name: '오래됨', joinedAt: kstDaysAgo(91) });
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, flags: ['RECENT'] };
    expect(names(run([recent, old], { filters }))).toEqual(['최근']);
  });
});
