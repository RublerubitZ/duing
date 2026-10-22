// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// 기기 시간대로 날짜·시각을 읽거나 만드는 Date API 의 재발 방지 가드(/TIMEZONE.md — 날짜 판정은 KST 전용, 표시는 @duing/hooks
// 공통 유틸만). 로컬 게터로 "오늘"을 조립하거나(#1548·#1550) 로컬 Date 에 밀리초를 더하면(#1551) 해외 기기·일광절약 전환일에
// 날짜·시각이 어긋난다. 허용 목록은 입력이 달력 날짜뿐이라 로컬 생성자→로컬 게터 왕복으로 시간대가 상쇄되는 계산(요일·말일·
// 월 격자)만 남긴다. 파일별 건수까지 고정해 그런 파일에 "오늘" 계산이 한 줄 늘어나는 것도(#1548 이 고친 자리는 CalendarPage
// 안이었다), 예외가 사라지는 것도 잡는다.
// ESLint 규칙이 아닌 이유: packages/* 는 lint 가 없고(#1550 의 schemas 자리), 줄 단위 허용이면 앱 코드에 disable 주석 수십 줄이 든다.
// 못 잡는 것: 오프셋 없는 문자열의 new Date(str)·Date.parse(str)(#1550 의 면접 마감 모양), `${date}`·String(date),
// Date 의 toLocaleString()·toLocaleString('ko-KR')(숫자 포맷과 구분 불가), 옵션을 변수로 넘기는 toLocaleString,
// now['getHours']() 같은 계산된 이름, toISOString().slice(0, 10) 같은 "UTC 오늘"(기기와 무관하지만 한국 0~9시에 하루 어긋난다).
const FRONTEND_ROOT = resolve(__dirname, '../../../..');
const WEB_ROOT = 'apps/web';
const SCANNED_DIRS = [
  `${WEB_ROOT}/app`,
  `${WEB_ROOT}/components`,
  ...readdirSync(join(FRONTEND_ROOT, 'packages'))
    .map((name) => `packages/${name}/src`)
    .filter((dir) => existsSync(join(FRONTEND_ROOT, dir))),
];
// apps/web 루트의 런타임 파일(middleware·instrumentation·sentry)은 보고, 테스트·빌드 도구 설정만 뺀다.
const TOOLING_CONFIG = /^(playwright|vitest|tailwind)\b.*\.config\.ts$/;

const LOCAL_DATE_METHODS = new Set([
  'getFullYear', 'getYear', 'getMonth', 'getDate', 'getDay', 'getHours', 'getMinutes', 'getSeconds', 'getMilliseconds',
  'getTimezoneOffset', 'setFullYear', 'setYear', 'setMonth', 'setDate', 'setHours', 'setMinutes', 'setSeconds',
  'setMilliseconds',
]);
// timeZone 을 넣어도 금지 — 포맷은 kstDateTimeFormatter 로 모은다.
const LOCAL_STRING_METHODS = new Set(['toLocaleDateString', 'toLocaleTimeString', 'toDateString', 'toTimeString']);
// 이 키가 하나라도 있으면 toLocaleString 이 날짜·시각을 포맷한다(숫자 포맷 옵션과 겹치지 않는다).
const DATE_FORMAT_OPTION_KEYS = new Set([
  'year', 'month', 'day', 'weekday', 'era', 'hour', 'minute', 'second', 'dateStyle', 'timeStyle', 'timeZoneName',
  'dayPeriod', 'hour12', 'hourCycle', 'fractionalSecondDigits',
]);

const FIX_HINT =
  'KST 오늘은 todayKstDateString, 오프셋 없는 일정 시각은 parseKstInstant, 시각 표시는 formatTimeKst·kstDateTimeFormatter, ' +
  '달력 날짜 산술은 addDaysIso 또는 Date.UTC + getUTC* 를 쓴다(/TIMEZONE.md). 시간대와 무관한 계산이면 허용 목록에 사유와 함께 넣는다.';

type FindingKind = 'LOCAL_DATE' | 'LOCAL_STRING' | 'NO_TIME_ZONE';
type Finding = { line: number; kind: FindingKind; text: string };
type AllowedMatch = { file: string; count: number; reason: string };

const DATE_ARITHMETIC = '달력 날짜 산술(입력이 날짜뿐)';
const WEEKDAY = '날짜의 요일';

