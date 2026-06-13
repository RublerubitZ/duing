import { ExternalLink } from 'lucide-react';
import type { NoticeCategory } from '@duing/types';
import { NOTICE_CATEGORY_LABEL } from '../_lib/categoryLabels';
import { formatPublishedDate, formatDdayLabel } from '../_lib/eventFormat';
import { safeExternalHref } from '../../_lib/route';

type Props = {
  category: NoticeCategory;
  createdAt: string;
  expiresAt: string | null;
  tags: string[];
  linkUrl: string | null;
};

export function NoticeMetaCard({ category, createdAt, expiresAt, tags, linkUrl }: Props) {
  const rows: { label: string; value: string }[] = [
    { label: '분류', value: NOTICE_CATEGORY_LABEL[category] },
    { label: '게시일', value: formatPublishedDate(createdAt) },
  ];
  if (expiresAt) rows.push({ label: '마감', value: `${formatPublishedDate(expiresAt)} · ${formatDdayLabel(expiresAt)}` });

  const safeLink = safeExternalHref(linkUrl);

  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <div className="text-[12.5px] font-bold text-charcoal-3 mb-4">공지 정보</div>
      <dl className="flex flex-col gap-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <dt className="text-[12px] font-semibold text-charcoal-3">{row.label}</dt>
            <dd className="text-[13.5px] font-semibold text-ink-deep">{row.value}</dd>
          </div>
        ))}
      </dl>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-dashed border-line">
          {tags.map((tag) => (
            <span key={tag} className="px-2 py-1 rounded-full bg-sage-mist text-ink text-[11.5px] font-semibold">#{tag}</span>
          ))}
        </div>
      )}
      {safeLink && (
        <a
          href={safeLink}
          target="_blank"
          rel="noreferrer"
          className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-ink text-paper text-[13px] font-semibold"
        >
          <ExternalLink size={15} aria-hidden /> 원문 보기
        </a>
      )}
    </div>
  );
}
