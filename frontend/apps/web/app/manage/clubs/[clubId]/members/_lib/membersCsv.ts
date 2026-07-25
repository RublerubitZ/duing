import { parseKstInstant } from '@duing/hooks/datetime';
import type { ClubMemberExportRow, MemberFeeStatus } from '@duing/types';
import { clubMemberRoleLabel } from '@/app/_lib/clubMemberRoleLabel';

// CSV 회비 컬럼 한글 라벨 — 화면 배지와 동일 어휘(관리 대상 아님은 짧게 "—").
const FEE_CSV_LABEL: Record<MemberFeeStatus, string> = {
  PAID: '납부',
  UNPAID: '미납',
  NONE: '—',
};

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

// 기수 컬럼은 useGeneration=true 일 때만 포함하며 "N기" 표기가 아닌 숫자 그대로(미설정은 빈 칸).
// 회비 컬럼(납부/미납/—)은 항상 포함한다. 컬럼 순서: 이름·학번·학과·[휴대전화]·역할·[기수]·회비·가입일.
export function buildMembersCsv(
  rows: ClubMemberExportRow[],
  includePhone: boolean,
  useGeneration: boolean,
): string {
  const header = ['이름', '학번', '학과'];
  if (includePhone) header.push('휴대전화');
  header.push('역할');
  if (useGeneration) header.push('기수');
  header.push('회비', '가입일');

  const lines = [serializeRow(header)];
  for (const row of rows) {
    const joinedDate = KST_DATE_FORMATTER.format(parseKstInstant(row.joinedAt));
    const fields = [row.name, row.studentId, row.major];
    if (includePhone) fields.push(row.phone ?? '');
    fields.push(clubMemberRoleLabel(row.role));
    if (useGeneration) fields.push(row.generation === null ? '' : String(row.generation));
    fields.push(FEE_CSV_LABEL[row.feeStatus], joinedDate);
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
