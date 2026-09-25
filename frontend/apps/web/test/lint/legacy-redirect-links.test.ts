// @vitest-environment node
import path from 'node:path';

import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

import nextConfig from '../../next.config.mjs';

// eslint.config.mjs 의 옛 리다이렉트 주소 가드(no-restricted-syntax)가 실제로 걸리는지 고정한다.
// 셀렉터 정규식은 esquery 문법 + JS 문자열 이스케이프가 겹쳐 조용히 아무것도 안 잡기 쉬워서, 걸려야 할 것과
// 걸리면 안 될 것(같은 접두의 API 경로·하위 라우트)을 모두 실제 린트로 확인한다.
const WEB_ROOT = path.resolve(__dirname, '../..');
const GUARDED_FILE = 'app/__legacy_link_guard__.tsx';

// 앱이 링크해도 되는 진입용 리다이렉트 — 옛 주소가 아니라서 가드 대상이 아니다.
const ENTRY_REDIRECT_SOURCES = new Set(['/clubs/:clubId/member']);

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: WEB_ROOT });
});

async function countLegacyLinkErrors(expression: string, filePath = GUARDED_FILE) {
  const code = [
    'const { id, batchId, y, qs, SITE_URL, origin, pathname } = globalThis;',
    `export const href = ${expression};`,
    '',
  ].join('\n');
  const results = await eslint.lintText(code, { filePath });
  const messages = results.flatMap((result) => result.messages);
  // 파싱 실패(fatal)·파일 무시 경고(ruleId null)면 규칙이 돌지 않은 것이라 "안 걸림" 으로 통과시키면 안 된다.
  expect(messages.filter((message) => message.fatal || message.ruleId === null)).toEqual([]);
  return messages.filter((message) => message.ruleId === 'no-restricted-syntax').length;
}

describe('옛 리다이렉트 주소 링크 린트 가드', () => {
  it.each([
    "'/facilities/1'",
    "'https://duings.com/facilities/1'",
    '`https://duings.com/facilities/1`',
    '`/facilities/${id}`',
    '`${SITE_URL}/facilities/${id}`',
    '`/facilities/1`',
    "'/facilities/' + id",
    "origin + '/facilities/' + id",
    "'https://duings.com/facilities/' + id",
    '<a href="/facilities/1" />',
    "'/admin/facility-crawl'",
    "'https://duings.com/admin/facility-crawl'",
    '`https://duings.com/admin/facility-crawl?x=${y}`',
    "'/admin/facility-bookings/submission'",
    "'/admin/facility-bookings/submission?x=1'",
    '`/admin/facility-crawl?x=${y}`',
    '`/admin/facility-crawl${qs}`',
    '`/admin/facility-crawl?x=1`',
    "'/admin/facility-crawl' + qs",
  ])('옛 주소 %s 는 걸린다(정확히 1회)', async (expression) => {
    expect(await countLegacyLinkErrors(expression)).toBe(1);
  });

  it.each([
    "'/facilities'",
    "'/facilities?facilityId=1'",
    "'/facilities/'",
    '`/facilities/`',
    "'/facilities/?facilityId=1'",
    '`/facilities/?facilityId=${id}`',
    "pathname.startsWith('/facilities/')",
    '`/admin/facility-bookings/submission/${batchId}`',
    "'/admin/facility-bookings/submission/' + batchId",
    "'/admin/facility-crawl/reservations'",
    "'/admin/facility-bookings?tab=crawl'",
  ])('현행 주소·경로 비교용 접두·하위 라우트·API 경로 %s 는 걸리지 않는다', async (expression) => {
    expect(await countLegacyLinkErrors(expression)).toBe(0);
  });

  it('app·components 밖 루트 ts(middleware.ts)에도 적용된다', async () => {
    expect(await countLegacyLinkErrors("'/facilities/1'", 'middleware.ts')).toBe(1);
  });

  it('ts·tsx 가 아닌 파일(루트 .mjs)에는 적용되지 않는다', async () => {
    expect(await countLegacyLinkErrors("'/facilities/1'", 'scratch.mjs')).toBe(0);
  });

  it('next.config redirects() 의 옛 주소마다 가드가 걸린다 — 두 목록의 동기화', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    const legacyPaths = redirects
      .map((redirect) => redirect.source)
      .filter((source) => !ENTRY_REDIRECT_SOURCES.has(source))
      .map((source) => source.replace(/:\w+(\([^)]*\))?[*+?]?/g, '1'));

    expect(legacyPaths.length).toBeGreaterThan(0);
    for (const legacyPath of legacyPaths) {
      expect(await countLegacyLinkErrors(`'${legacyPath}'`), legacyPath).toBe(1);
    }
  });
});
