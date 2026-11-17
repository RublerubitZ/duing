import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { preventEnterSubmit } from '@/app/_lib/preventEnterSubmit';

function renderForm() {
  render(
    <form onKeyDown={preventEnterSubmit}>
      <input aria-label="한 줄 입력" />
      <input type="radio" aria-label="라디오" />
      <select aria-label="목록">
        <option>하나</option>
      </select>
      <textarea aria-label="여러 줄 입력" />
      <button type="button">버튼</button>
      <div data-testid="editor-body" contentEditable />
    </form>,
  );
}

// fireEvent.keyDown 은 기본 동작이 막히면 false 를 돌려준다.
const pressEnter = (element: Element) => fireEvent.keyDown(element, { key: 'Enter' });

const setPlatform = (platform: string) => vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform);

describe('preventEnterSubmit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('macOS 에서는 input 과 select 의 Enter 의 기본 동작(폼 제출)을 막는다', () => {
    setPlatform('MacIntel');
    renderForm();
    expect(pressEnter(screen.getByLabelText('한 줄 입력'))).toBe(false);
    expect(pressEnter(screen.getByLabelText('라디오'))).toBe(false);
    expect(pressEnter(screen.getByLabelText('목록'))).toBe(false);
  });

  it('Windows 에서는 input 의 Enter 는 막고, 목록을 여는 select 의 Enter 는 막지 않는다', () => {
    setPlatform('Win32');
    renderForm();
    expect(pressEnter(screen.getByLabelText('한 줄 입력'))).toBe(false);
    expect(pressEnter(screen.getByLabelText('라디오'))).toBe(false);
    expect(pressEnter(screen.getByLabelText('목록'))).toBe(true);
  });

  it('textarea·button·편집 영역(div)의 Enter 는 막지 않는다', () => {
    renderForm();
    expect(pressEnter(screen.getByLabelText('여러 줄 입력'))).toBe(true);
    expect(pressEnter(screen.getByRole('button', { name: '버튼' }))).toBe(true);
    expect(pressEnter(screen.getByTestId('editor-body'))).toBe(true);
  });

  it('Enter 가 아닌 키는 막지 않는다', () => {
    // select 를 막는 플랫폼에서 봐야 select 쪽 단언이 의미가 있다.
    setPlatform('MacIntel');
    renderForm();
    for (const element of [screen.getByLabelText('한 줄 입력'), screen.getByLabelText('목록')]) {
      for (const key of ['a', 'Tab', ' ', 'ArrowDown']) {
        expect(fireEvent.keyDown(element, { key })).toBe(true);
      }
    }
  });
});
