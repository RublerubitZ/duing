'use client';

import { use, useEffect } from 'react';
import Link from 'next/link';
import { useClubRecruitmentsQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { recruitmentPeriodLabel } from '@/app/_lib/recruitmentDisplay';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { recruitmentClosedLabel, sortPastRecruitments } from '../_lib/sortPastRecruitments';

/**
 * 지원현황의 클럽 단위 진입점 — 자체 화면이라기보다 라우터다(스펙 §2).
 * 진행 중 모집이 있으면 그 모집의 지원현황으로 넘기고, 없을 때만 이 화면이 렌더된다.
 * 권한 게이트는 상위 manage layout 이 이미 커버하므로 여기서 다시 검사하지 않는다.
 */
export default function ClubApplicantsEntryPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const router = useGuardedRouter();

  const recruitmentsQuery = useClubRecruitmentsQuery(isNaN(clubId) ? undefined : clubId);
  const recruitments = recruitmentsQuery.data ?? [];

  // "진행 중" = raw status OPEN + 자체 폼(스펙 §1-2). 마감일이 지났어도 수동 마감 전이면
  // 심사 진행 중이므로 displayStatus 가 아니라 raw status 로 판정한다.
  // 백엔드 정렬이 OPEN 우선·startDate desc 라 첫 항목이 최신 진행 중 모집이다.
  const activeSelfRecruitment =
    recruitments.find(
      (recruitment) => recruitment.status === 'OPEN' && recruitment.applicationMode === 'SELF',
    ) ?? null;
  const redirectTargetId = activeSelfRecruitment?.id ?? null;

  useEffect(() => {
    if (redirectTargetId === null) return;
    router.replace(toRoute(`/manage/clubs/${clubId}/recruitments/${redirectTargetId}/applicants`));
  }, [clubId, redirectTargetId, router]);

  if (recruitmentsQuery.isLoading) {
    return <LoadingGate label="모집 목록 불러오는 중" />;
  }

  // 조회 실패를 Empty State 로 떨어뜨리면 장애 중에 "새 모집을 등록해 주세요" 로 오인시킨다(스펙 §2-4).
  // 백그라운드 refetch 실패(이전 데이터 보유)는 화면을 유지한다.
  if (recruitmentsQuery.isError && recruitmentsQuery.data === undefined) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div role="alert" className="text-sm text-charcoal-2">
          <p>모집 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
          <button
            type="button"
            className="btn btn-ghost mt-2"
            onClick={() => void recruitmentsQuery.refetch()}
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  // 이동이 확정된 상태에서 Empty State 를 한 프레임 깜빡이지 않도록 게이트를 유지한다.
  if (redirectTargetId !== null) {
    return <LoadingGate label="지원현황으로 이동하는 중" />;
  }

  // 여기 도달했다면 진행 중 자체 폼 모집이 없다 — OPEN 이 남아 있다면 외부 폼뿐이라는 뜻.
  const hasExternalOpenRecruitment = recruitments.some(
    (recruitment) => recruitment.status === 'OPEN' && recruitment.applicationMode === 'EXTERNAL',
  );
  const emptyState = hasExternalOpenRecruitment
    ? {
        title: '진행 중인 모집이 외부 폼으로 운영되고 있어요.',
        description: '외부 폼 모집은 지원자 관리를 사용하지 않아요.',
        ctaLabel: '모집 관리로 이동',
        ctaHref: toRoute(`/manage/clubs/${clubId}/recruitments`),
      }
    : {
        title: '현재 진행 중인 모집이 없습니다.',
        description: '새 모집을 등록해 주세요.',
        ctaLabel: '새 모집 등록',
        ctaHref: toRoute(`/manage/clubs/${clubId}/recruitments/new`),
      };

  // 아카이브는 읽기 전용 관점의 raw CLOSED 기준(스펙 §3) — 외부 폼은 지원자 관리 대상이 아니라 제외.
  const pastRecruitments = sortPastRecruitments(
    recruitments.filter(
      (recruitment) => recruitment.status === 'CLOSED' && recruitment.applicationMode === 'SELF',
    ),
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-6 text-xl font-bold text-ink-deep">지원현황</h1>

      <div className="rounded-[20px] border border-dashed border-line bg-paper px-6 py-10 text-center">
        <p className="text-3xl">📭</p>
        <p className="mt-3 text-[15.5px] font-bold text-ink-deep">{emptyState.title}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-charcoal-3">{emptyState.description}</p>
        <Link href={emptyState.ctaHref} className="btn btn-primary mt-5 inline-flex">
          {emptyState.ctaLabel}
        </Link>
      </div>

      <section className="mt-8">
        <h2 className="mb-2.5 text-sm font-bold tracking-wide text-ink-deep">
          지난 모집 <span className="ml-1 font-medium text-charcoal-3">{pastRecruitments.length}</span>
        </h2>
        {pastRecruitments.length === 0 ? (
          <p className="rounded-md bg-graysoft py-6 text-center text-sm text-charcoal-3">
            아직 마감된 모집이 없어요.
          </p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {pastRecruitments.map((recruitment) => (
              <li
                key={recruitment.id}
                className="flex items-center justify-between gap-3 px-4 py-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-deep">{recruitment.title}</p>
                  <p className="mt-0.5 tabular-nums text-xs text-charcoal-3">
                    {recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)}
                    {recruitmentClosedLabel(recruitment) !== null &&
                      ` · ${recruitmentClosedLabel(recruitment)}`}
                  </p>
                </div>
                <Link
                  href={toRoute(
                    `/manage/clubs/${clubId}/recruitments/${recruitment.id}/applicants`,
                  )}
                  className="btn btn-secondary btn-sm shrink-0"
                >
                  지원자 보기
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
