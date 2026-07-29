'use client';

import { useState } from 'react';
import { ChevronDown, Copy, Users } from 'lucide-react';

import { useAdminClubMembersQuery } from '@duing/hooks';
import {
  COLLEGE_DISPLAY_NAME,
  GRADE_DISPLAY_NAME,
  isCollege,
  type AdminClubMember,
} from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { TextLinesSkeleton } from '@/components/loading/Skeleton';

/** 한 명 → 붙여넣기용 한 줄(이름 / 학번 / 전공 / 단과대). 학교 문서에 그대로 옮길 수 있게 슬래시로 잇는다. */
function memberLine(member: AdminClubMember): string {
  const college = isCollege(member.college) ? COLLEGE_DISPLAY_NAME[member.college] : member.college;
  return [member.name, member.studentId, member.major || '—', college].join(' / ');
}

/**
 * 전사 콕핏에서 현재 예약의 동아리원 명단을 펼쳐 보는 아코디언. 기본은 접혀 있고, 담당자가 학교 문서에
 * 명단을 옮겨야 할 때만 연다. 행 단위 복사와 전체 명단 복사를 모두 제공한다.
 *
 * clubId 가 있어야 열 수 있다(현재 예약의 동아리). 명단은 이름·학번·전공·단과대 순으로 보여준다.
 */
export function ClubRosterAccordion({ clubId, clubName }: { clubId: number; clubName: string }) {
  const [open, setOpen] = useState(false);
  // 펼친 뒤에만 조회한다 — 예약을 넘길 때마다 매번 명단을 당겨오지 않게(대부분 전사엔 명단이 불필요).
  const membersQuery = useAdminClubMembersQuery(open ? clubId : null);
  const members = membersQuery.data ?? [];

  const copyAll = () => {
    if (members.length === 0) return;
    void navigator.clipboard?.writeText(members.map(memberLine).join('\n')).catch(() => undefined);
  };
  const copyRow = (member: AdminClubMember) => {
    void navigator.clipboard?.writeText(memberLine(member)).catch(() => undefined);
  };

  const panelId = `club-roster-${clubId}`;
  return (
    <div className="rounded-md border border-line bg-paper">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left outline-none hover:bg-sage-tint focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink"
      >
        <Users size={16} className="shrink-0 text-charcoal-3" />
        <span className="flex-1 text-[13px] font-semibold text-charcoal-2">
          동아리원 보기
          <span className="ml-1.5 font-normal text-charcoal-3">{clubName}</span>
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className={cn('shrink-0 text-charcoal-3 motion-safe:transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div id={panelId} className="px-4 py-3">
          {membersQuery.isLoading && <TextLinesSkeleton lines={3} label="동아리원 불러오는 중" />}

          {membersQuery.isError && (
            <div role="alert" className="text-[13px] text-charcoal-2">
              <p>동아리원 명단을 불러오지 못했어요.</p>
              <button
                type="button"
                className="btn btn-ghost btn-sm mt-1.5"
                onClick={() => void membersQuery.refetch()}
              >
                다시 시도
              </button>
            </div>
          )}

          {membersQuery.isSuccess && members.length === 0 && (
            <p className="text-[13px] text-charcoal-3">등록된 동아리원이 없어요.</p>
          )}

          {membersQuery.isSuccess && members.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-bold text-charcoal-3">
                  총 <span className="font-mono">{members.length}</span>명
                </span>
                <button
                  type="button"
                  onClick={copyAll}
                  className="btn btn-ghost btn-sm"
                >
                  <Copy size={13} />
                  전체 명단 복사
                </button>
              </div>
              <ul className="divide-y divide-line rounded-md border border-line">
                {members.map((member) => {
                  const college = isCollege(member.college)
                    ? COLLEGE_DISPLAY_NAME[member.college]
                    : member.college;
                  return (
                    <li key={member.memberId}>
                      <button
                        type="button"
                        onClick={() => copyRow(member)}
                        aria-label={`${member.name} 명단 복사`}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left outline-none hover:bg-sage-tint focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink"
                      >
                        <span className="min-w-0 flex-1 truncate text-[13px] text-charcoal-2">
                          <span className="font-semibold text-ink-deep">{member.name}</span>
                          <span className="ml-2 font-mono text-[12px] text-charcoal-3">{member.studentId}</span>
                          <span className="ml-2 break-keep text-[12px] text-charcoal-3">
                            {(member.major || '—')} · {college} · {GRADE_DISPLAY_NAME[member.grade]}
                          </span>
                        </span>
                        <Copy size={13} aria-hidden className="shrink-0 text-charcoal-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
