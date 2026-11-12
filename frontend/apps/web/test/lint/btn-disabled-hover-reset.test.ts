// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// `.btn:disabled` 는 딤 처리만 하고, 변형별 hover 효과는 각 변형이 `:disabled:hover` 로 되돌린다(globals.css 주석의 약속).
// 되돌림이 빠진 변형은 꺼진 버튼 위에서도 hover 틴트가 떠 눌릴 것처럼 보인다(#1685 초안 창의 [폐기하고 새로 만들기]).
// btn-ghost 도 같은 틈이 있지만 공용 창 취소 버튼 다수의 모양이 함께 바뀌어 이 변경에 넣지 않고 따로 다룬다.
const GLOBALS_CSS = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf-8');

describe('버튼 변형의 비활성 hover 되돌림', () => {
  it.each(['btn-primary', 'btn-secondary', 'btn-danger', 'btn-danger-quiet'])('%s 는 비활성일 때 hover 효과를 되돌린다', (variant) => {
    expect(GLOBALS_CSS).toMatch(new RegExp(`\\.${variant}:disabled:hover\\s*\\{`));
  });

  it('btn-danger-quiet 의 비활성 hover 는 배경을 투명으로 둔다', () => {
    expect(GLOBALS_CSS).toMatch(/\.btn-danger-quiet:disabled:hover\s*\{\s*@apply bg-transparent;\s*\}/);
  });
});
