// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// 옅은 코랄 글자(text-coral #D97757)는 밝은 바탕 위 3.12:1 이하라 작은 글자 AA(4.5:1)에 못 미친다.
// 밝은 바탕 위 정보 글자(오류·배너·필수·상태 문구)는 text-coral-deep 을 쓰고, 아래 허용 목록의 예외만 남긴다.
// 파일별 건수까지 고정해 같은 파일에 옅은 코랄 정보 글자가 새로 들어오는 것도, 예외가 사라지는 것도 잡는다.
// packages/ 는 사용 0건이라 범위 밖이다.
const WEB_ROOT = resolve(__dirname, '../..');
const SCANNED_DIRS = ['app', 'components'];
// 접두사(hover:·group-hover: 등)·하이픈 토큰(text-coral-deep)·투명도(text-coral/60)는 세지 않는다.
const BARE_CORAL_TEXT = /(?<![-:\w])text-coral(?![-\w/])/g;

// 클릭 요소 자체(버튼·링크·메뉴 항목)의 액션 라벨 색 — danger 토큰·.btn-danger-quiet 와 역할 정리가 먼저라 보류.
const DANGER_PENDING = 'danger 정리 대기';
const ICON_ONLY = '아이콘만';
const DARK_SURFACE = '어두운 바탕';
// 24px+ 또는 18.66px+ 굵게 — 3:1 기준인데 크림 계열 위 미달이라 색 결정이 따로 필요하다.
const LARGE_FIGURE = '큰 금액·수치';
const CASHBOOK_AMOUNT = '장부 금액';

// 같은 파일에 사유가 둘이면 항목을 나눈다 — 건수는 파일별로 합산해 비교한다.
const ALLOWED_CORAL_TEXT: ReadonlyArray<{ file: string; count: number; reason: string }> = [
  { file: 'app/_components/NavDropdown.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/admin/bank-matching/_components/BankMatchingClubs.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/admin/clubs/[clubId]/join-codes/_components/AdminClubJoinCodesTable.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/admin/facility-bookings/_components/AdminBookingDetailModal.tsx', count: 2, reason: DANGER_PENDING },
  { file: 'app/admin/facility-bookings/_components/BookingSummaryCards.tsx', count: 1, reason: LARGE_FIGURE },
  { file: 'app/admin/facility-bookings/_components/BookingSummaryCards.tsx', count: 1, reason: DARK_SURFACE },
  { file: 'app/admin/facility-bookings/_tabs/SubmissionBatchesTab.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/admin/facility-bookings/submission/[batchId]/_pages/SubmissionBatchDetailPage.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/admin/facility-bookings/submission/_components/BatchBulkCreateResultDialog.tsx', count: 1, reason: ICON_ONLY },
  { file: 'app/admin/faqs/_components/FaqCategoryManager.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/admin/faqs/_pages/AdminFaqListPage.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/admin/global-events/_components/AdminGlobalEventTable.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/admin/notices/_components/AdminNoticesTable.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/admin/promotions/_components/AdminPromotionsTable.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/clubs/[clubId]/member/_components/ClubEventCard.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/clubs/[clubId]/member/_components/ClubNoticeCard.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/clubs/_components/ClubCard.tsx', count: 1, reason: ICON_ONLY },
  { file: 'app/clubs/_components/ClubListItem.tsx', count: 1, reason: ICON_ONLY },
  { file: 'app/clubs/_pages/ClubExplorePage.tsx', count: 1, reason: ICON_ONLY },
  { file: 'app/manage/clubs/[clubId]/fees/_components/BankReviewQueue.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/manage/clubs/[clubId]/fees/_components/BillList.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/manage/clubs/[clubId]/fees/_components/CashbookPanel.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/manage/clubs/[clubId]/fees/_components/CashbookPanel.tsx', count: 2, reason: CASHBOOK_AMOUNT },
  { file: 'app/manage/clubs/[clubId]/fees/_components/FeeAccountSection.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/manage/clubs/[clubId]/fees/_components/FeeSummaryCards.tsx', count: 1, reason: LARGE_FIGURE },
  { file: 'app/manage/clubs/[clubId]/fees/_components/PaymentHistory.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/manage/clubs/[clubId]/fees/_components/PolicyList.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/manage/clubs/[clubId]/members/_components/ClubInviteDialog.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/manage/clubs/[clubId]/members/_components/MemberDetailPanel.tsx', count: 2, reason: DANGER_PENDING },
  { file: 'app/manage/clubs/[clubId]/members/requests/_components/JoinRequestDetailPanel.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/rounds/new/_components/DraftResumeDialog.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/manage/clubs/[clubId]/recruitments/_components/MemberEnrollmentSection.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/manage/clubs/[clubId]/recruitments/_components/QuestionBuilder.tsx', count: 2, reason: DANGER_PENDING },
  { file: 'app/me/_components/MyFeeSummary.tsx', count: 1, reason: LARGE_FIGURE },
  { file: 'app/me/_components/SectionMyClubs.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/me/settings/_components/SessionListCard.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'app/me/settings/_pages/SettingsPage.tsx', count: 1, reason: DANGER_PENDING },
  { file: 'components/UserMenu.tsx', count: 1, reason: DANGER_PENDING },
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

function countBareCoralText(): Map<string, number> {
  const countByFile = new Map<string, number>();
  for (const scannedDir of SCANNED_DIRS) {
    for (const filePath of collectSourceFiles(join(WEB_ROOT, scannedDir))) {
      const matchCount = stripComments(readFileSync(filePath, 'utf8'), filePath).match(BARE_CORAL_TEXT)?.length ?? 0;
      if (matchCount > 0) countByFile.set(relative(WEB_ROOT, filePath), matchCount);
    }
  }
  return countByFile;
}

function allowedCountByFile(): Map<string, number> {
  const countByFile = new Map<string, number>();
  for (const allowed of ALLOWED_CORAL_TEXT) {
    countByFile.set(allowed.file, (countByFile.get(allowed.file) ?? 0) + allowed.count);
  }
  return countByFile;
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
    const actualCountByFile = countBareCoralText();
    const expectedCountByFile = allowedCountByFile();
    const mismatches = [...new Set([...actualCountByFile.keys(), ...expectedCountByFile.keys()])]
      .sort()
      .filter((file) => actualCountByFile.get(file) !== expectedCountByFile.get(file))
      .map((file) => `${file}: 실제 ${actualCountByFile.get(file) ?? 0}건 / 기대 ${expectedCountByFile.get(file) ?? 0}건`);
    expect(mismatches).toEqual([]);
  });
});
