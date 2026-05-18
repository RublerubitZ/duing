'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../../_lib/cn';
import { toRoute } from '../../_lib/route';

type ManageNavProps = {
  currentClubId: number;
};

export function ManageNav({ currentClubId }: ManageNavProps) {
  const pathname = usePathname();

  const recruitmentsPath = toRoute(`/manage/clubs/${currentClubId}/recruitments`);

  const isRecruitmentsActive = pathname.startsWith(recruitmentsPath);

  return (
    <nav className="mt-4 flex flex-col gap-1 px-2">
      <Link
        href={recruitmentsPath}
        className={cn(
          'rounded-md px-3 py-2 text-sm font-medium',
          isRecruitmentsActive
            ? 'bg-slate-900 text-white'
            : 'text-slate-700 hover:bg-slate-100',
        )}
      >
        모집
      </Link>

      <div className="rounded-md px-3 py-2 text-sm font-medium text-slate-400 cursor-not-allowed select-none">
        지원자
        <span className="ml-1.5 text-xs font-normal text-slate-400">(모집을 먼저 선택하세요)</span>
      </div>

      <div className="rounded-md px-3 py-2 text-sm font-medium text-slate-400 cursor-not-allowed select-none">
        통계
        <span className="ml-1.5 text-xs font-normal text-slate-400">(모집을 먼저 선택하세요)</span>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <Link
          href={toRoute(`/manage/clubs/${currentClubId}/info`)}
          className={cn(
            'block rounded-md px-3 py-2 text-sm font-medium',
            pathname.startsWith(toRoute(`/manage/clubs/${currentClubId}/info`))
              ? 'bg-slate-900 text-white'
              : 'text-slate-700 hover:bg-slate-100',
          )}
        >
          동아리 정보
        </Link>
        <div className="rounded-md px-3 py-2 text-sm font-medium text-slate-300 cursor-not-allowed select-none">
          멤버 관리
          <span className="ml-1.5 text-xs font-normal text-slate-300">(Phase 3)</span>
        </div>
      </div>
    </nav>
  );
}