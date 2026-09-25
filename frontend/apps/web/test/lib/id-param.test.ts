import { describe, expect, it } from 'vitest';

import { parsePositiveIdParam } from '@/app/_lib/idParam';

describe('parsePositiveIdParam — 라우트 경로의 숫자 id 세그먼트 판정', () => {
  it.each([
    ['1', 1],
    ['12', 12],
    ['9007199254740991', 9007199254740991],
  ])('양의 안전 정수 %s 는 숫자로 돌려준다', (raw, expected) => {
    expect(parsePositiveIdParam(raw)).toBe(expected);
  });

  // Number() 는 '012'·'1e1'·'0x1f'·' 12' 를 숫자로 읽어 버려서, 어떤 실제 id 도 아닌 주소가 통과한다.
  it.each([
    '',
    '0',
    '012',
    '-1',
    '1.5',
    '1e1',
    '0x1f',
    '+12',
    ' 12',
    '12 ',
    '%31%32',
    'abc',
    '9007199254740992',
  ])('형식이 틀린 %j 는 null 이다', (raw) => {
    expect(parsePositiveIdParam(raw)).toBeNull();
  });
});
