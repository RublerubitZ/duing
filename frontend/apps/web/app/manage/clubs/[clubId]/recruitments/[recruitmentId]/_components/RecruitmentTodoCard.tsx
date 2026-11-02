'use client';

import { useId } from 'react';
import { useRecruitmentActionItems } from '@duing/hooks';
import { isRecruitmentExpiredOpen } from '@/app/_lib/recruitmentDisplay';
import { DashboardTaskGroupList } from '@/app/manage/_components/dashboard/DashboardTaskGroupList';
import { Skeleton } from '@/components/loading/Skeleton';
import { PendingApplicantsPreview } from './PendingApplicantsPreview';
import type { RecruitmentDetail } from '@duing/types';

/** 모집 상세 맨 위 "이 모집에서 할 일" — 운영진 홈과 같은 규칙의 이 모집 할 일 + 먼저 볼 지원서. 자체 폼 모집만 그린다(부르는 쪽). */
export function RecruitmentTodoCard({ clubId, recruitment }: { clubId: number; recruitment: RecruitmentDetail }) {
  const headingId = useId();
  const { groups, submittedCount, isLoading, isError } = useRecruitmentActionItems(recruitment);
  const isOpen = recruitment.status === 'OPEN';
  const hasItems = groups.length > 0;
  const now = new Date();

  // 마감 모집은 로딩 중·할 일 0 이면 자리를 두지 않는다 — 카드가 나타났다 사라지며 아래 내용이 당겨지지 않게.
  if (!isOpen && (isLoading || (!isError && !hasItems))) return null;

  const emptyText = isRecruitmentExpiredOpen(recruitment)
    ? '지금 처리할 일이 없어요. 심사를 마쳤다면 모집을 마감해 주세요.'
    : '지금 처리할 일이 없어요.';

  return (
    <section aria-labelledby={headingId} className="card mb-6 p-4">
      <h2 id={headingId} className="text-sm font-semibold text-charcoal">이 모집에서 할 일</h2>
      <div className="mt-3">
        {isLoading ? (
          <div className="animate-pulse space-y-2 motion-reduce:animate-none">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : hasItems ? (
          <>
            {/* 일부 실패면 건수를 숨긴다 — 일부만 센 숫자가 사실처럼 보이지 않게(홈과 같은 규칙) */}
            <DashboardTaskGroupList clubId={clubId} groups={groups} now={now} variant="recruitment" showCounts={!isError} />
            {isError ? <p className="mt-2 px-2 text-xs text-charcoal-3">일부 할 일을 불러오지 못했어요.</p> : null}
          </>
        ) : (
          <p className="px-2 text-sm text-charcoal-3">{isError ? '할 일을 불러오지 못했어요.' : emptyText}</p>
        )}
      </div>
      {/* 할 일 실패와 미리보기는 서로를 지우지 않는다 — 미리보기는 자기 조회의 로딩·실패를 그린다 */}
      {isOpen && submittedCount !== undefined && submittedCount > 0 ? (
        <PendingApplicantsPreview clubId={clubId} recruitmentId={recruitment.id} submittedCount={submittedCount} now={now} />
      ) : null}
    </section>
  );
}
