'use client';

import { useRouter } from 'next/navigation';
import type { NoticeCategory } from '@duing/types';
import { NOTICE_CATEGORY_LABEL } from '../_lib/categoryLabels';

type Props = {
  category: NoticeCategory;
};

export function NoticeDetailHeader({ category }: Props) {
  const router = useRouter();
  return (
    <div className="flex items-center justify-between mb-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="text-[13px] text-charcoal-2 hover:text-ink"
        aria-label="뒤로가기"
      >← 뒤로</button>
      <span className="px-2.5 py-1 rounded-full bg-graysoft text-charcoal-2 text-[11.5px] font-semibold">
        {NOTICE_CATEGORY_LABEL[category]}
      </span>
    </div>
  );
}
