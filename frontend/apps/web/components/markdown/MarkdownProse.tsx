'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/app/_lib/cn';

type Props = {
  content: string;
  className?: string;
};

/**
 * 모집 안내문 등 사용자 작성 Markdown 의 공용 렌더러(제목·리스트·강조·링크 수준).
 * react-markdown 은 raw HTML 을 이스케이프하므로 dangerouslySetInnerHTML 없이 안전하다.
 * 공지(NoticeMarkdown)는 자체 스케일을 유지한다 — 이 컴포넌트는 본문 14px 스케일.
 */
export function MarkdownProse({ content, className }: Props) {
  return (
    <div
      className={cn(
        'whitespace-pre-wrap text-sm leading-[1.75] text-charcoal-2 [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-charcoal-3 [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[16px] [&_h2]:font-bold [&_h2]:text-ink-deep [&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-[14.5px] [&_h3]:font-bold [&_h3]:text-ink-deep [&_li]:mb-1 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_strong]:font-bold [&_strong]:text-ink-deep [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-unused-vars -- react-markdown 의 node prop 은 DOM 으로 전파 금지
          a: ({ node: _node, ...rest }) => <a {...rest} target="_blank" rel="noreferrer" />,
        }}
      >{content}</ReactMarkdown>
    </div>
  );
}
