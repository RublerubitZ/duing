'use client';

import Link from 'next/link';

import { AdminClubJoinCodesTable } from '../_components/AdminClubJoinCodesTable';

type Props = {
  clubId: number;
  highlightJoinCodeId: number | null;
};

/** 총동연 가입 링크 이력(모집 가입·부원 초대). 활동 이력 페이지와 같은 골격이다. */
export function AdminClubJoinCodesPage({ clubId, highlightJoinCodeId }: Props) {
  return (
    <main className="max-w-layout mx-auto px-4 py-10 sm:px-6 md:px-10">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/admin/clubs/${clubId}`}
            className="text-[13px] text-charcoal-2 hover:text-ink"
          >
            ← 동아리 상세
          </Link>
          <h1 className="text-[22px] font-bold text-ink">가입 링크</h1>
          <span className="text-[13px] text-charcoal-3">(동아리 ID: {clubId})</span>
        </div>
        <p className="mt-2 text-[13px] text-charcoal-2">
          이 동아리가 만든 부원 초대·모집 가입 링크 전체입니다. 폐기·만료된 링크도 함께 보입니다.
        </p>
      </header>

      <AdminClubJoinCodesTable clubId={clubId} highlightJoinCodeId={highlightJoinCodeId} />
    </main>
  );
}
