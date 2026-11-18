// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// jsdom 은 @media print 를 계산하지 않는다 — 전역 인쇄 규칙의 모양을 글자로 고정하고, 실제 인쇄 결과는 Task 16 브라우저 QA 가 본다.
const GLOBALS_CSS = readFileSync(join(__dirname, '../../app/globals.css'), 'utf8');
const RECEIPT_PRINT_BLOCK = GLOBALS_CSS.slice(GLOBALS_CSS.indexOf('@media print'), GLOBALS_CSS.indexOf('.no-print', GLOBALS_CSS.indexOf('@media print')));

describe('전역 인쇄 규칙', () => {
  it('영수증 숨김 줄은 .receipt-sheet 가 있는 화면에서만, 명시도 0 으로 건다 — 다른 화면의 인쇄가 빈 종이가 되지 않는다', () => {
    expect(RECEIPT_PRINT_BLOCK).toContain(':where(body:has(.receipt-sheet)) * {');
    expect(RECEIPT_PRINT_BLOCK).not.toMatch(/^\s*body \* \{/m);
    // body:has(...) 를 :where 없이 쓰면 명시도 (0,1,1) 이 .receipt-sheet *(0,1,0) 을 이겨 영수증까지 숨긴다.
    expect(RECEIPT_PRINT_BLOCK).not.toMatch(/^\s*body:has\(\.receipt-sheet\) \* \{/m);
    expect(RECEIPT_PRINT_BLOCK).toContain('.receipt-sheet *');
  });
});
