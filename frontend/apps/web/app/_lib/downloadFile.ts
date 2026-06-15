export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'text/csv;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Firefox 는 click 직후 동기 revoke 시 다운로드가 깨질 수 있어 다음 틱으로 미룬다.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
