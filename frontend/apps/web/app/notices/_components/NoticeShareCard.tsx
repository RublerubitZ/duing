'use client';

import { useState } from 'react';
import { Link2 } from 'lucide-react';

export function NoticeShareCard() {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <div className="text-[12.5px] font-bold text-charcoal-3 mb-3">공유하기</div>
      <button
        type="button"
        onClick={copyLink}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-graysoft text-charcoal-2 text-[13px] font-semibold hover:bg-sage-tint hover:text-ink transition"
      >
        <Link2 size={15} aria-hidden />
        {copied ? '링크 복사됨' : '링크 복사'}
      </button>
    </div>
  );
}
