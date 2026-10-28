'use client';

import Link from 'next/link';
import { useActiveRecruitments, useApplicantSummary } from '@duing/hooks';
import {
  APPLICATION_AWAITING_REVIEW_LABEL,
  APPLICATION_STATUS_OPERATOR_LABEL,
} from '@/app/_constants/application-status';
import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from './DashboardCard';

/** 진행 중(raw OPEN) 모집은 동아리당 최대 1건(V38) — 2건 이상은 방어용 표기. */
function summaryCaption(recruitmentTitles: string[], total: number): { title: string | null; rest: string } {
  if (recruitmentTitles.length === 0) return { title: null, rest: '진행 중 모집 없음' };
  if (recruitmentTitles.length === 1) return { title: recruitmentTitles[0] ?? null, rest: ` · 총 ${total}명` };
  return { title: null, rest: `진행 중 모집 ${recruitmentTitles.length}건 합산 · 총 ${total}명` };
}

export function ApplicantSummaryCard({ clubId }: { clubId: number }) {
  const { totals, isLoading, isError } = useApplicantSummary(clubId);
  const { data: activeRecruitments } = useActiveRecruitments(clubId);
  const recruitmentTitles = (activeRecruitments ?? []).map((recruitment) => recruitment.title);
  const hasActiveRecruitment = recruitmentTitles.length > 0;
  const value = (count: number) => (hasActiveRecruitment ? `${count}명` : '—');
  const caption = summaryCaption(recruitmentTitles, totals.total);

  const tiles: Array<{ label: string; value: string; sub?: string }> = [
    {
      label: APPLICATION_AWAITING_REVIEW_LABEL,
      value: value(totals.submitted + totals.onHold),
      sub: hasActiveRecruitment
        ? `${APPLICATION_STATUS_OPERATOR_LABEL.SUBMITTED} ${totals.submitted} + ${APPLICATION_STATUS_OPERATOR_LABEL.ON_HOLD} ${totals.onHold}`
        : undefined,
    },
    { label: APPLICATION_STATUS_OPERATOR_LABEL.INTERVIEW_PENDING, value: value(totals.interviewPending) },
    { label: APPLICATION_STATUS_OPERATOR_LABEL.ACCEPTED, value: value(totals.accepted) },
    { label: APPLICATION_STATUS_OPERATOR_LABEL.REJECTED, value: value(totals.rejected) },
  ];

  return (
    <DashboardCard
      title="지원자 현황"
      // 로딩 중에는 비우는 게 맞다 — 모집 목록을 받기 전이면 "진행 중 모집 없음"이 사실처럼 보인다(DashboardCard 는 로딩 중에도 배지를 그린다).
      // 모집명(최대 200자)만 말줄임하고 인원은 늘 보인다 — 길어도 카드 제목을 누르지 않게 폭을 묶는다.
      badge={
        isLoading ? undefined : (
          <span className="ml-3 flex min-w-0 max-w-[60%] text-xs text-charcoal-3">
            {caption.title ? (
              <span className="truncate" title={caption.title}>
                {caption.title}
              </span>
            ) : null}
            <span className="shrink-0 whitespace-pre">{caption.rest}</span>
          </span>
        )
      }
      isLoading={isLoading}
      isError={isError}
      // 정상 빈 상태는 "—" 칸으로 보이고, 실패하면서 0명일 때만 카드의 오류 안내로 보낸다.
      isEmpty={isError && totals.total === 0}
      footer={
        <Link href={toRoute(`/manage/clubs/${clubId}/recruitments`)} className="text-xs font-medium text-ink hover:underline">
          모집별 통계 보기
        </Link>
      }
    >
      {/* md 는 사이드바(280px)로 본문이 좁아 2열, 그 외 sm 부터 4열 — 4글자 라벨이 칸 안에 한 줄로 들게. */}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Link
              href={toRoute(`/manage/clubs/${clubId}/applicants`)}
              className="block h-full min-h-11 rounded-md border border-line bg-paper p-3 transition hover:border-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              <span className="block text-xs text-charcoal-3">{tile.label}</span>
              <span className="mt-1 block text-xl font-bold tabular-nums text-charcoal">{tile.value}</span>
              {tile.sub ? <span className="block break-keep text-[11px] text-charcoal-3">{tile.sub}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
