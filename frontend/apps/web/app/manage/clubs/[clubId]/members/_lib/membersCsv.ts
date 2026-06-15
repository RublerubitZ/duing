import type { ClubMemberExportRow, ClubMemberRole } from '@duing/types';

const MEMBER_ROLE_LABEL: Record<ClubMemberRole, string> = {
  LEADER: '회장',
  OFFICER: '운영진',
  MEMBER: '일반멤버',
};

const BOM = '﻿';

function escapeCsvField(value: string): string {
  if (/["\r\n,]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function serializeRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(',');
}

export function buildMembersCsv(rows: ClubMemberExportRow[], includePhone: boolean): string {
  const header = includePhone
    ? ['이름', '학번', '학과', '휴대전화', '역할', '가입일']
    : ['이름', '학번', '학과', '역할', '가입일'];

  const lines = [serializeRow(header)];
  for (const row of rows) {
    const fields = includePhone
      ? [row.name, row.studentId, row.major, row.phone ?? '', MEMBER_ROLE_LABEL[row.role], row.joinedAt.slice(0, 10)]
      : [row.name, row.studentId, row.major, MEMBER_ROLE_LABEL[row.role], row.joinedAt.slice(0, 10)];
    lines.push(serializeRow(fields));
  }
  return BOM + lines.join('\r\n');
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_');
}

export function buildMembersCsvFilename(clubName: string, today: Date): string {
  return `${sanitizeFilename(clubName)}_멤버목록_${formatDate(today)}.csv`;
}
