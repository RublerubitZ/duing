'use client';

import Link from 'next/link';
import { ApiError } from '@duing/api';
import {
  useInterviewConfigQuery,
  useInterviewSchedulesQuery,
  useInterviewSlotsQuery,
  useMatchingCandidatesQuery,
  useRecruitmentDetailQuery,
} from '@duing/hooks';
import type { InterviewSlotLifecyclePhase } from '@duing/types';
import { toRoute } from '../../../../../../../_lib/route';
import { deriveInterviewStep } from '../_utils/deriveInterviewStep';
import { InterviewProgressStepper } from '../_components/InterviewProgressStepper';
import { InterviewConfigSection } from '../_components/InterviewConfigSection';
import { InterviewSlotSection } from '../_components/InterviewSlotSection';
import { InterviewAutoAssignSection } from '../_components/InterviewAutoAssignSection';
import { InterviewScheduleManagementSection } from '../_components/InterviewScheduleManagementSection';
import { SectionPlaceholder } from '../_components/SectionPlaceholder';

type Props = {
  clubId: number;
  recruitmentId: number;
};

// spec §4 — 면접 관리 페이지. server state(config + slots + candidates + schedules) 기반으로
// step 을 자동 도출하고 진입 가능한 단계만 활성화한다. 비활성 단계는 SectionPlaceholder.
//
// page-level 에서 모든 query 를 모아 Section 으로 props 전달 — 다중 observer retry-loop 회피.
//   - candidates / schedules 는 Step 3, 4 에서만 의미가 있어 enabled 플래그로 조건부 fetch.
export function InterviewManagementPage({ clubId, recruitmentId }: Props) {
  const configQuery = useInterviewConfigQuery(recruitmentId);
  const slotsQuery = useInterviewSlotsQuery(recruitmentId);
  const recruitmentDetailQuery = useRecruitmentDetailQuery(recruitmentId);

  // Step 3 / 4 에서만 필요한 데이터는 enabled 로 조건부 fetch 한다.
  // step 도출에 config + slots 가 필요하므로 둘 다 로드된 후에만 활성화한다.
  const stepReady = !configQuery.isLoading && !slotsQuery.isLoading;
  const currentStepProbe = stepReady
    ? deriveInterviewStep({
        config: configQuery.data ?? null,
        slots: slotsQuery.data ?? [],
      })
    : 1;
  const candidatesQuery = useMatchingCandidatesQuery(recruitmentId, {
    enabled: stepReady && currentStepProbe >= 3,
  });
  const schedulesQuery = useInterviewSchedulesQuery(recruitmentId, {
    enabled: stepReady && currentStepProbe >= 4,
  });

  // config 가 없는 신규 모집은 404 가 정상 경로. 그 외 에러만 noisy 로 처리.
  const configNotFound =
    configQuery.isError &&
    configQuery.error instanceof ApiError &&
    configQuery.error.status === 404;
  const configFatalError = configQuery.isError && !configNotFound;

  if (
    configQuery.isLoading ||
    slotsQuery.isLoading ||
    recruitmentDetailQuery.isLoading
  ) {
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

  if (recruitmentDetailQuery.isError) {
    const message =
      recruitmentDetailQuery.error instanceof ApiError
        ? recruitmentDetailQuery.error.message
        : '모집 정보를 불러오지 못했습니다.';
    return <p className="p-6 text-sm text-rose-600">{message}</p>;
  }

  const currentStep = currentStepProbe;
  const slots = slotsQuery.data ?? [];
  const recruitment = recruitmentDetailQuery.data;
  const config = configQuery.data ?? null;
  const candidates = candidatesQuery.data ?? null;
  const schedules = schedulesQuery.data ?? [];
  const assignmentCompletedAt = config?.assignmentCompletedAt ?? null;
  const alreadyAssigned = assignmentCompletedAt !== null;

  // Step 2(슬롯 관리) 의 phase 가드 — config 가 없으면 신규 모집 (Step 1) 이라 phase UI 자체가 렌더되지 않음.
  // SlotSection 진입 자체가 config 존재를 전제로 하므로 fallback `BEFORE_DEADLINE` 은 안전한 기본값.
  const slotLifecyclePhase: InterviewSlotLifecyclePhase =
    config?.slotLifecyclePhase ?? 'BEFORE_DEADLINE';
  const phaseLabel = phaseLabelOf(slotLifecyclePhase);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex flex-col gap-1">
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}`)}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← 모집 상세로 돌아가기
        </Link>
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-xl font-bold text-slate-900">면접 관리</h1>
          <div className="flex items-center gap-3">
            {config && (
              <span className="text-xs text-slate-500">현재: {phaseLabel}</span>
            )}
            <Link
              href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview/rounds/new`)}
              className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
            >
              새 면접 라운드 만들기
            </Link>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <InterviewProgressStepper currentStep={currentStep} />
      </div>

      <div className="space-y-6">
        <InterviewConfigSection
          recruitmentId={recruitmentId}
          config={config}
          recruitmentStartDate={recruitment?.startDate ?? null}
        />

        {currentStep >= 2 && recruitment ? (
          <InterviewSlotSection
            recruitmentId={recruitmentId}
            slotLifecyclePhase={slotLifecyclePhase}
            slots={slots}
          />
        ) : (
          <SectionPlaceholder
            stepNumber={2}
            title="슬롯 관리"
            reason="면접 설정을 먼저 완료해주세요."
          />
        )}

        {currentStep >= 3 ? (
          candidatesQuery.isLoading || !candidates ? (
            <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
              자동 배정 정보를 불러오는 중…
            </p>
          ) : (
            <InterviewAutoAssignSection
              recruitmentId={recruitmentId}
              candidates={candidates}
              alreadyAssigned={alreadyAssigned}
              assignmentCompletedAt={assignmentCompletedAt}
            />
          )
        ) : (
          <SectionPlaceholder
            stepNumber={3}
            title="자동 배정"
            reason="가능시간 제출 마감 후 활성화됩니다."
          />
        )}

        {currentStep >= 4 ? (
          schedulesQuery.isLoading ? (
            <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
              일정 정보를 불러오는 중…
            </p>
          ) : (
            <InterviewScheduleManagementSection
              recruitmentId={recruitmentId}
              schedules={schedules}
              config={config}
              slots={slots}
            />
          )
        ) : (
          <SectionPlaceholder
            stepNumber={4}
            title="일정 관리"
            reason="자동 배정 완료 후 활성화됩니다."
          />
        )}
      </div>
    </div>
  );
}

// phase 헤더 라벨 — 운영진이 다음 phase 진입 조건/시점을 명확히 인지하도록 노출.
function phaseLabelOf(phase: InterviewSlotLifecyclePhase): string {
  switch (phase) {
    case 'BEFORE_DEADLINE':
      return '면접 가능시간 제출 단계';
    case 'AFTER_DEADLINE_BEFORE_ASSIGNMENT':
      return '운영진 배정 준비 단계';
    case 'AFTER_ASSIGNMENT':
      return '자동배정 완료 — 슬롯 잠금';
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}
