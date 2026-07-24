'use client';

import Link from 'next/link';
import { toRoute } from '@/app/_lib/route';

type Props = {
  clubId: number;
};

export function RecruitmentEmptyState({ clubId }: Props) {
  return (
    <div className="rounded-[20px] border border-dashed border-line bg-paper px-6 py-10 text-center">
      <p className="text-3xl">📥</p>
      <p className="mt-3 text-[15.5px] font-bold text-ink-deep">진행 중인 모집이 없어요</p>
      <p className="mt-1.5 text-sm leading-relaxed text-charcoal-3">
        모집은 한 번에 하나씩만 진행할 수 있어요.
        <br />
        새 모집을 만들어 지원을 받아보세요.
      </p>
      <Link href={toRoute(`/manage/clubs/${clubId}/recruitments/new`)} className="btn btn-primary mt-5 inline-flex">
        <span className="mr-1 text-base leading-none">＋</span>새 모집 만들기
      </Link>
    </div>
  );
}
