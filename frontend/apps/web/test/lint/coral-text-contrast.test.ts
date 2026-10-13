// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// 옅은 코랄 글자(text-coral #D97757)는 밝은 바탕 위 3.12:1 이하라 작은 글자 AA(4.5:1)에 못 미친다.
// 밝은 바탕 위 정보 글자(오류·배너·필수·상태 문구)는 text-coral-deep, 위험·종료 동작(삭제·취소·로그아웃 등)은
// text-danger 를 쓰고, 아래 허용 목록의 예외만 남긴다.
// 파일별 건수까지 고정해 같은 파일에 옅은 코랄 글자가 새로 들어오는 것도, 예외가 사라지는 것도 잡는다.
// packages/ 는 사용 0건이라 범위 밖이다.
const WEB_ROOT = resolve(__dirname, '../..');
const SCANNED_DIRS = ['app', 'components'];
// 접두사(hover:·group-hover: 등)·하이픈 토큰(text-coral-deep)·투명도(text-coral/60)는 세지 않는다.
const BARE_CORAL_TEXT = /(?<![-:\w])text-coral(?![-\w/])/g;
// 상태·반응형·임의 변형 등 모든 접두사 — hover 순간의 글자도 같은 대비 기준이라 허용 목록 없이 0건이다.
const PREFIXED_CORAL_TEXT = /:text-coral(?![-\w/])/g;
// 흰 글자를 얹은 솔리드 코랄(3.12:1) — 위험 버튼은 .btn-danger(.btn 이 아니면 bg-danger)를 쓰고, 접두사 없는 bg-coral 은
// 글자 없는 점·막대와 범위 밖 배지만 남긴다. 접두사(hover: 등)로 칠하는 솔리드 코랄은 허용 목록 없이 0건이다.
// 투명도 50 이상(bg-coral/90 등)은 흰 글자를 얹으면 솔리드와 같아 함께 센다 — 옅은 틴트(/5·/10·/15)는 세지 않는다.
const BARE_SOLID_CORAL = /(?<![-:\w])bg-coral(?:\/(?:[5-9]\d|100))?(?![-\w/])/g;
const PREFIXED_SOLID_CORAL = /:bg-coral(?:\/(?:[5-9]\d|100))?(?![-\w/])/g;
// bg-danger 옆에 옛 코랄 hover(#c2603f 4.17:1·coral/90)가 남지 않게 한다 — hover 는 hover:bg-danger-hover.
const OLD_CORAL_HOVER = /c2603f|hover:bg-coral\/90/gi;

type AllowedMatch = { file: string; count: number; reason: string };

const ICON_ONLY = '아이콘만';
const DARK_SURFACE = '어두운 바탕';
// 흰 글자를 얹은 솔리드 코랄 배지(span) — 배지 색 결정이 따로 필요하다.
const BADGE = '배지(범위 밖)';
const DOT_OR_BAR = '점·막대(글자 없음)';
const CLOSING_SOON_TICKER = '마감 임박 티커(범위 밖)';

// 같은 파일에 사유가 둘이면 항목을 나눈다 — 건수는 파일별로 합산해 비교한다.
const ALLOWED_CORAL_TEXT: ReadonlyArray<AllowedMatch> = [
  { file: 'app/admin/facility-bookings/_components/BookingSummaryCards.tsx', count: 1, reason: DARK_SURFACE },
  { file: 'app/admin/facility-bookings/submission/_components/BatchBulkCreateResultDialog.tsx', count: 1, reason: ICON_ONLY },
  { file: 'app/clubs/_components/ClubCard.tsx', count: 1, reason: ICON_ONLY },
  { file: 'app/clubs/_components/ClubListItem.tsx', count: 1, reason: ICON_ONLY },
  { file: 'app/clubs/_pages/ClubExplorePage.tsx', count: 1, reason: ICON_ONLY },
];

const ALLOWED_SOLID_CORAL: ReadonlyArray<AllowedMatch> = [
  { file: 'app/_components/NotificationItem.tsx', count: 1, reason: DOT_OR_BAR },
  { file: 'app/_components/toast/ToastProvider.tsx', count: 1, reason: DOT_OR_BAR },
  { file: 'app/_lib/closingSoon.ts', count: 1, reason: CLOSING_SOON_TICKER },
  { file: 'app/admin/_components/AdminNavContent.tsx', count: 1, reason: BADGE },
  { file: 'app/admin/_components/AdminNavContent.tsx', count: 1, reason: DOT_OR_BAR },
  { file: 'app/admin/facility-bookings/_components/AdminBookingDetailModal.tsx', count: 1, reason: DOT_OR_BAR },
  { file: 'app/admin/facility-bookings/_components/AdminSlotStrip.tsx', count: 1, reason: BADGE },
  { file: 'app/admin/facility-bookings/_components/CrawlFreshnessChip.tsx', count: 1, reason: DOT_OR_BAR },
  { file: 'app/admin/facility-bookings/_pages/AdminFacilityBookingsPage.tsx', count: 1, reason: DOT_OR_BAR },
  { file: 'app/admin/inquiries/_pages/AdminInquiriesListPage.tsx', count: 1, reason: BADGE },
  { file: 'app/admin/promotions/_components/AdminPromotionForm.tsx', count: 1, reason: BADGE },
  { file: 'app/facilities/_components/booking/BookingCalendar.tsx', count: 1, reason: DOT_OR_BAR },
  { file: 'app/facilities/_lib/bookingCalendar.ts', count: 1, reason: DOT_OR_BAR },
  { file: 'app/manage/clubs/[clubId]/members/_components/MemberDetailPanel.tsx', count: 1, reason: DOT_OR_BAR },
  { file: 'app/manage/clubs/[clubId]/members/page.tsx', count: 1, reason: BADGE },
  { file: 'app/manage/clubs/[clubId]/recruitments/_components/ExternalRecruitmentActions.tsx', count: 1, reason: BADGE },
  { file: 'app/manage/clubs/[clubId]/recruitments/_components/MemberEnrollmentSection.tsx', count: 1, reason: BADGE },
  { file: 'app/me/_components/MyPageTabs.tsx', count: 1, reason: DOT_OR_BAR },
];

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(entryPath);
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

