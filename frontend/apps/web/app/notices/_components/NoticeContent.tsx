import type { NoticeContentFormat } from '@duing/types';
import { NoticeMarkdown } from './NoticeMarkdown';
import { sanitizeNoticeHtml } from '../_lib/sanitizeHtml';

const PROSE_CLASS = 'text-[16px] leading-[1.85] text-charcoal [&_p]:mb-4 [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_h2]:text-[21px] [&_h2]:font-bold [&_h2]:text-ink-deep [&_h2]:mt-9 [&_h2]:mb-3 [&_h2]:pl-3 [&_h2]:border-l-[3px] [&_h2]:border-sage [&_h3]:text-[17px] [&_h3]:font-bold [&_h3]:text-ink-deep [&_h3]:mt-6 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_li]:mb-1.5 [&_img]:w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-4 [&_blockquote]:text-charcoal-2';

type Props = {
  content: string;
  // 백엔드가 content_format 을 아직 안 내려주는 환경에서는 undefined 일 수 있다.
  format?: NoticeContentFormat;
};

export function NoticeContent({ content, format }: Props) {
  // 본문 에디터 출력은 항상 HTML 이므로 HTML 을 기본으로 렌더한다.
  // 명시적으로 MARKDOWN 인 공지(레거시·동아리 평문)만 react-markdown 으로 위임한다.
  if (format === 'MARKDOWN') {
    return <NoticeMarkdown content={content} />;
  }
  return (
    <div
      className={PROSE_CLASS}
      // eslint-disable-next-line react/no-danger -- sanitizeNoticeHtml 로 allowlist sanitize 후 렌더
      dangerouslySetInnerHTML={{ __html: sanitizeNoticeHtml(content) }}
    />
  );
}
