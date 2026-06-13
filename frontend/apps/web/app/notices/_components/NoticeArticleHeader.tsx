'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { NoticeCategory } from '@duing/types';
import { NOTICE_CATEGORY_LABEL } from '../_lib/categoryLabels';
import { CATEGORY_TAG_STYLES } from '../_lib/categoryTagStyles';
import { formatPublishedDate, formatDdayLabel } from '../_lib/eventFormat';
import { Sparkle } from '../../_components/Sparkle';

type Props = {
  category: NoticeCategory;
  title: string;
  pinned: boolean;
  expiresAt: string | null;
  createdAt: string;
};

export function NoticeArticleHeader({ category, title, pinned, expiresAt, createdAt }: Props) {
  const tag = CATEGORY_TAG_STYLES[category];
  const dday = expiresAt ? formatDdayLabel(expiresAt) : null;
  const expired = expiresAt !== null && new Date(expiresAt).getTime() < Date.now();

  return (
    <header className="pt-7 pb-6 border-b border-line">
      <div className="flex items-center justify-between mb-5">
        <nav className="flex items-center gap-1.5 text-[13px] text-charcoal-3 whitespace-nowrap" aria-label="위치">
          <span>공지 · 소식</span>
          <ChevronRight size={14} aria-hidden />
          <span className="text-ink font-semibold">{NOTICE_CATEGORY_LABEL[category]}</span>
        </nav>
        <Link href="/notices" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-charcoal-2 hover:text-ink">
          <ArrowLeft size={15} aria-hidden /> 목록으로
        </Link>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span
          className="px-2.5 py-1 rounded-md text-[12px] font-bold"
          style={{ background: tag.bg, color: tag.fg }}
        >
          {NOTICE_CATEGORY_LABEL[category]}
        </span>
        {pinned && (
          <span className="px-2.5 py-1 rounded-md bg-ink text-paper text-[11.5px] font-bold">상단 고정</span>
        )}
        {dday && (
          <span className={`px-2.5 py-1 rounded-md text-[11.5px] font-bold ${expired ? 'bg-graysoft text-charcoal-3' : 'bg-sage-mist text-ink'}`}>
            {dday}
          </span>
        )}
      </div>

      <h1 className="text-[34px] leading-[1.25] flex items-start gap-2">
        <span>{title}</span>
        <Sparkle size={18} color="var(--sage)" className="mt-2 shrink-0" />
      </h1>

      <div className="flex items-center gap-3 mt-4">
        <span className="grid place-items-center w-9 h-9 rounded-full bg-ink text-paper text-[11px] font-bold shrink-0 font-mono tracking-[0.08em]">DU</span>
        <div className="flex flex-col">
          <span className="text-[13.5px] font-bold text-ink-deep">두잉 공지</span>
          <span className="text-[12px] text-charcoal-3">{NOTICE_CATEGORY_LABEL[category]} 채널</span>
        </div>
        <span className="w-px h-7 bg-line mx-1" />
        <span className="font-mono text-[12.5px] text-charcoal-3">{formatPublishedDate(createdAt)}</span>
      </div>
    </header>
  );
}
