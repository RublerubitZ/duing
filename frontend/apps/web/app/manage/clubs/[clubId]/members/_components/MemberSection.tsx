'use client';

import type { ClubMember, ClubMemberRole } from '@duing/types';
import { MemberRow } from './MemberRow';

type MemberSectionProps = {
  title: string;
  members: ClubMember[];
  clubId: number;
  viewerRole: ClubMemberRole;
  viewerUserId: number;
  onTransferLeader: (target: ClubMember) => void;
};

export function MemberSection({
  title, members, clubId, viewerRole, viewerUserId, onTransferLeader,
}: MemberSectionProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-700">
        {title} <span className="ml-1 text-xs font-normal text-slate-400">{members.length}명</span>
      </h2>
      {members.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-400">
          해당 역할의 멤버가 없습니다.
        </p>
      ) : (
        <div className="space-y-1.5">
          {members.map((member) => (
            <MemberRow
              key={member.memberId}
              clubId={clubId}
              member={member}
              viewerRole={viewerRole}
              viewerUserId={viewerUserId}
              onTransferLeader={onTransferLeader}
            />
          ))}
        </div>
      )}
    </section>
  );
}