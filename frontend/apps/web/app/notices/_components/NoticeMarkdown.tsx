'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = {
  content: string;
};

export function NoticeMarkdown({ content }: Props) {
  return (
    <div className="text-[14px] text-charcoal-1 leading-relaxed whitespace-pre-wrap [&_a]:text-ink [&_a]:underline [&_h1]:text-[18px] [&_h1]:font-bold [&_h2]:text-[16px] [&_h2]:font-bold [&_h3]:text-[15px] [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_h1]:mb-2 [&_h2]:mb-2 [&_h3]:mb-2 [&_li]:mb-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...rest }) => (
            <a {...rest} target="_blank" rel="noreferrer" />
          ),
        }}
      >{content}</ReactMarkdown>
    </div>
  );
}
