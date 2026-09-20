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
});