// LOCAL_DATE 만 허용 목록이 있다 — LOCAL_STRING·NO_TIME_ZONE 은 0건이어야 한다.
const ALLOWED_LOCAL_DATE: ReadonlyArray<AllowedMatch> = [
  { file: 'apps/web/app/_lib/bookingDisplay.ts', count: 2, reason: WEEKDAY },
  { file: 'apps/web/app/admin/facility-bookings/_lib/crawlGrouping.ts', count: 7, reason: DATE_ARITHMETIC },
  { file: 'apps/web/app/admin/facility-bookings/submission/_components/SubmissionClubGroupList.tsx', count: 1, reason: WEEKDAY },
  { file: 'apps/web/app/calendar/_lib/upcomingView.ts', count: 2, reason: '날짜의 요일·D-day 일수 차(Math.round)' },
  { file: 'apps/web/app/calendar/_pages/CalendarPage.tsx', count: 8, reason: DATE_ARITHMETIC },
  { file: 'apps/web/app/facilities/_components/booking/BookingConfirmDialog.tsx', count: 2, reason: WEEKDAY },
  { file: 'apps/web/app/facilities/_lib/bookingCalendar.ts', count: 26, reason: DATE_ARITHMETIC },
  { file: 'apps/web/app/facilities/_lib/bookingHome.ts', count: 1, reason: '초(시간대 오프셋은 분 단위라 기기 무관)' },
  { file: 'apps/web/app/facilities/_lib/facilityTimeline.ts', count: 2, reason: DATE_ARITHMETIC },
  { file: 'apps/web/components/interview/SlotPickerByDateGroup.tsx', count: 2, reason: WEEKDAY },
  { file: 'apps/web/components/interview/_utils/localDateTime.ts', count: 2, reason: WEEKDAY },
];

const isSourceFile = (name: string) => /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$|\.d\.ts$/.test(name);

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(entryPath);
    return isSourceFile(entry.name) ? [entryPath] : [];
  });
}

function propertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

/** 옵션 자리의 객체 리터럴 — 괄호·as·satisfies 는 벗긴다. 변수·호출이면 undefined. */
function optionsLiteral(options: ts.Expression | undefined): ts.ObjectLiteralExpression | undefined {
  let expression = options;
  while (
    expression &&
    (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression))
  ) {
    expression = expression.expression;
  }
  return expression && ts.isObjectLiteralExpression(expression) ? expression : undefined;
}

/** 옵션 객체 리터럴이 timeZone 을 정하는가 — 뒤에 오는 펼침(...)은 앞의 timeZone 을 덮을 수 있어 무효로 본다. */
function setsTimeZone(options: ts.Expression | undefined): boolean {
  const literal = optionsLiteral(options);
  if (!literal) return false;
  let timeZoneSet = false;
  for (const property of literal.properties) {
    if (ts.isSpreadAssignment(property)) timeZoneSet = false;
    else if (propertyName(property.name) === 'timeZone') timeZoneSet = true;
  }
  return timeZoneSet;
}

function formatsDate(options: ts.Expression | undefined): boolean {
  const literal = optionsLiteral(options);
  if (!literal) return false;
  return literal.properties.some(
    (property) => !ts.isSpreadAssignment(property) && DATE_FORMAT_OPTION_KEYS.has(propertyName(property.name) ?? ''),
  );
}

function isIntlDateTimeFormat(callee: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === 'DateTimeFormat' &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'Intl'
  );
}

const isDateIdentifier = (expression: ts.Expression) => ts.isIdentifier(expression) && expression.text === 'Date';

