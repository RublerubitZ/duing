import { afterEach, describe, expect, it } from 'vitest';

import { startedOnClosingLayer } from '@/app/_lib/closingLayerTap';

afterEach(() => {
  document.body.replaceChildren();
});

// Radix Dialog 콘텐츠처럼 role·data-state 를 단 레이어 안에 버튼을 붙인다.
function mountInLayer(attributes: Record<string, string>): HTMLButtonElement {
  const layer = document.createElement('div');
  for (const [name, value] of Object.entries(attributes)) layer.setAttribute(name, value);
  const button = document.createElement('button');
  button.textContent = '취소';
  layer.append(button);
  document.body.append(layer);
  return button;
}

describe('startedOnClosingLayer', () => {
  it('Node 가 아닌 대상(null·window)은 닫히는 레이어로 보지 않는다', () => {
    expect(startedOnClosingLayer(null)).toBe(false);
    expect(startedOnClosingLayer(window)).toBe(false);
  });

  it('document 노드는 닫히는 레이어로 보지 않는다', () => {
    expect(startedOnClosingLayer(document)).toBe(false);
  });

  it('붙어 있는 일반 요소는 닫히는 레이어로 보지 않는다', () => {
    const button = document.createElement('button');
    document.body.append(button);

    expect(startedOnClosingLayer(button)).toBe(false);
  });

  it('열린 다이얼로그 안은 닫히는 레이어로 보지 않는다', () => {
    const button = mountInLayer({ role: 'dialog', 'data-state': 'open' });

    expect(startedOnClosingLayer(button)).toBe(false);
  });

  it('data-state 가 없는 다이얼로그 안은 닫히는 레이어로 보지 않는다', () => {
    const button = mountInLayer({ role: 'dialog' });

    expect(startedOnClosingLayer(button)).toBe(false);
  });

  // 대상 특정성 — "문서 어딘가에 닫히는 다이얼로그가 있으면 막기"로 넓어지면 그 동안 모든 진짜 바깥 탭이 먹힌다.
  it('문서에 닫히는 다이얼로그가 붙어 있어도 그 밖에 붙은 요소는 닫히는 레이어로 보지 않는다', () => {
    mountInLayer({ role: 'dialog', 'data-state': 'closed' });
    const outsideButton = document.createElement('button');
    document.body.append(outsideButton);

    expect(startedOnClosingLayer(outsideButton)).toBe(false);
  });

  it('닫히는 다이얼로그 안의 버튼·텍스트 노드는 닫히는 레이어로 본다', () => {
    const button = mountInLayer({ role: 'dialog', 'data-state': 'closed' });
    const label = button.firstChild;

    expect(label?.nodeType).toBe(Node.TEXT_NODE);
    expect(startedOnClosingLayer(button)).toBe(true);
    expect(startedOnClosingLayer(label)).toBe(true);
  });

  it('닫히는 alertdialog 안은 닫히는 레이어로 본다', () => {
    const button = mountInLayer({ role: 'alertdialog', 'data-state': 'closed' });

    expect(startedOnClosingLayer(button)).toBe(true);
  });

  it('DOM 에서 떼어 낸 요소는 닫히는 레이어로 본다', () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.remove();

    expect(startedOnClosingLayer(button)).toBe(true);
  });
});
