'use client';

import { Check, ChevronDown } from 'lucide-react';
import type { ManagedClub } from '@duing/types';
import { ClubLogo } from '@/app/_components/ClubLogo';
import { cn } from '@/app/_lib/cn';
import { clubMemberRoleLabel } from '@/app/_lib/clubMemberRoleLabel';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toRoute } from '../../_lib/route';

type ClubSwitcherProps = {
  managedClubs: ManagedClub[];
  currentClubId: number | null;
  /** 클럽 선택 직후 호출 — 모바일 드로어 닫기용. 드롭다운은 포털로 렌더되어 Sheet 의 anchor 클릭 감지가 닿지 않는다. */
  onNavigate?: () => void;
};

function recruitLabel(activeRecruitmentCount: number) {
  return activeRecruitmentCount > 0 ? '모집중' : '모집종료';
}

/** 클럽 로고(실패 시 첫 글자 폴백). ClubLogo 규약대로 컨테이너가 relative·사이즈·모양·배경을 책임진다. */
function ClubAvatar({
  club,
  className,
  textClassName,
}: {
  club: ManagedClub;
  className: string;
  textClassName: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br from-ink to-ink-soft font-extrabold text-white',
        className,
      )}
    >
      <ClubLogo logoUrl={club.logoUrl}>
        <span className={textClassName}>{club.clubName.charAt(0)}</span>
      </ClubLogo>
    </span>
  );
}

export function ClubSwitcher({ managedClubs, currentClubId, onNavigate }: ClubSwitcherProps) {
  const router = useGuardedRouter();
  const currentClub = managedClubs.find((club) => club.clubId === currentClubId) ?? managedClubs[0];
  if (!currentClub) {
    return null;
  }

  const recruiting = currentClub.activeRecruitmentCount > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`동아리 전환 — 현재 ${currentClub.clubName}`}
          className={cn(
            'group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none',
            'hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-sage data-[state=open]:bg-white/10',
            'motion-safe:transition-colors motion-safe:duration-200',
          )}
        >
          <ClubAvatar club={currentClub} className="h-10 w-10 rounded-[13px]" textClassName="text-[17px]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-extrabold text-white">{currentClub.clubName}</span>
            <span className="mt-0.5 flex items-center gap-1.5">
              <span className="shrink-0 rounded-full bg-sage px-1.5 py-px text-[9.5px] font-extrabold text-ink-deep">
                {clubMemberRoleLabel(currentClub.myRole)}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 py-px text-[9.5px] font-bold',
                  recruiting ? 'bg-sage/20 text-sage-soft' : 'bg-white/10 text-white/50',
                )}
              >
                {recruitLabel(currentClub.activeRecruitmentCount)}
              </span>
            </span>
          </span>
          <ChevronDown
            size={16}
            aria-hidden
            className="shrink-0 text-white/55 motion-safe:transition-transform motion-safe:duration-200 group-data-[state=open]:rotate-180"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-[248px] border-white/10 bg-[#2A382F] p-1.5 text-white shadow-4"
      >
        <DropdownMenuLabel className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">
          내 동아리 {managedClubs.length}
        </DropdownMenuLabel>
        {managedClubs.map((club) => {
          const isCurrent = club.clubId === currentClubId;
          return (
            <DropdownMenuItem
              key={club.clubId}
              onSelect={() => {
                if (!isCurrent) {
                  router.push(toRoute(`/manage/clubs/${club.clubId}`));
                }
                onNavigate?.();
              }}
              className="cursor-pointer gap-2.5 rounded-sm px-2.5 py-2 focus:bg-white/10 focus:text-white"
            >
              <ClubAvatar club={club} className="h-[30px] w-[30px] rounded-[9px]" textClassName="text-[13px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-white">{club.clubName}</span>
                <span className="block text-[11px] text-white/50">
                  {clubMemberRoleLabel(club.myRole)} ·{' '}
                  <span className={club.activeRecruitmentCount > 0 ? 'text-sage-soft' : 'text-white/50'}>
                    {recruitLabel(club.activeRecruitmentCount)}
                  </span>
                </span>
              </span>
              {isCurrent && (
                <>
                  <Check size={15} aria-hidden className="shrink-0 text-sage" />
                  <span className="sr-only">현재 선택됨</span>
                </>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
