import type { KeyboardEvent } from 'react';

// 긴 폼에서 입력·select 의 Enter 가 폼을 제출(암묵적 제출)하면 실수로 저장되고 결과 문구가 화면 밖일 수 있다 — 저장은 버튼으로만.
export function preventEnterSubmit(event: KeyboardEvent<HTMLFormElement>): void {
  if (event.key !== 'Enter') return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) event.preventDefault();
}
