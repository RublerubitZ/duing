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

  const dashboardPath = toRoute(`/manage/clubs/${currentClubId}`);
  const recruitmentsPath = toRoute(`/manage/clubs/${currentClubId}/recruitments`);
  const photosPath = toRoute(`/manage/clubs/${currentClubId}/photos`);
  const membersPath = toRoute(`/manage/clubs/${currentClubId}/members`);
  const infoPath = toRoute(`/manage/clubs/${currentClubId}/info`);

  const isDashboardActive = pathname === dashboardPath;
  const isRecruitmentsActive = pathname.startsWith(recruitmentsPath);
  const isPhotosActive = pathname.startsWith(photosPath);
  const isMembersActive = pathname.startsWith(membersPath);
  const isInfoActive = pathname.startsWith(infoPath);

  return (
    <nav className="flex flex-col gap-0.5 px-2">
      <Link
        href={dashboardPath}
        className={cn(
          'flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-[13.5px] transition-colors',
          isDashboardActive
            ? 'bg-ink text-cream font-semibold'
            : 'text-cream/80 hover:bg-ink/60',
        )}
      >
        <svg
          className={cn('w-4 h-4 flex-shrink-0', isDashboardActive ? 'text-cream' : 'text-sage')}
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
        >
          <rect x="2" y="2" width="5" height="5" rx="1" />
          <rect x="9" y="2" width="5" height="5" rx="1" />
          <rect x="2" y="9" width="5" height="5" rx="1" />
          <rect x="9" y="9" width="5" height="5" rx="1" />
        </svg>
        대시보드
      </Link>

      <p className="px-2.5 pt-3 pb-1.5 text-[11px] uppercase tracking-[0.12em] text-cream/50">
        모집
      </p>

      <Link
        href={recruitmentsPath}
        className={cn(
          'flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-[13.5px] transition-colors',
          isRecruitmentsActive
            ? 'bg-ink text-cream font-semibold'
            : 'text-cream/80 hover:bg-ink/60',
        )}
      >
        <svg
          className={cn('w-4 h-4 flex-shrink-0', isRecruitmentsActive ? 'text-cream' : 'text-sage')}
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
        >
          <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
          <path d="M5.5 8h5M8 5.5v5" />
        </svg>
        모집 관리
      </Link>

      <span className="flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-[13.5px] text-cream/40 cursor-not-allowed select-none">
        <svg className="w-4 h-4 text-cream/30 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="7" cy="6" r="3" />
          <path d="M2 14c.5-2.5 2.5-4 5-4s4.5 1.5 5 4" />
          <circle cx="12.5" cy="5.5" r="2" />
        </svg>
        지원자
        <small className="text-cream/30 text-[11.5px] font-normal ml-0.5">
          (모집을 먼저 선택하세요)
        </small>
      </span>

      <span className="flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-[13.5px] text-cream/40 cursor-not-allowed select-none">
        <svg className="w-4 h-4 text-cream/30 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M2 13V7M6 13V4M10 13V8M14 13V6" />
        </svg>
        통계
        <small className="text-cream/30 text-[11.5px] font-normal ml-0.5">
          (모집을 먼저 선택하세요)
        </small>
      </span>

      <p className="px-2.5 pt-3.5 pb-1.5 text-[11px] uppercase tracking-[0.12em] text-cream/50">
        관리
      </p>

      <Link
        href={infoPath}
        className={cn(
          'flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-[13.5px] transition-colors',
          isInfoActive
            ? 'bg-ink text-cream font-semibold'
            : 'text-cream/80 hover:bg-ink/60',
        )}
      >
        <svg
          className={cn('w-4 h-4 flex-shrink-0', isInfoActive ? 'text-cream' : 'text-sage')}
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
        >
          <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
          <path d="M5 6h6M5 9h4" />
        </svg>
        동아리 정보
      </Link>

      <Link
        href={photosPath}
        className={cn(
          'flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-[13.5px] transition-colors',
          isPhotosActive
            ? 'bg-ink text-cream font-semibold'
            : 'text-cream/80 hover:bg-ink/60',
        )}
      >
        <svg
          className={cn('w-4 h-4 flex-shrink-0', isPhotosActive ? 'text-cream' : 'text-sage')}
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
        >
          <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
          <circle cx="6" cy="7" r="1.2" />
          <path d="M3 11l3-2 3 2 4-3" />
        </svg>
        활동사진
      </Link>

      <Link
        href={membersPath}
        className={cn(
          'flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-[13.5px] transition-colors',
          isMembersActive
            ? 'bg-ink text-cream font-semibold'
            : 'text-cream/80 hover:bg-ink/60',
        )}
      >
        <svg
          className={cn('w-4 h-4 flex-shrink-0', isMembersActive ? 'text-cream' : 'text-sage')}
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
        >
          <circle cx="6" cy="6" r="2.4" />
          <path d="M2 13c.4-2 2-3.3 4-3.3s3.6 1.3 4 3.3" />
          <circle cx="12" cy="5.5" r="1.7" />
          <path d="M11 12.6c.5-1.5 1.7-2.5 3-2.5" />
        </svg>
        멤버 관리
      </Link>
    </nav>
  );
}
