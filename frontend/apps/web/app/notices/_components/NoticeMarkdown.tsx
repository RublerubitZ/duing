'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = {
  content: string;
};

export function NoticeMarkdown({ content }: Props) {
  return (
    <div className="text-[16px] leading-[1.85] text-charcoal whitespace-pre-wrap [&_p]:mb-4 [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_h2]:text-[21px] [&_h2]:font-bold [&_h2]:text-ink-deep [&_h2]:mt-9 [&_h2]:mb-3 [&_h2]:pl-3 [&_h2]:border-l-[3px] [&_h2]:border-sage [&_h3]:text-[17px] [&_h3]:font-bold [&_h3]:text-ink-deep [&_h3]:mt-6 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_li]:mb-1.5 [&_img]:w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-4 [&_blockquote]:text-charcoal-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-unused-vars -- react-markdown 의 node prop 은 DOM 으로 전파 금지
          a: ({ node: _node, ...rest }) => (
            <a {...rest} target="_blank" rel="noreferrer" />
          ),
        }}
      >{content}</ReactMarkdown>
    </div>
  );
}
