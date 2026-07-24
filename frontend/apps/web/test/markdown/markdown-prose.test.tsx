import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MarkdownProse } from '@/components/markdown/MarkdownProse';

describe('MarkdownProse', () => {
  it('제목·리스트·강조·링크 Markdown 을 렌더한다', () => {
    render(
      <MarkdownProse content={'## 모집 안내\n\n- 4주 세미나\n- **팀 프로젝트**\n\n[동아리 소개](https://example.com)'} />,
    );
    expect(screen.getByRole('heading', { level: 2, name: '모집 안내' })).toBeInTheDocument();
    expect(screen.getByText('4주 세미나')).toBeInTheDocument();
    expect(screen.getByText('팀 프로젝트').tagName).toBe('STRONG');
    const link = screen.getByRole('link', { name: '동아리 소개' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('raw HTML 은 이스케이프된다(react-markdown 기본 동작 가드)', () => {
    render(<MarkdownProse content={'<img src=x onerror=alert(1)>안전'} />);
    expect(document.querySelector('img')).toBeNull();
  });
});
