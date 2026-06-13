import type { NoticeContentFormat } from '@duing/types';
import { NoticeMarkdown } from './NoticeMarkdown';
import { sanitizeNoticeHtml } from '../_lib/sanitizeHtml';

const PROSE_CLASS = 'text-[16px] leading-[1.85] text-charcoal [&_p]:mb-4 [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_h2]:text-[21px] [&_h2]:font-bold [&_h2]:text-ink-deep [&_h2]:mt-9 [&_h2]:mb-3 [&_h2]:pl-3 [&_h2]:border-l-[3px] [&_h2]:border-sage [&_h3]:text-[17px] [&_h3]:font-bold [&_h3]:text-ink-deep [&_h3]:mt-6 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_li]:mb-1.5 [&_img]:w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-4 [&_blockquote]:text-charcoal-2';

type Props = {
  content: string;
  format: NoticeContentFormat;
};

export function NoticeContent({ content, format }: Props) {
  if (format === 'HTML') {
    return (
      <div
        className={PROSE_CLASS}
        // eslint-disable-next-line react/no-danger -- sanitizeNoticeHtml 로 allowlist sanitize 후 렌더
        dangerouslySetInnerHTML={{ __html: sanitizeNoticeHtml(content) }}
      />
    );
  }
  return <NoticeMarkdown content={content} />;
}