// 구문 트리로 찾으므로 주석·문자열 속 이름은 세지 않는다.
function findDeviceTimeZoneUses(source: string, fileName: string): Finding[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings: Finding[] = [];
  const record = (node: ts.Node, kind: FindingKind) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push({ line: line + 1, kind, text: node.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 80) });
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text;
      if (LOCAL_DATE_METHODS.has(methodName)) record(node, 'LOCAL_DATE');
      if (LOCAL_STRING_METHODS.has(methodName)) record(node, 'LOCAL_STRING');
      if (methodName === 'toLocaleString' && formatsDate(node.arguments[1]) && !setsTimeZone(node.arguments[1])) {
        record(node, 'NO_TIME_ZONE');
      }
    }
    if ((ts.isNewExpression(node) || ts.isCallExpression(node)) && isIntlDateTimeFormat(node.expression)) {
      if (!setsTimeZone(node.arguments?.[1])) record(node, 'NO_TIME_ZONE');
    }
    // new Date(y, m, d …) 는 인자를 기기 시간대 벽시계로 읽는다 — new Date()·new Date(ms|iso) 는 절대시각이라 제외.
    if (ts.isNewExpression(node) && isDateIdentifier(node.expression)) {
      const args = node.arguments ?? [];
      if (args.length >= 2 || args.some(ts.isSpreadElement)) record(node, 'LOCAL_DATE');
    }
    // new 없는 Date() 는 기기 시간대 문자열을 돌려준다.
    if (ts.isCallExpression(node) && isDateIdentifier(node.expression)) record(node, 'LOCAL_STRING');
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

function scannedFiles(): string[] {
  const webRootFiles = readdirSync(join(FRONTEND_ROOT, WEB_ROOT), { withFileTypes: true })
    .filter((entry) => entry.isFile() && isSourceFile(entry.name) && !TOOLING_CONFIG.test(entry.name))
    .map((entry) => join(FRONTEND_ROOT, WEB_ROOT, entry.name));
  return [...webRootFiles, ...SCANNED_DIRS.flatMap((dir) => collectSourceFiles(join(FRONTEND_ROOT, dir)))];
}

// 구문 분석은 파일마다 한 번만 하고 모든 검사가 재사용한다.
const FINDINGS_BY_FILE: ReadonlyMap<string, Finding[]> = new Map(
  scannedFiles().map((filePath) => [
    relative(FRONTEND_ROOT, filePath),
    findDeviceTimeZoneUses(readFileSync(filePath, 'utf8'), filePath),
  ]),
);

// 같은 파일에 사유가 둘이면 항목을 나눈다 — 건수는 파일별로 합산해 비교한다.
function allowedCountByFile(allowedMatches: ReadonlyArray<AllowedMatch>): Map<string, number> {
  const countByFile = new Map<string, number>();
  for (const allowed of allowedMatches) {
    countByFile.set(allowed.file, (countByFile.get(allowed.file) ?? 0) + allowed.count);
  }
  return countByFile;
}

/** 실제·기대 건수가 다른 파일마다 한 줄 + 그 파일의 실제 자리 — 허용 목록이 없는 종류는 기대를 빈 Map(전 파일 0건)으로 둔다. */
function countMismatches(
  findingsByFile: ReadonlyMap<string, Finding[]>,
  kind: FindingKind,
  expectedCountByFile: Map<string, number>,
): string[] {
  const actualByFile = new Map<string, Finding[]>();
  for (const [file, findings] of findingsByFile) {
    const matched = findings.filter((finding) => finding.kind === kind);
    if (matched.length > 0) actualByFile.set(file, matched);
  }
  return [...new Set([...actualByFile.keys(), ...expectedCountByFile.keys()])]
    .sort()
    .filter((file) => (actualByFile.get(file)?.length ?? 0) !== (expectedCountByFile.get(file) ?? 0))
    .map((file) => {
      const actual = actualByFile.get(file) ?? [];
      const sites = actual.map((finding) => `L${finding.line} ${finding.text}`).join(' | ');
      return `${file}: 실제 ${actual.length}건 / 기대 ${expectedCountByFile.get(file) ?? 0}건${sites ? ` — ${sites}` : ''}`;
    });
}

