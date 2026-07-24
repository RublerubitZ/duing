import { parseKstInstant } from '@duing/hooks/datetime';
import type { ClubMemberExportRow } from '@duing/types';
import { clubMemberRoleLabel } from '@/app/_lib/clubMemberRoleLabel';

// CSV 는 기존 YYYY-MM-DD 표기를 유지한다(en-CA 로케일 = ISO 날짜 포맷).
// joinedAt 은 절대시각(…Z)일 수 있어 문자열 절단 대신 KST 로 변환해 날짜를 뽑는다.
const KST_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const BOM = '﻿';

function escapeCsvField(value: string): string {
  if (/["\r\n,]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function neutralizeFormula(value: string): string {
  // CSV 수식 인젝션 방지: 위험 문자로 시작하는 셀은 작은따옴표로 무력화한다.
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function serializeRow(fields: string[]): string {
  return fields.map((field) => escapeCsvField(neutralizeFormula(field))).join(',');
}

export function buildMembersCsv(rows: ClubMemberExportRow[], includePhone: boolean): string {
  const header = includePhone
    ? ['이름', '학번', '학과', '휴대전화', '역할', '가입일']
    : ['이름', '학번', '학과', '역할', '가입일'];

  const lines = [serializeRow(header)];
  for (const row of rows) {
    const joinedDate = KST_DATE_FORMATTER.format(parseKstInstant(row.joinedAt));
    const fields = includePhone
      ? [row.name, row.studentId, row.major, row.phone ?? '', clubMemberRoleLabel(row.role), joinedDate]
      : [row.name, row.studentId, row.major, clubMemberRoleLabel(row.role), joinedDate];
    lines.push(serializeRow(fields));
  }
  return BOM + lines.join('\r\n');
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|\r\n\t]/g, '_');
}

export function buildMembersCsvFilename(clubName: string, today: Date): string {
  return `${sanitizeFilename(clubName)}_멤버목록_${KST_DATE_FORMATTER.format(today)}.csv`;
}
