import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDocumentTitle } from '@/app/_lib/useDocumentTitle';

function Probe({ title }: { title: string | null }) {
  useDocumentTitle(title);
  return null;
}

describe('useDocumentTitle', () => {
  it('값이 있으면 document.title 을 "값 | 두잉" 으로 바꾸고, null 이면 건드리지 않는다', () => {
    document.title = '두잉 | 대구대학교 동아리 플랫폼';
    const { rerender } = render(<Probe title={null} />);
    expect(document.title).toBe('두잉 | 대구대학교 동아리 플랫폼');
    rerender(<Probe title="다섯손가락" />);
    expect(document.title).toBe('다섯손가락 | 두잉');
  });

  it('언마운트 때 제목이 자기가 쓴 값이면 직전 제목으로 되돌린다 — 인터셉트 상세에서 목록으로 돌아올 때(스펙 P1 §3.6)', () => {
    document.title = '동아리 탐색 | 두잉';
    const { rerender, unmount } = render(<Probe title={null} />);
    rerender(<Probe title="다섯손가락" />);
    expect(document.title).toBe('다섯손가락 | 두잉');

    unmount();
    expect(document.title).toBe('동아리 탐색 | 두잉');
  });

  it('그 사이 다른 값으로 바뀌었으면(다음 라우트 head 가 먼저 그림) 정리 때 그대로 둔다', () => {
    document.title = '동아리 탐색 | 두잉';
    const { unmount } = render(<Probe title="다섯손가락" />);
    document.title = '마이페이지 | 두잉';

    unmount();
    expect(document.title).toBe('마이페이지 | 두잉');
  });

  it('값이 바뀌면 앞 값의 정리가 먼저 직전 제목으로 되돌리고 새 값이 그 제목을 다시 기억한다 — 상세→상세', () => {
    document.title = '동아리 탐색 | 두잉';
    const { rerender, unmount } = render(<Probe title="다섯손가락" />);
    rerender(<Probe title="두잉 코딩" />);
    expect(document.title).toBe('두잉 코딩 | 두잉');

    unmount();
    expect(document.title).toBe('동아리 탐색 | 두잉');
  });
});