describe('기기 시간대 Date API 회귀 가드', () => {
  it('검출기: 기기 시간대로 읽고 만드는 호출만 잡는다(주석·문자열·숫자 포맷·절대시각·UTC 제외)', () => {
    const source = [
      '// new Date().getDate() 는 주석이라 세지 않는다',
      "const label = 'getHours() toLocaleTimeString()';",
      'const year = now.getFullYear();',
      'const hours = now?.getHours();',
      'date.setDate(1);',
      'const firstDay = new Date(2026, 10, 1);',
      'const slotStart = new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);',
      'const offsetMs = now.getTimezoneOffset() * 60_000;',
      'const fromParts = new Date(...parts);',
      'const instants = [new Date(), new Date(0), new Date(iso), new Date(Date.UTC(2026, 10, 1))];',
      "const time = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });",
      "const today = new Date().toLocaleDateString('en-CA');",
      'const day = date.toDateString();',
      'const text = Date();',
      "const amount = count.toLocaleString('ko-KR');",
      "const ratio = count.toLocaleString('ko-KR', { maximumFractionDigits: 1 });",
      "const stamp = date.toLocaleString('ko-KR', { hour: '2-digit' });",
      "const kst = date.toLocaleString('ko-KR', { hour: '2-digit', timeZone: 'Asia/Seoul' });",
      "const plain = new Intl.DateTimeFormat('ko-KR');",
      "const called = Intl.DateTimeFormat('ko-KR', { month: 'long' });",
      "const fromVariable = new Intl.DateTimeFormat('ko-KR', options);",
      "const overridden = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', ...options });",
      "const spread = new Intl.DateTimeFormat('ko-KR', { ...options, timeZone: 'Asia/Seoul' });",
      'const utc = date.getUTCDate();',
      "const typed = date.toLocaleString('ko-KR', { hour: '2-digit' } satisfies Intl.DateTimeFormatOptions);",
      "const constant = new Intl.DateTimeFormat('ko-KR', ({ timeZone: 'Asia/Seoul' }) as const);",
      '',
    ].join('\n');

    expect(findDeviceTimeZoneUses(source, 'sample.ts').map(({ line, kind }) => `${line} ${kind}`)).toEqual([
      '3 LOCAL_DATE',
      '4 LOCAL_DATE',
      '5 LOCAL_DATE',
      '6 LOCAL_DATE',
      '7 LOCAL_DATE',
      '8 LOCAL_DATE',
      '9 LOCAL_DATE',
      '11 LOCAL_STRING',
      '12 LOCAL_STRING',
      '13 LOCAL_STRING',
      '14 LOCAL_STRING',
      '17 NO_TIME_ZONE',
      '19 NO_TIME_ZONE',
      '20 NO_TIME_ZONE',
      '21 NO_TIME_ZONE',
      '22 NO_TIME_ZONE',
      '25 NO_TIME_ZONE',
    ]);
  });

  it('검출기: TSX 안의 호출도 잡는다', () => {
    const source = 'export const view = <time>{new Date().getHours()}시</time>;\n';
    expect(findDeviceTimeZoneUses(source, 'sample.tsx').map(({ kind }) => kind)).toEqual(['LOCAL_DATE']);
  });

  it('건수 비교: 허용 파일의 건수가 늘거나 줄어도, 목록 밖 파일에 생겨도 그 자리를 짚는다', () => {
    const finding = (line: number): Finding => ({ line, kind: 'LOCAL_DATE', text: 'now.getDate()' });
    const findingsByFile = new Map([
      ['a.ts', [finding(1), finding(2)]],
      ['b.ts', [finding(3)]],
      ['c.ts', [finding(4)]],
    ]);
    const expected = new Map([
      ['a.ts', 1],
      ['b.ts', 1],
      ['d.ts', 1],
    ]);

    expect(countMismatches(findingsByFile, 'LOCAL_DATE', expected)).toEqual([
      'a.ts: 실제 2건 / 기대 1건 — L1 now.getDate() | L2 now.getDate()',
      'c.ts: 실제 1건 / 기대 0건 — L4 now.getDate()',
      'd.ts: 실제 0건 / 기대 1건',
    ]);
  });

  it('허용 목록 밖에서 로컬 게터·세터·로컬 Date 생성자를 쓰지 않고, 목록 파일의 건수가 그대로다', () => {
    expect(countMismatches(FINDINGS_BY_FILE, 'LOCAL_DATE', allowedCountByFile(ALLOWED_LOCAL_DATE)), FIX_HINT).toEqual([]);
  });

  it('toLocaleDateString·toLocaleTimeString·toDateString·toTimeString·Date() 를 쓰지 않는다', () => {
    expect(countMismatches(FINDINGS_BY_FILE, 'LOCAL_STRING', new Map()), FIX_HINT).toEqual([]);
  });

  it('날짜 포맷(Intl.DateTimeFormat·날짜 옵션 toLocaleString)은 timeZone 을 지정한다', () => {
    expect(countMismatches(FINDINGS_BY_FILE, 'NO_TIME_ZONE', new Map()), FIX_HINT).toEqual([]);
  });
});
