import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../app/notices/_components/NoticeMarkdown', () => ({
  NoticeMarkdown: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

import { NoticeContent } from '../../app/notices/_components/NoticeContent';

describe('NoticeContent', () => {
  it('HTML 포맷은 sanitize 된 마크업을 렌더하고 script 를 제거한다', () => {
    const { container } = render(
      <NoticeContent format="HTML" content={'<p>본문</p><script>alert(1)</script>'} />,
    );
    expect(container.querySelector('p')?.textContent).toBe('본문');
    expect(container.querySelector('script')).toBeNull();
  });

  it('MARKDOWN 포맷은 NoticeMarkdown 에 위임한다', () => {
    render(<NoticeContent format="MARKDOWN" content={'## 제목'} />);
    expect(screen.getByTestId('markdown')).toHaveTextContent('## 제목');
  });

  it('format 이 없으면(백엔드 미배포) HTML 로 렌더한다 — 태그를 문자열로 노출하지 않는다', () => {
    const { container } = render(
      <NoticeContent content={'<h2>제목</h2><p><strong>굵게</strong></p>'} />,
    );
    expect(container.querySelector('h2')?.textContent).toBe('제목');
    expect(container.querySelector('strong')?.textContent).toBe('굵게');
    expect(screen.queryByTestId('markdown')).toBeNull();
  });
});
