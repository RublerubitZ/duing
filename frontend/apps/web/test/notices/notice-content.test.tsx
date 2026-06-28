import { render, screen, fireEvent, createEvent } from '@testing-library/react';
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

  it('본문 이미지를 탭하면 그 이미지로 라이트박스가 열리고, 닫은 뒤 다른 이미지를 탭하면 전환된다', () => {
    render(
      <NoticeContent
        format="HTML"
        content={'<p><img src="https://cdn.test/a.jpg" alt="A" /><img src="https://cdn.test/b.jpg" alt="B" /></p>'}
      />,
    );
    const first = screen.getByAltText('A');
    const second = screen.getByAltText('B');

    fireEvent.pointerDown(first, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(first, { clientX: 0, clientY: 0 });
    expect(screen.getByTestId('notice-lightbox-image')).toHaveAttribute('src', 'https://cdn.test/a.jpg');

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    fireEvent.pointerDown(second, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(second, { clientX: 0, clientY: 0 });
    expect(screen.getByTestId('notice-lightbox-image')).toHaveAttribute('src', 'https://cdn.test/b.jpg');
  });

  it('이미지에서 시작해도 이동량이 크면(스크롤 제스처) 라이트박스가 열리지 않는다', () => {
    render(
      <NoticeContent format="HTML" content={'<p><img src="https://cdn.test/a.jpg" alt="A" /></p>'} />,
    );
    const image = screen.getByAltText('A');

    fireEvent.pointerDown(image, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(image, { clientX: 200, clientY: 200 });
    expect(screen.queryByTestId('notice-lightbox-image')).not.toBeInTheDocument();
  });

  it('본문 텍스트(이미지 아님)를 탭하면 라이트박스가 열리지 않는다', () => {
    render(
      <NoticeContent format="HTML" content={'<p>본문 텍스트</p>'} />,
    );
    const paragraph = screen.getByText('본문 텍스트');

    fireEvent.pointerDown(paragraph, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(paragraph, { clientX: 0, clientY: 0 });
    expect(screen.queryByTestId('notice-lightbox-image')).not.toBeInTheDocument();
  });

  it('<a> 로 감싼 본문 이미지는 탭 시 링크 이동 대신 라이트박스가 열린다', () => {
    render(
      <NoticeContent
        format="HTML"
        content={'<p><a href="https://ext.example.com"><img src="https://cdn.test/c.jpg" alt="C" /></a></p>'}
      />,
    );
    const image = screen.getByAltText('C');

    const clickEvent = createEvent.click(image);
    fireEvent(image, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);

    fireEvent.pointerDown(image, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(image, { clientX: 0, clientY: 0 });
    expect(screen.getByTestId('notice-lightbox-image')).toHaveAttribute('src', 'https://cdn.test/c.jpg');
  });

  it('pointercancel 로 취소된 제스처는 이어진 pointerup 에서 라이트박스를 열지 않는다', () => {
    render(
      <NoticeContent format="HTML" content={'<p><img src="https://cdn.test/a.jpg" alt="A" /></p>'} />,
    );
    const image = screen.getByAltText('A');

    fireEvent.pointerDown(image, { clientX: 0, clientY: 0 });
    fireEvent.pointerCancel(image);
    fireEvent.pointerUp(image, { clientX: 0, clientY: 0 });
    expect(screen.queryByTestId('notice-lightbox-image')).not.toBeInTheDocument();
  });
});
