'use client';

import { memo, useState } from 'react';
import Link from 'next/link';
import {
  useAdminClubDetailQuery,
  useAdminClubMembersQuery,
  useAdminUpdateClubMutation,
} from '@duing/hooks';
import type { AdminClubMember } from '@duing/types';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { Pagination } from '@/components/Pagination';
import { sanitizeNoticeHtml } from '@/app/notices/_lib/sanitizeHtml';
import { PROSE_CLASS } from '@/app/notices/_components/NoticeContent';
import { STORED_RICH_HTML_LEADING } from '@/app/manage/clubs/[clubId]/info/_lib/seedEditorHtml';
import { collegeDisplayName } from '@/app/_lib/college';
import { useDebouncedValue } from '@/app/admin/_hooks/useDebouncedValue';
import { ClubInfoForm } from '@/app/manage/clubs/[clubId]/info/_components/ClubInfoForm';
import { cn } from '../../../../_lib/cn';
import { ClubLogo } from '../../../../_components/ClubLogo';
import { STATUS_BADGE_CLASS, STATUS_LABEL } from '../../_lib/clubStatus';
import { AdminAssignLeaderCard } from '../_components/AdminAssignLeaderCard';

type Props = {
  clubId: number;
};

const MEMBER_PAGE_SIZE = 20;

// 콘솔이 Tiptap HTML(<p…)로 저장하기 시작하므로 총동연 열람 뷰도 학생 렌더와 동일하게 렌더한다.
// 저장된 리치 HTML(화이트리스트 태그로 시작)이면 sanitize 후 리치로, 레거시 plain 은 기존 pre-wrap 로.
// dangerouslySetInnerHTML 서브트리는 memo 로 분리 — 부모 재렌더마다 __html 이 새로 생성돼 주입 DOM 이
// 교체되는 것을 막는다(공지·클럽 상세 렌더 전례).
const ClubDescription = memo(function ClubDescription({ description }: { description: string }) {
  if (STORED_RICH_HTML_LEADING.test(description)) {
    return (
      <div
        className={PROSE_CLASS}
        // eslint-disable-next-line react/no-danger -- sanitizeNoticeHtml 로 정화한 HTML 만 주입
        dangerouslySetInnerHTML={{ __html: sanitizeNoticeHtml(description) }}
      />
    );
  }
  return <div className="whitespace-pre-wrap text-slate-700 text-[13px]">{description}</div>;
});

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

const ROLE_LABEL: Record<AdminClubMember['role'], string> = {
  LEADER: '회장',
  OFFICER: '임원',
  MEMBER: '회원',
};

function MemberRow({ member }: { member: AdminClubMember }) {
  const affiliation = [collegeDisplayName(member.college), member.major]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-white px-3 py-2 text-sm">
      <div className="min-w-0">
        <span className="font-medium text-slate-900">{member.name}</span>
        <span className="ml-2 text-xs text-slate-500">{member.studentId}</span>
        {affiliation && <p className="mt-0.5 truncate text-xs text-slate-500">{affiliation}</p>}
      </div>
      <span className="shrink-0 text-xs text-slate-400">{ROLE_LABEL[member.role]}</span>
    </div>
  );
}

export function AdminClubDetailPage({ clubId }: Props) {
  const detailQuery = useAdminClubDetailQuery(clubId);
  const membersQuery = useAdminClubMembersQuery(clubId);
  const updateMutation = useAdminUpdateClubMutation(clubId);

  const [editing, setEditing] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberPage, setMemberPage] = useState(0);
  const debouncedMemberSearch = useDebouncedValue(memberSearch.trim(), 250);

  const club = detailQuery.data;
  const members = membersQuery.data ?? [];

  const normalizedQuery = debouncedMemberSearch.toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const filteredMembers = isSearching
    ? members.filter(
        (member) =>
          member.name.toLowerCase().includes(normalizedQuery) ||
          member.studentId.toLowerCase().includes(normalizedQuery) ||
          member.major.toLowerCase().includes(normalizedQuery),
      )
    : members;
  const totalPages = Math.ceil(filteredMembers.length / MEMBER_PAGE_SIZE);
  const pageMembers = filteredMembers.slice(
    memberPage * MEMBER_PAGE_SIZE,
    memberPage * MEMBER_PAGE_SIZE + MEMBER_PAGE_SIZE,
  );

  const hasNoLeader = !members.some((member) => member.role === 'LEADER');

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/admin/clubs" className="text-[13px] text-charcoal-2 hover:text-ink">
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

      {club &&
        (editing ? (
          <ClubInfoForm
            detail={club}
            mode="admin"
            mutation={updateMutation}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        ) : (
          <div className="space-y-8">
            {/* 기본 정보 */}
            <section className="rounded-lg border border-line bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold text-ink">기본 정보</h2>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="btn btn-primary text-[13px]"
                >
                  수정
                </button>
              </div>
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
                    <dd>
                      <ClubDescription description={club.description} />
                    </dd>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-semibold text-ink">
                  회원 {members.length}명
                  {isSearching && filteredMembers.length !== members.length && (
                    <span className="ml-2 text-[13px] font-normal text-slate-500">
                      · {filteredMembers.length}명 검색됨
                    </span>
                  )}
                </h2>
                <input
                  type="search"
                  value={memberSearch}
                  onChange={(event) => {
                    setMemberSearch(event.target.value);
                    setMemberPage(0);
                  }}
                  placeholder="이름·학번·전공 검색"
                  aria-label="회원 검색"
                  className="w-full max-w-[240px] rounded-md border border-line bg-white px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
                />
              </div>

              {membersQuery.isLoading ? (
                <LoadingGate className="min-h-0 py-10" label="회원 목록 불러오는 중" />
              ) : membersQuery.isError ? (
                <p className="text-[13px] text-coral">회원 목록을 불러오지 못했습니다.</p>
              ) : members.length === 0 ? (
                <p className="text-[13px] text-slate-400 italic">등록된 회원이 없습니다.</p>
              ) : filteredMembers.length === 0 ? (
                <p className="text-[13px] text-slate-400 italic">검색 결과가 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    {pageMembers.map((member) => (
                      <MemberRow key={member.memberId} member={member} />
                    ))}
                  </div>
                  <Pagination
                    page={memberPage}
                    totalPages={totalPages}
                    onChange={setMemberPage}
                    ariaLabel="회원 목록 페이지"
                    totalElements={filteredMembers.length}
                    pageSize={MEMBER_PAGE_SIZE}
                  />
                </div>
              )}
            </section>

            {/* 강제 회장 지정 카드 — 회원 로딩 완료 후 LEADER 없을 때만 (로딩 중 순간 노출 방지) */}
            {membersQuery.isSuccess && hasNoLeader && <AdminAssignLeaderCard clubId={clubId} />}
          </div>
        ))}
    </main>
  );
}
