// @vitest-environment node
import path from 'node:path';

import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// eslint.config.mjs 의 옛 리다이렉트 주소 가드(no-restricted-syntax)가 실제로 걸리는지 고정한다.
// 셀렉터 정규식은 esquery 문법 + JS 문자열 이스케이프가 겹쳐 조용히 아무것도 안 잡기 쉬워서, 걸려야 할 것과
// 걸리면 안 될 것(같은 접두의 API 경로·하위 라우트)을 모두 실제 린트로 확인한다.
const WEB_ROOT = path.resolve(__dirname, '../..');
const GUARDED_FILE = 'app/__legacy_link_guard__.tsx';

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: WEB_ROOT });
});

async function countLegacyLinkErrors(expression: string, filePath = GUARDED_FILE) {
  const code = [
    'declare const id: number;',
    'declare const batchId: number;',
    'declare const y: string;',
    `export const href = ${expression};`,
    '',
  ].join('\n');
  const results = await eslint.lintText(code, { filePath });
  return results
    .flatMap((result) => result.messages)
    .filter((message) => message.ruleId === 'no-restricted-syntax').length;
}

describe('옛 리다이렉트 주소 링크 린트 가드', () => {
  it.each([
    "'/facilities/1'",
    '`/facilities/${id}`',
    "'/admin/facility-crawl'",
    "'/admin/facility-bookings/submission'",
    "'/admin/facility-bookings/submission?x=1'",
    "'/facilities/' + id",
    '`/admin/facility-crawl?x=${y}`',
  ])('옛 주소 %s 는 걸린다', async (expression) => {
    expect(await countLegacyLinkErrors(expression)).toBe(1);
  });

  it.each([
    "'/facilities'",
    "'/facilities/'",
    "'/facilities?facilityId=1'",
    '`/admin/facility-bookings/submission/${batchId}`',
    "'/admin/facility-crawl/reservations'",
    "'/admin/facility-bookings?tab=crawl'",
  ])('현행 주소·하위 라우트·API 경로 %s 는 걸리지 않는다', async (expression) => {
    expect(await countLegacyLinkErrors(expression)).toBe(0);
  });

  it('app·components 밖(test/)에는 적용되지 않는다', async () => {
    expect(await countLegacyLinkErrors("'/facilities/1'", 'test/x.tsx')).toBe(0);
  });
});
