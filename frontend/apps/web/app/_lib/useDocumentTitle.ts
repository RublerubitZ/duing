import { useEffect } from 'react';

/**
 * 정적 셸 상세 페이지(generateMetadata 금지)에서 데이터 도착 후 탭 제목만 갱신한다.
 * 라우트를 떠나면 다음 라우트의 metadata 가 <title> 을 다시 그리므로 복원하지 않는다.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title === null || title === '') return;
    document.title = `${title} | 두잉`;
  }, [title]);
}
