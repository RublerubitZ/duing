'use client';

import { NoticeMarkdown } from '../../../notices/_components/NoticeMarkdown';

type Props = {
  value: string;
  onChange: (next: string) => void;
};

export function NoticeMarkdownEditor({ value, onChange }: Props) {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={16}
        placeholder="마크다운 본문을 입력하세요"
        className="px-3.5 py-2.5 rounded-xl border border-line bg-paper text-[13.5px] leading-relaxed resize-y font-mono"
      />
      <div className="rounded-xl border border-line bg-paper px-3.5 py-2.5 overflow-auto">
        {value.trim() ? (
          <NoticeMarkdown content={value} />
        ) : (
          <p className="text-charcoal-3 text-[13px]">미리보기 영역</p>
        )}
      </div>
    </div>
  );
}