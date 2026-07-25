import { describe, expect, it } from 'vitest';
import type { ClubMemberExportRow } from '@duing/types';
import {
  buildMembersCsv,
  buildMembersCsvFilename,
} from '../../app/manage/clubs/[clubId]/members/_lib/membersCsv';

const rows: ClubMemberExportRow[] = [
  { memberId: 1, name: '홍길동', studentId: '20240001', major: '컴퓨터정보공학부', phone: '010-1111-2222', role: 'LEADER', joinedAt: '2026-03-01T09:00:00', generation: 12, feeStatus: 'PAID' },
  { memberId: 2, name: '김,따옴표"군', studentId: '20240002', major: '경영학과', phone: null, role: 'MEMBER', joinedAt: '2026-03-02T09:00:00', generation: null, feeStatus: 'UNPAID' },
];

describe('buildMembersCsv', () => {
  it('전화·기수 미포함 시 헤더는 이름·학번·학과·역할·회비·가입일 이고 BOM 으로 시작한다', () => {
    const csv = buildMembersCsv(rows, false, false);
    expect(csv.startsWith('﻿')).toBe(true);
    const [header] = csv.slice(1).split('\r\n');
    expect(header).toBe('이름,학번,학과,역할,회비,가입일');
  });

  it('역할을 한글 라벨로, 회비를 한글 라벨로 변환하고 가입일을 YYYY-MM-DD 로 자른다', () => {
    const csv = buildMembersCsv(rows, false, false);
    const line = csv.slice(1).split('\r\n')[1];
    expect(line).toBe('홍길동,20240001,컴퓨터정보공학부,회장,납부,2026-03-01');
  });

  it('회비 미납은 "미납" 라벨로 출력한다', () => {
    const csv = buildMembersCsv(rows, false, false);
    const line = csv.slice(1).split('\r\n')[2];
    expect(line).toBe('"김,따옴표""군",20240002,경영학과,부원,미납,2026-03-02');
  });

  it('전화번호 포함 시 학과 다음에 휴대전화 컬럼이 추가되고 null 은 빈 문자열로 출력한다', () => {
    const csv = buildMembersCsv(rows, true, false);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('이름,학번,학과,휴대전화,역할,회비,가입일');
    expect(lines[1]).toBe('홍길동,20240001,컴퓨터정보공학부,010-1111-2222,회장,납부,2026-03-01');
    expect(lines[2]).toBe('"김,따옴표""군",20240002,경영학과,,부원,미납,2026-03-02');
  });

  it('useGeneration=true 면 역할 다음에 기수 컬럼(숫자 그대로, 미설정은 빈 칸)이 추가된다', () => {
    const csv = buildMembersCsv(rows, false, true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('이름,학번,학과,역할,기수,회비,가입일');
    expect(lines[1]).toBe('홍길동,20240001,컴퓨터정보공학부,회장,12,납부,2026-03-01');
    expect(lines[2]).toBe('"김,따옴표""군",20240002,경영학과,부원,,미납,2026-03-02');
  });

  it('회비 NONE 은 "—" 라벨로 출력한다', () => {
    const noneRow: ClubMemberExportRow[] = [
      { memberId: 5, name: '이몽룡', studentId: '20240005', major: '국문학과', phone: null, role: 'OFFICER', joinedAt: '2026-03-05T09:00:00', generation: null, feeStatus: 'NONE' },
    ];
    const csv = buildMembersCsv(noneRow, false, false);
    const line = csv.slice(1).split('\r\n')[1];
    expect(line).toBe('이몽룡,20240005,국문학과,임원,—,2026-03-05');
  });

  it('수식으로 해석될 수 있는 값(= + - @ 시작)은 작은따옴표로 무력화한다', () => {
    const malicious: ClubMemberExportRow[] = [
      { memberId: 9, name: '=1+2', studentId: '@cmd', major: '-test', phone: null, role: 'MEMBER', joinedAt: '2026-03-03T09:00:00', generation: null, feeStatus: 'NONE' },
    ];
    const csv = buildMembersCsv(malicious, false, false);
    const line = csv.slice(1).split('\r\n')[1];
    expect(line).toBe("'=1+2,'@cmd,'-test,부원,—,2026-03-03");
  });
});

describe('buildMembersCsvFilename', () => {
  it('{동아리명}_멤버목록_{yyyy-MM-dd}.csv 형식으로 만든다', () => {
    expect(buildMembersCsvFilename('AI동아리', new Date(2026, 5, 15))).toBe(
      'AI동아리_멤버목록_2026-06-15.csv',
    );
  });

  it('파일명 불가 문자를 _ 로 치환한다', () => {
    expect(buildMembersCsvFilename('A/B:동아리', new Date(2026, 5, 15))).toBe(
      'A_B_동아리_멤버목록_2026-06-15.csv',
    );
  });

  it('파일명의 개행·탭 등 제어문자도 _ 로 치환한다', () => {
    expect(buildMembersCsvFilename('A\nB\t동아리', new Date(2026, 5, 15))).toBe(
      'A_B_동아리_멤버목록_2026-06-15.csv',
    );
  });
});
