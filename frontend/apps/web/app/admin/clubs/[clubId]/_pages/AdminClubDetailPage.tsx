'use client';

import Link from 'next/link';
import { formatDateKst, useAdminClubDetailQuery, useClubMembersQuery } from '@duing/hooks';
import type { ClubMember } from '@duing/types';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { cn } from '../../../../_lib/cn';
import { ClubLogo } from '../../../../_components/ClubLogo';
import { STATUS_BADGE_CLASS, STATUS_LABEL } from '../../_lib/clubStatus';
import { AdminAssignLeaderCard } from '../_components/AdminAssignLeaderCard';

type Props = {
  clubId: number;
};

const CATEGORY_LABEL: Record<string, string> = {
  ACADEMIC: '학술',
  CULTURE: '문화',
  ART: '예술',
  SPORTS: '체육',
  VOLUNTEER: '봉사',
  RELIGION: '종교',
  HOBBY: '취미',
  OTHER: '기타',
};


function MemberRow({ member }: { member: ClubMember }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-line bg-white px-3 py-2 text-sm">
      <div>
        <span className="font-medium text-slate-900">{member.name}</span>
        <span className="ml-2 text-xs text-slate-500">
          {member.studentId}
        </span>
      </div>
      <span className="text-xs text-slate-500">
        {formatDateKst(member.joinedAt)} 가입
      </span>
    </div>
  );
}

function MemberGroup({
  title,
  members,
  emptyText,
}: {
  title: string;
  members: ClubMember[];
  emptyText: string;
}) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
        {title} ({members.length})
      </h3>
      {members.length === 0 ? (
        <p className="text-xs text-slate-400 italic">{emptyText}</p>
      ) : (
        <div className="space-y-1">
          {members.map((member) => (
            <MemberRow key={member.memberId} member={member} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminClubDetailPage({ clubId }: Props) {
  const detailQuery = useAdminClubDetailQuery(clubId);
  const membersQuery = useClubMembersQuery(clubId);

  const club = detailQuery.data;
  const members = membersQuery.data ?? [];

  const leaders = members.filter((member) => member.role === 'LEADER');
  const officers = members.filter((member) => member.role === 'OFFICER');
  const regularMembers = members.filter((member) => member.role === 'MEMBER');

  const hasNoLeader = leaders.length === 0;

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href="/admin/clubs"
          className="text-[13px] text-charcoal-2 hover:text-ink"
        >
          ← 동아리 목록
        </Link>
        {club && (
          <>
            <h1 className="text-[22px] font-bold text-ink">{club.name}</h1>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                  STATUS_BADGE_CLASS[club.status],
                )}
              >
                {STATUS_LABEL[club.status]}
              </span>
              {club.centralClub && (
                <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  🏛️ 중앙
                </span>
              )}
            </div>
            <Link
              href={`/admin/clubs/${clubId}/member-history`}
              className="ml-auto text-[13px] text-indigo-600 hover:underline"
            >
              권한 변경 이력 →
            </Link>
          </>
        )}
      </header>

      {detailQuery.isLoading && <LoadingGate label="동아리 정보 불러오는 중" />}
      {detailQuery.isError && (
        <p className="py-12 text-center text-coral text-[13px]">동아리 정보를 불러오지 못했습니다.</p>
      )}

      {club && (
        <div className="space-y-8">
          {/* 기본 정보 */}
          <section className="rounded-lg border border-line bg-white p-5 space-y-3">
            <h2 className="text-[15px] font-semibold text-ink">기본 정보</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-[11px] font-semibold uppercase text-slate-400">카테고리</dt>
                <dd className="text-slate-800">{CATEGORY_LABEL[club.category] ?? club.category}</dd>
              </div>
              {club.division && (
                <div>
                  <dt className="text-[11px] font-semibold uppercase text-slate-400">분류</dt>
                  <dd className="text-slate-800">{club.division}</dd>
                </div>
              )}
              {club.tags.length > 0 && (
                <div className="col-span-2 sm:col-span-3">
                  <dt className="text-[11px] font-semibold uppercase text-slate-400">태그</dt>
                  <dd className="flex flex-wrap gap-1 mt-0.5">
                    {club.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                      >
                        #{tag}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              {club.description && (
                <div className="col-span-2 sm:col-span-3">
                  <dt className="text-[11px] font-semibold uppercase text-slate-400">설명</dt>
                  <dd className="whitespace-pre-wrap text-slate-700 text-[13px]">{club.description}</dd>
                </div>
              )}
              {club.logoUrl && (
                <div>
                  <dt className="text-[11px] font-semibold uppercase text-slate-400">로고</dt>
                  <dd>
                    <div className="relative mt-0.5 h-10 w-10 overflow-hidden rounded-md bg-graysoft">
                      <ClubLogo logoUrl={club.logoUrl} alt={`${club.name} 로고`} />
                    </div>
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* 회원 */}
          <section className="rounded-lg border border-line bg-graysoft p-5 space-y-4">
            <h2 className="text-[15px] font-semibold text-ink">
              회원 ({members.length}명)
            </h2>
            {membersQuery.isLoading ? (
              <LoadingGate className="min-h-0 py-10" label="회원 목록 불러오는 중" />
            ) : membersQuery.isError ? (
              <p className="text-[13px] text-coral">회원 목록을 불러오지 못했습니다.</p>
            ) : members.length === 0 ? (
              <p className="text-[13px] text-slate-400 italic">등록된 회원이 없습니다.</p>
            ) : (
              <div className="space-y-4">
                <MemberGroup
                  title="회장"
                  members={leaders}
                  emptyText="회장이 없습니다."
                />
                <MemberGroup
                  title="임원"
                  members={officers}
                  emptyText="임원이 없습니다."
                />
                <MemberGroup
                  title="일반 회원"
                  members={regularMembers}
                  emptyText="일반 회원이 없습니다."
                />
              </div>
            )}
          </section>

          {/* 강제 회장 지정 카드 — LEADER 없을 때만 */}
          {hasNoLeader && <AdminAssignLeaderCard clubId={clubId} />}
        </div>
      )}
    </main>
  );
}