// 정규식으로 주석을 지우면 문자열 속 `/*`·URL 의 `//` 를 주석으로 오인해 뒤 코드를 삼킨다 — 컴파일러로 지운다.
function stripComments(source: string, fileName: string): string {
  return ts.transpileModule(source, {
    compilerOptions: { removeComments: true, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext },
    fileName,
  }).outputText;
}

// 주석 제거(transpile)는 파일마다 한 번만 하고 모든 검사가 재사용한다.
const STRIPPED_SOURCES = SCANNED_DIRS.flatMap((scannedDir) =>
  collectSourceFiles(join(WEB_ROOT, scannedDir)).map((filePath) => ({
    file: relative(WEB_ROOT, filePath),
    source: stripComments(readFileSync(filePath, 'utf8'), filePath),
  })),
);

function countMatchesByFile(pattern: RegExp): Map<string, number> {
  const countByFile = new Map<string, number>();
  for (const { file, source } of STRIPPED_SOURCES) {
    const matchCount = source.match(pattern)?.length ?? 0;
    if (matchCount > 0) countByFile.set(file, matchCount);
  }
  return countByFile;
}

function allowedCountByFile(allowedMatches: ReadonlyArray<AllowedMatch>): Map<string, number> {
  const countByFile = new Map<string, number>();
  for (const allowed of allowedMatches) {
    countByFile.set(allowed.file, (countByFile.get(allowed.file) ?? 0) + allowed.count);
  }
  return countByFile;
}

/** 실제·기대 건수가 다른 파일마다 한 줄 — 허용 목록이 없는 검사는 기대를 빈 Map(전 파일 0건)으로 둔다. */
function countMismatches(pattern: RegExp, expectedCountByFile: Map<string, number>): string[] {
  const actualCountByFile = countMatchesByFile(pattern);
  return [...new Set([...actualCountByFile.keys(), ...expectedCountByFile.keys()])]
    .sort()
    .filter((file) => actualCountByFile.get(file) !== expectedCountByFile.get(file))
    .map((file) => `${file}: 실제 ${actualCountByFile.get(file) ?? 0}건 / 기대 ${expectedCountByFile.get(file) ?? 0}건`);
}

describe('옅은 코랄 글자(text-coral) 회귀 가드', () => {
  it('주석은 세지 않고, 문자열 속 /* 나 // 가 뒤 코드를 삼키지 않는다', () => {
    const source = [
      "const pattern = '/clubs/*/member'; // text-coral",
      "const url = 'https://duings.com';",
      '/* text-coral */',
      'export const view = <p className="text-coral">{/* text-coral */}오류</p>;',
      '',
    ].join('\n');
    expect(stripComments(source, 'sample.tsx').match(BARE_CORAL_TEXT)?.length).toBe(1);
  });

  it('허용 목록 밖에서 text-coral 을 쓰지 않고, 목록 파일의 건수가 그대로다', () => {
    expect(countMismatches(BARE_CORAL_TEXT, allowedCountByFile(ALLOWED_CORAL_TEXT))).toEqual([]);
  });

  it('접두사를 붙인 text-coral(hover:text-coral 등)을 쓰지 않는다', () => {
    expect(countMismatches(PREFIXED_CORAL_TEXT, new Map())).toEqual([]);
  });
});

describe('솔리드 코랄(bg-coral) 위험 버튼 회귀 가드', () => {
  it('허용 목록 밖에서 접두사 없는 bg-coral 을 쓰지 않고, 목록 파일의 건수가 그대로다', () => {
    expect(countMismatches(BARE_SOLID_CORAL, allowedCountByFile(ALLOWED_SOLID_CORAL))).toEqual([]);
  });

  it('접두사를 붙인 bg-coral(hover:bg-coral 등)을 쓰지 않는다', () => {
    expect(countMismatches(PREFIXED_SOLID_CORAL, new Map())).toEqual([]);
  });

  it('옛 코랄 hover(#c2603f·hover:bg-coral/90)를 쓰지 않는다', () => {
    expect(countMismatches(OLD_CORAL_HOVER, new Map())).toEqual([]);
  });
});
