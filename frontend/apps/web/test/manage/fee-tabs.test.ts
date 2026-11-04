// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseFeeTab, parseInitialBillStatus } from '@/app/manage/clubs/[clubId]/fees/_lib/feeTabs';

describe('parseFeeTab', () => {
  it.each(['policy', 'bill', 'account', 'bank', 'cashbook'] as const)('%s 는 그대로', (tab) => {
    expect(parseFeeTab(tab)).toBe(tab);
  });

  it('모르는 값·배열·없음은 정책 탭', () => {
    expect(parseFeeTab('ledger')).toBe('policy');
    expect(parseFeeTab(['bill', 'bank'])).toBe('policy');
    expect(parseFeeTab(undefined)).toBe('policy');
  });
});

describe('parseInitialBillStatus', () => {
  it('청구 탭에서 FeeStatus 값만 받는다', () => {
    expect(parseInitialBillStatus('bill', 'OVERDUE')).toBe('OVERDUE');
    expect(parseInitialBillStatus('bill', 'overdue')).toBe('');
    expect(parseInitialBillStatus('bill', ['OVERDUE'])).toBe('');
    expect(parseInitialBillStatus('bill', undefined)).toBe('');
  });

  it('청구 탭이 아니면 무시한다', () => {
    expect(parseInitialBillStatus('bank', 'OVERDUE')).toBe('');
  });
});

// 서버 페이지(fees/page.tsx)가 이 모듈을 import 한다 — 'use client' 가 붙으면 서버에서 클라이언트 참조가 되어
// 요청 시점에 회비 관리가 깨지는데 vitest·typecheck·build 로는 안 잡힌다. 파일 내용으로 고정한다.
describe('feeTabs 모듈', () => {
  it('클라이언트 지시문이 없다', () => {
    const source = readFileSync(
      resolve(__dirname, '../../app/manage/clubs/[clubId]/fees/_lib/feeTabs.ts'),
      'utf8',
    );
    // 지시문 줄만 본다 — 주석 속 언급은 걸리지 않게.
    expect(source).not.toMatch(/^\s*['"]use client['"];?\s*$/m);
  });
});
