'use client';

import { use } from 'react';
import Link from 'next/link';
import { useClubRecruitmentsQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { RecruitmentKpiRow } from './_components/RecruitmentKpiRow';
import { CurrentRecruitmentCard } from './_components/CurrentRecruitmentCard';
import { RecruitmentEmptyState } from './_components/RecruitmentEmptyState';
import { PastRecruitmentsTable } from './_components/PastRecruitmentsTable';

export default function RecruitmentsPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const clubId = Number(clubIdParam);

  const { data: recruitments, isLoading } = useClubRecruitmentsQuery(
    isNaN(clubId) ? undefined : clubId,
  );

  // 활성(OPEN) 모집은 클럽당 최대 1건 — 백엔드 V38 부분 유니크 인덱스가 강제하므로 find 가 안전하다.
  const activeRecruitment =
    recruitments?.find((recruitment) => recruitment.displayStatus !== 'CLOSED') ?? null;
  const pastRecruitments =
    recruitments?.filter((recruitment) => recruitment.displayStatus === 'CLOSED') ?? [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink-deep">모집 관리</h1>
        {!isLoading && activeRecruitment === null && (
          <Link href={toRoute(`/manage/clubs/${clubId}/recruitments/new`)} className="btn btn-primary">
            <span className="mr-1 text-base leading-none">＋</span>새 모집 만들기
          </Link>
        )}
      </header>

      {isLoading ? (
        <LoadingGate label="모집 목록 불러오는 중" className="min-h-0 py-8" />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-2 text-sm font-bold tracking-wide text-ink-deep">현재 모집</h2>
            {activeRecruitment ? (
              <div className="space-y-3">
                <RecruitmentKpiRow recruitment={activeRecruitment} />
                <CurrentRecruitmentCard clubId={clubId} recruitment={activeRecruitment} />
              </div>
            ) : (
              <RecruitmentEmptyState clubId={clubId} />
            )}
          </section>

          <section>
            <h2 className="mb-2.5 text-sm font-bold tracking-wide text-ink-deep">
              지난 모집 <span className="ml-1 font-medium text-charcoal-3">{pastRecruitments.length}</span>
            </h2>
            <PastRecruitmentsTable clubId={clubId} recruitments={pastRecruitments} />
          </section>
        </div>
      )}
    </div>
  );
}
