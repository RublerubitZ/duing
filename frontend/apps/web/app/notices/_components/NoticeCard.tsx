import Link from 'next/link';
import type { NoticeCardItem } from '@duing/types';
import { ImageWithFallback } from '../../_components/ImageWithFallback';
import { NOTICE_CATEGORY_LABEL } from '../_lib/categoryLabels';

type Props = {
  notice: NoticeCardItem;
};

export function NoticeCard({ notice }: Props) {
  const dateText = new Date(notice.createdAt).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  return (
    <Link
      href={`/notices/${notice.id}`}
      className="group block rounded-2xl overflow-hidden bg-paper border border-line hover:border-ink transition-colors"
    >
      <div className="relative">
        <ImageWithFallback
          src={notice.coverImageUrl}
          alt={notice.title}
          className="aspect-[16/9]"
        />
        {notice.pinned && (
          <span
            aria-label="고정"
            className="absolute top-2 right-2 grid place-items-center w-7 h-7 rounded-full bg-paper/90 text-[13px]"
          >📌</span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2 py-0.5 rounded-full bg-graysoft text-charcoal-2 text-[11px] font-semibold">
            {NOTICE_CATEGORY_LABEL[notice.category]}
          </span>
          {notice.linkUrl && (
            <span aria-label="외부 링크" className="text-charcoal-3 text-xs">↗</span>
          )}
        </div>
        <h3 className="text-[15px] font-bold text-ink leading-snug line-clamp-2">{notice.title}</h3>
        <p className="mt-1 text-[13px] text-charcoal-2 leading-relaxed line-clamp-2">{notice.summary}</p>
        <p className="mt-3 text-[11.5px] text-charcoal-3">{dateText}</p>
      </div>
    </Link>
  );
}
