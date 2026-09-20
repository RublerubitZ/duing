'use client';

import Link from 'next/link';

import { AdminClubActivityLogList } from '../_components/AdminClubActivityLogList';

type Props = {
  clubId: number;
};

/** 총동연 동아리 활동 이력(상태 전이·폐쇄·가입 링크·부원 초대). 권한 변경 이력 페이지와 같은 골격이다. */
export function AdminClubActivityLogPage({ clubId }: Props) {
  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6 flex items-center gap-3">
        <Link href={`/admin/clubs/${clubId}`} className="text-[13px] text-charcoal-2 hover:text-ink">
          ← 동아리 상세
        </Link>
        <h1 className="text-[22px] font-bold text-ink">동아리 활동 이력</h1>
        <span className="text-[13px] text-charcoal-3">(동아리 ID: {clubId})</span>
      </header>

      <AdminClubActivityLogList clubId={clubId} />
    </main>
  );
}
