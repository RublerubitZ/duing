'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { RecruitmentSummary } from '@duing/types';
import {
  useCloseRecruitmentMutation,
  useRecruitmentStatsSummaryQuery,
  useStopRecruitmentIntakeMutation,
} from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import {
  isRecruitmentExpiredOpen,
  recruitmentExpiredOpenNotice,
  recruitmentPeriodLabel,
  recruitmentStatusChip,
} from '@/app/_lib/recruitmentDisplay';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { DDayBadge } from '@/app/manage/_components/DDayBadge';
import { recruitmentStageLabels } from '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentFlowLabel';
import { stopIntakeGate } from '@/app/manage/clubs/[clubId]/recruitments/_lib/stopIntakeGate';
import { ExternalRecruitmentActions } from './ExternalRecruitmentActions';
import { CloseRecruitmentConfirmDescription } from './CloseRecruitmentConfirmDescription';
import { StopIntakeConfirmDescription } from './StopIntakeConfirmDescription';

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
  const [showStopIntakeConfirm, setShowStopIntakeConfirm] = useState(false);
  const [stopIntakeError, setStopIntakeError] = useState<string | null>(null);

  const closeRecruitment = useCloseRecruitmentMutation(recruitment.id, clubId);
  const stopIntake = useStopRecruitmentIntakeMutation(recruitment.id, clubId);

  const now = new Date();
  const isExternal = recruitment.applicationMode === 'EXTERNAL';
  // 마감일은 지났지만 수동 마감 전 — 카드는 그대로 두되(마감·편집 액션이 여기 있다) 칩과 안내 문구로
  // 캠페인 기간이 끝났고 심사만 남았음을 드러낸다.
  const isExpiredOpen = isRecruitmentExpiredOpen(recruitment);
  const statusChip = recruitmentStatusChip(recruitment);
  // 마감 확인 다이얼로그의 미결 지원서 경고용 — 외부 폼은 지원 데이터가 없어 조회하지 않는다.
  // KPI Row·통계 페이지와 같은 훅·쿼리키라 대부분 캐시 재사용이다.
  const { data: statsSummary } = useRecruitmentStatsSummaryQuery(
    isExternal ? undefined : recruitment.id,
  );
  const stageLabels = recruitmentStageLabels(recruitment.useInterview);
  // 접수 마감(신규 지원만 차단·심사 계속)은 상시모집 전용 — 시작일 다음 날(KST)부터 활성화된다.
  const stopIntakeAction = stopIntakeGate(recruitment, now);
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

  async function handleStopIntake() {
    setStopIntakeError(null);
    try {
      await stopIntake.mutateAsync();
      setShowStopIntakeConfirm(false);
    } catch (stopIntakeFailure) {
      setStopIntakeError(
        stopIntakeFailure instanceof Error ? stopIntakeFailure.message : '접수 마감 처리에 실패했습니다.',
      );
    }
  }

  return (
    <div className="card border-l-4 border-l-sage p-6">
      <div className="flex flex-wrap items-center gap-1">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusChip.badgeClass}`}>
          {statusChip.label}
        </span>
        <DDayBadge recruitment={recruitment} now={now} />
        <span className="ml-2 text-xs text-charcoal-3">
          {recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)}
        </span>
      </div>

      {/* 데이터 로드 후 나타나는 행동 요청이라 라이브 리전으로 알린다 */}
      {isExpiredOpen && (
        <p role="status" className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          {recruitmentExpiredOpenNotice(recruitment.applicationMode)}
        </p>
      )}

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
          {stopIntakeAction.visible && (
            <button
              type="button"
              disabled={!stopIntakeAction.enabled}
              aria-describedby={stopIntakeAction.enabled ? undefined : 'stop-intake-too-early'}
              onClick={() => setShowStopIntakeConfirm(true)}
              className="text-charcoal-3 hover:text-coral hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-charcoal-3 disabled:hover:no-underline"
            >
              접수 마감
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowCloseConfirm(true)}
            className="text-charcoal-3 hover:text-coral hover:underline"
          >
            모집 종료
          </button>
        </span>
      </div>

      {stopIntakeAction.visible && !stopIntakeAction.enabled && (
        <p id="stop-intake-too-early" className="mt-2 text-xs text-charcoal-3">
          모집 시작일 다음 날부터 접수를 마감할 수 있습니다. 오늘 바로 끝내야 한다면 모집 종료를
          이용해주세요.
        </p>
      )}

      <ConfirmDialog
        open={showStopIntakeConfirm}
        title="접수를 마감할까요?"
        description={<StopIntakeConfirmDescription applicationMode={recruitment.applicationMode} />}
        confirmLabel="접수 마감"
        isPending={stopIntake.isPending}
        errorMessage={stopIntakeError}
        onConfirm={handleStopIntake}
        onCancel={() => {
          setShowStopIntakeConfirm(false);
          setStopIntakeError(null);
        }}
      />

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
