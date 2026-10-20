import { describe, expect, it } from 'vitest';

import { opensInputUiOnFocus } from '@/app/_lib/overlayFocusReturn';

/**
 * 시트·다이얼로그가 닫힐 때 되돌리지 않는 자리 — 포커스를 받으면 키보드·피커를 띄울 수 있는 입력 요소.
 * 공용 래퍼 동작은 test/components/overlay-focus-return.test.tsx 가 본다.
 */
function inputOfType(type: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  return input;
}

// jsdom 29 미구현 — isContentEditable 이 없어(undefined) 브라우저가 돌려줄 값을 메운다.
function withContentEditable(element: HTMLElement, editable: boolean): HTMLElement {
  Object.defineProperty(element, 'isContentEditable', { value: editable });
  return element;
}

describe('opensInputUiOnFocus', () => {
  it.each(['text', 'search', 'email', 'password', 'number', 'date'])('%s input 은 true', (type) => {
    expect(opensInputUiOnFocus(inputOfType(type))).toBe(true);
  });

  it.each(['button', 'checkbox', 'radio', 'submit'])('%s input 은 false', (type) => {
    expect(opensInputUiOnFocus(inputOfType(type))).toBe(false);
  });

  it.each(['textarea', 'select'])('%s 는 true', (tagName) => {
    expect(opensInputUiOnFocus(document.createElement(tagName))).toBe(true);
  });

  it('contenteditable div 는 true', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');

    expect(opensInputUiOnFocus(withContentEditable(editable, true))).toBe(true);
  });

  it.each(['button', 'a', 'h2'])('%s 는 false', (tagName) => {
    const element = withContentEditable(document.createElement(tagName), false);

    expect(opensInputUiOnFocus(element)).toBe(false);
  });
});
