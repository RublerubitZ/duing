'use client';

import Link from 'next/link';
import { ApiError } from '@duing/api';
import { useInterviewConfigQuery, useInterviewSlotsQuery } from '@duing/hooks';
import { toRoute } from '../../../../../../../_lib/route';
import { deriveInterviewStep } from '../_utils/deriveInterviewStep';
import { InterviewProgressStepper } from '../_components/InterviewProgressStepper';
import { InterviewConfigSection } from '../_components/InterviewConfigSection';
import { SectionPlaceholder } from '../_components/SectionPlaceholder';

type Props = {
  clubId: number;
  recruitmentId: number;
};

// spec §4 — 면접 관리 페이지. server state(config+slots) 기반으로 step 을 자동 도출하고,
// 진입 가능한 단계만 활성화한다. 비활성 단계는 SectionPlaceholder 로 시각화.
export function InterviewManagementPage({ clubId, recruitmentId }: Props) {
  const configQuery = useInterviewConfigQuery(recruitmentId);
  const slotsQuery = useInterviewSlotsQuery(recruitmentId);

  // config 가 없는 신규 모집은 404 가 정상 경로. 그 외 에러만 noisy 로 처리.
  const configNotFound =
    configQuery.isError &&
    configQuery.error instanceof ApiError &&
    configQuery.error.status === 404;
  const configFatalError = configQuery.isError && !configNotFound;

  if (configQuery.isLoading || slotsQuery.isLoading) {
    return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  }

  if (configFatalError) {
    const message =
      configQuery.error instanceof ApiError
        ? configQuery.error.message
        : '면접 설정을 불러오지 못했습니다.';
    return <p className="p-6 text-sm text-rose-600">{message}</p>;
  }

  if (slotsQuery.isError) {
    const message =
      slotsQuery.error instanceof ApiError
        ? slotsQuery.error.message
        : '면접 슬롯을 불러오지 못했습니다.';
    return <p className="p-6 text-sm text-rose-600">{message}</p>;
  }

  const currentStep = deriveInterviewStep({
    config: configQuery.data ?? null,
    slots: slotsQuery.data ?? [],
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex flex-col gap-1">
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}`)}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← 모집 상세로 돌아가기
        </Link>
        <h1 className="text-xl font-bold text-slate-900">면접 관리</h1>
      </div>

      <div className="mb-6">
        <InterviewProgressStepper currentStep={currentStep} />
      </div>

      <div className="space-y-6">
        <InterviewConfigSection
          recruitmentId={recruitmentId}
          config={configQuery.data ?? null}
        />

        {currentStep >= 2 ? (
          <SectionPlaceholder
            stepNumber={2}
            title="슬롯 관리"
            reason="PR-FE2 에서 추가됩니다."
          />
        ) : (
          <SectionPlaceholder
            stepNumber={2}
            title="슬롯 관리"
            reason="면접 설정을 먼저 완료해주세요."
          />
        )}

        <SectionPlaceholder
          stepNumber={3}
          title="자동 배정"
          reason="PR-FE3 에서 추가됩니다."
        />
        <SectionPlaceholder
          stepNumber={4}
          title="일정 관리"
          reason="PR-FE3 에서 추가됩니다."
        />
      </div>
    </div>
  );
}
