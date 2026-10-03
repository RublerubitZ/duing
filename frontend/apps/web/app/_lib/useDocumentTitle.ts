import { useEffect } from 'react';

/**
 * 데이터 도착 후 탭 제목을 `… | 두잉` 으로 맞춘다 — 서버 메타데이터가 제목을 붙이지 못한 렌더(셸)를 덮는다.
 * 라우트를 떠나면 다음 라우트의 metadata 가 <title> 을 다시 그리므로 복원하지 않는다.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title === null || title === '') return;
    document.title = `${title} | 두잉`;
  }, [title]);
}
