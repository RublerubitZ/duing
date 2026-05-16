'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useClubRecruitments } from '@duing/hooks';
import type { RecruitmentSummary } from '@duing/types';
import { toRoute } from '../../../../_lib/route';

type TabKey = 'OPEN' | 'CLOSED';

function RecruitmentCard({
  recruitment,
  clubId,
}: {
  recruitment: RecruitmentSummary;
  clubId: number;
}) {
  const applicationModeLabel =
    recruitment.applicationMode === 'EXTERNAL' ? '외부 폼' : '자체 폼';
  const targetRoleLabel = recruitment.targetRole === 'OFFICER' ? '운영진' : '부원';

  return (
    <li>
      <Link
        href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitment.id}`)}
        className="block rounded-lg border border-slate-200 p-4 hover:border-slate-400 transition-colors"
      >
        <div className="flex items-baseline justify-between">
          <span className="font-medium text-slate-900">{recruitment.title}</span>
          <span
            className={
              recruitment.effectivelyOpen
                ? 'text-xs font-medium text-emerald-600'
                : 'text-xs text-slate-400'
            }
          >
            {recruitment.effectivelyOpen ? '모집 중' : '마감'}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {recruitment.startDate} ~ {recruitment.endDate} · {applicationModeLabel} ·{' '}
          {targetRoleLabel} 모집 · 정원 {recruitment.capacity}
        </p>
      </Link>
    </li>
  );
}

export default function RecruitmentsPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const clubId = Number(clubIdParam);

  const [activeTab, setActiveTab] = useState<TabKey>('OPEN');

  const { data: recruitments, isLoading } = useClubRecruitments(
    isNaN(clubId) ? undefined : clubId,
  );

  const openRecruitments = recruitments?.filter((recruitment) => recruitment.effectivelyOpen) ?? [];
  const closedRecruitments =
    recruitments?.filter((recruitment) => !recruitment.effectivelyOpen) ?? [];

  const displayedRecruitments =
    activeTab === 'OPEN' ? openRecruitments : closedRecruitments;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">모집 목록</h1>
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments/new`)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          신규 모집 작성
        </Link>
      </header>

      {/* 탭 */}
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('OPEN')}
          className={
            activeTab === 'OPEN'
              ? 'border-b-2 border-slate-900 px-4 py-2 text-sm font-medium text-slate-900'
              : 'px-4 py-2 text-sm text-slate-500 hover:text-slate-700'
          }
        >
          진행 중 ({openRecruitments.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('CLOSED')}
          className={
            activeTab === 'CLOSED'
              ? 'border-b-2 border-slate-900 px-4 py-2 text-sm font-medium text-slate-900'
              : 'px-4 py-2 text-sm text-slate-500 hover:text-slate-700'
          }
        >
          마감 ({closedRecruitments.length})
        </button>
      </div>

      {isLoading && <p className="text-sm text-slate-500">불러오는 중…</p>}

      {!isLoading && displayedRecruitments.length === 0 && (
        <p className="text-sm text-slate-500">
          {activeTab === 'OPEN' ? '진행 중인 모집이 없습니다.' : '마감된 모집이 없습니다.'}
        </p>
      )}

      {displayedRecruitments.length > 0 && (
        <ul className="space-y-2">
          {displayedRecruitments.map((recruitment) => (
            <RecruitmentCard
              key={recruitment.id}
              recruitment={recruitment}
              clubId={clubId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
