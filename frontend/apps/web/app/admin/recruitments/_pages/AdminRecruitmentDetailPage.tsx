'use client';

import { useState } from 'react';

import Link from 'next/link';

import { ApiError } from '@duing/api';
import { useAdminRecruitmentDetailQuery, useForceCloseRecruitmentMutation } from '@duing/hooks';
import { formatDateTimeKst } from '@duing/hooks/datetime';
import type { ForceCloseRecruitmentPayload } from '@duing/types';

import { useToast } from '@/app/_components/toast/ToastProvider';
import { recruitmentPeriodLabel } from '@/app/_lib/recruitmentDisplay';
import { toRoute } from '@/app/_lib/route';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { ConsoleCard } from '../../_components/ConsoleCard';
import { ErrorState } from '../../_components/ErrorState';
import { AdminExternalRecruitmentPanel } from '../_components/AdminExternalRecruitmentPanel';
import { AdminForceCloseDialog } from '../_components/AdminForceCloseDialog';
import {
  RECRUITMENT_STATUS_BADGE_CLASS,
  RECRUITMENT_STATUS_LABEL,
  applicationModeLabel,
} from '../_lib/recruitmentLabels';

type Props = {
  recruitmentId: number;
};

// 서버는 이미 마감된 모집을 409 로 막는다. 그 사이 다른 관리자가 먼저 마감했다는 뜻이라 재시도가 아니라
// 상태를 다시 읽어야 한다는 안내를 준다.
function forceCloseErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return '이미 마감된 모집입니다.';
  // ApiError 만 서버가 준 한글 사유를 담는다 — 네트워크/런타임 Error 의 영문 메시지는 폴백으로 가린다.
  if (error instanceof ApiError) return error.message;
  return '모집 마감에 실패했어요. 잠시 후 다시 시도해주세요.';
}

export function AdminRecruitmentDetailPage({ recruitmentId }: Props) {
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [closeErrorMessage, setCloseErrorMessage] = useState<string | null>(null);
  const { addToast } = useToast();

  const detailQuery = useAdminRecruitmentDetailQuery(recruitmentId);
  const forceClose = useForceCloseRecruitmentMutation();

  const recruitment = detailQuery.data;

  const handleForceClose = (payload: ForceCloseRecruitmentPayload) => {
    setCloseErrorMessage(null);
    forceClose.mutate(
      { recruitmentId, payload },
      {
        onSuccess: () => {
          addToast('모집을 마감했습니다.');
          setIsCloseDialogOpen(false);
        },
        // 실패해도 닫지 않는다 — 사유를 다시 치게 만들지 않고 그 자리에서 재시도할 수 있다.
        onError: (error) => setCloseErrorMessage(forceCloseErrorMessage(error)),
      },
    );
  };

  return (
    <main className="max-w-layout mx-auto px-4 py-10 sm:px-6 md:px-10">
      <header className="mb-6 flex items-center gap-3">
        <Link href={toRoute('/admin/recruitments')} className="text-[13px] text-charcoal-2 hover:text-ink">
          ← 목록으로
        </Link>
        <h1 className="text-[22px] font-bold text-ink">모집 상세</h1>
      </header>

      {detailQuery.isLoading && (
        <ListRowsSkeleton rows={4} rowClassName="h-12 rounded-md" label="모집 조회 중" />
      )}

      {(detailQuery.isError || (detailQuery.isSuccess && !recruitment)) && (
        <ConsoleCard>
          <ErrorState
            message="모집을 불러오지 못했어요."
            onRetry={() => void detailQuery.refetch()}
          />
        </ConsoleCard>
      )}

      {recruitment && (
        <>
          <ConsoleCard className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-charcoal-2">{recruitment.clubName}</p>
                <h2 className="mt-1 break-keep text-[18px] font-bold text-ink-deep">
                  {recruitment.title}
                </h2>
              </div>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                  RECRUITMENT_STATUS_BADGE_CLASS[recruitment.status]
                }`}
              >
                {RECRUITMENT_STATUS_LABEL[recruitment.status]}
              </span>
            </div>

            <dl className="mt-5 grid grid-cols-1 gap-4 text-[13.5px] sm:grid-cols-2">
              <MetaRow label="지원 방식">
                {applicationModeLabel(recruitment.applicationMode, recruitment.externalFormUrl)}
              </MetaRow>
              {/* 외부 폼 모집은 두잉에 지원 데이터가 없다 — 0 으로 적으면 "아무도 안 냈다"로 읽힌다. */}
              <MetaRow label="지원자 수">
                {recruitment.applicantCount === null ? '—' : `${recruitment.applicantCount}명`}
              </MetaRow>
              <MetaRow label="모집 기간">
                {recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)}
              </MetaRow>
              <MetaRow label="마지막 수정">{formatDateTimeKst(recruitment.updatedAt)}</MetaRow>
            </dl>

            {/* 강제 마감 가능 여부는 서버 상태만 본다 — 기간 경과 여부는 화면 파생값이라 판단 근거가 못 된다. */}
            {recruitment.status === 'OPEN' && (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setCloseErrorMessage(null);
                    setIsCloseDialogOpen(true);
                  }}
                  className="btn btn-danger btn-sm"
                >
                  강제 마감
                </button>
              </div>
            )}
          </ConsoleCard>

          {recruitment.applicationMode === 'EXTERNAL' && (
            <AdminExternalRecruitmentPanel recruitment={recruitment} />
          )}

          {isCloseDialogOpen && (
            <AdminForceCloseDialog
              recruitment={recruitment}
              isPending={forceClose.isPending}
              errorMessage={closeErrorMessage}
              onConfirm={handleForceClose}
              onCancel={() => {
                setIsCloseDialogOpen(false);
                setCloseErrorMessage(null);
              }}
            />
          )}
        </>
      )}
    </main>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] font-semibold text-charcoal-2">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
