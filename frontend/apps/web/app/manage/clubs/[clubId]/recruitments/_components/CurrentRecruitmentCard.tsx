'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { RecruitmentSummary } from '@duing/types';
import { useCloseRecruitmentMutation, useRecruitmentStatsSummaryQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { recruitmentPeriodLabel } from '@/app/_lib/recruitmentDisplay';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { DDayBadge } from '@/app/manage/_components/DDayBadge';
import {
  RECRUITMENT_DISPLAY_STATUS_BADGE,
  RECRUITMENT_DISPLAY_STATUS_LABEL,
} from '@/app/manage/_components/dashboard/dashboard-labels';
import { recruitmentStageLabels } from '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentFlowLabel';
import { ExternalRecruitmentActions } from './ExternalRecruitmentActions';
import { CloseRecruitmentConfirmDescription } from './CloseRecruitmentConfirmDescription';

type Props = {
  clubId: number;
  recruitment: RecruitmentSummary;
};

/**
 * 활성 모집 1건의 정체성·액션 허브. 통계 수치는 표시하지 않는다(바로 위 KPI Row 전담).
 * 제목이 상세 페이지 링크다 — 공고 원문·질문 확인, (마감 후) 삭제 등 기존 진입점 보존.
 */
export function CurrentRecruitmentCard({ clubId, recruitment }: Props) {
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const closeRecruitment = useCloseRecruitmentMutation(recruitment.id, clubId);

  const now = new Date();
  const isExternal = recruitment.applicationMode === 'EXTERNAL';
  // 마감 확인 다이얼로그의 미결 지원서 경고용 — 외부 폼은 지원 데이터가 없어 조회하지 않는다.
  // KPI Row·통계 페이지와 같은 훅·쿼리키라 대부분 캐시 재사용이다.
  const { data: statsSummary } = useRecruitmentStatsSummaryQuery(
    isExternal ? undefined : recruitment.id,
  );
  const stageLabels = recruitmentStageLabels(recruitment.useInterview);
  const recruitmentBasePath: `/${string}` = `/manage/clubs/${clubId}/recruitments/${recruitment.id}`;

  async function handleClose() {
    setCloseError(null);
    try {
      await closeRecruitment.mutateAsync();
      setShowCloseConfirm(false);
    } catch (closeFailure) {
      setCloseError(closeFailure instanceof Error ? closeFailure.message : '마감 처리에 실패했습니다.');
    }
  }

  return (
    <div className="card border-l-4 border-l-sage p-6">
      <div className="flex flex-wrap items-center gap-1">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${RECRUITMENT_DISPLAY_STATUS_BADGE[recruitment.displayStatus]}`}
        >
          {RECRUITMENT_DISPLAY_STATUS_LABEL[recruitment.displayStatus]}
        </span>
        <DDayBadge recruitment={recruitment} now={now} />
        <span className="ml-2 text-xs text-charcoal-3">
          {recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)}
        </span>
      </div>

      <h2 className="mt-2">
        <Link href={toRoute(recruitmentBasePath)} className="text-xl font-bold text-ink-deep hover:underline">
          {recruitment.title}
        </Link>
      </h2>

      <div className="mt-3 flex flex-wrap gap-2">
        {stageLabels.map((stage, index) => (
          <span key={stage} className="rounded-full bg-sage-tint px-3 py-1.5 text-xs font-semibold text-charcoal-2">
            {index + 1}. {stage}
          </span>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {/* 외부 폼 모집은 지원서·통계를 쓰지 않는다 — 액션을 가입 링크·가입 요청으로 바꾼다(§5.1). */}
        {isExternal ? (
          <ExternalRecruitmentActions clubId={clubId} recruitment={recruitment} />
        ) : (
          <>
            <Link href={toRoute(`${recruitmentBasePath}/applicants`)} className="btn btn-primary btn-sm">
              지원자 관리
            </Link>
            {recruitment.useInterview && (
              <Link href={toRoute(`${recruitmentBasePath}/interview`)} className="btn btn-secondary btn-sm">
                면접 관리
              </Link>
            )}
            <Link href={toRoute(`${recruitmentBasePath}/stats`)} className="btn btn-secondary btn-sm">
              통계
            </Link>
          </>
        )}
        <span className="ml-auto flex items-center gap-3 text-sm">
          <Link href={toRoute(`${recruitmentBasePath}/edit`)} className="text-charcoal-3 hover:text-charcoal hover:underline">
            모집글 편집
          </Link>
          <button
            type="button"
            onClick={() => setShowCloseConfirm(true)}
            className="text-charcoal-3 hover:text-coral hover:underline"
          >
            모집 종료
          </button>
        </span>
      </div>

      <ConfirmDialog
        open={showCloseConfirm}
        title="모집을 마감할까요?"
        description={
          <CloseRecruitmentConfirmDescription
            applicationMode={recruitment.applicationMode}
            statsSummary={statsSummary}
          />
        }
        confirmLabel="마감"
        isPending={closeRecruitment.isPending}
        errorMessage={closeError}
        onConfirm={handleClose}
        onCancel={() => {
          setShowCloseConfirm(false);
          setCloseError(null);
        }}
      />
    </div>
  );
}
